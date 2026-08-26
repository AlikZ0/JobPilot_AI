import { beforeEach, describe, expect, it } from 'vitest';
import { JobPilotDatabase, getDb, setDb } from '@/database/db';
import {
  BASE_RESUME_ID,
  createResumeVersion,
  deleteResumeVersion,
  getPrimaryResume,
  getTailoredResume,
  listResumeVersions,
  saveTailoredResume,
  setPrimaryResume,
  updateResumeVersion,
} from '@/database/repositories/resumeRepository';
import { rankResumeVersions } from '@/core/resume/matchVersions';
import { tailoredResumeSchema } from '@/types/resume';
import type { ResumeRecord } from '@/types/resume';
import { makeProfile } from '../fixtures/profile';
import { makeJob } from '../fixtures/jobs';

let counter = 0;
beforeEach(() => {
  counter += 1;
  setDb(new JobPilotDatabase(`jobpilot-resume-${counter}`));
});

describe('варианты резюме', () => {
  it('первый вариант занимает исторический идентификатор и становится основным', async () => {
    const first = await createResumeVersion({ name: 'Фронтенд', text: 'Vue, TypeScript' });
    expect(first.id).toBe(BASE_RESUME_ID);
    expect(first.primary).toBe(true);

    const second = await createResumeVersion({ name: 'Тимлид', text: 'Управление командой' });
    expect(second.id).not.toBe(BASE_RESUME_ID);
    expect(second.primary).toBe(false);
  });

  it('основной ровно один, отметка переходит целиком', async () => {
    const a = await createResumeVersion({ name: 'A', text: 'a' });
    const b = await createResumeVersion({ name: 'B', text: 'b' });

    await setPrimaryResume(b.id);
    const versions = await listResumeVersions();
    expect(versions.filter((row) => row.primary).map((row) => row.id)).toEqual([b.id]);
    expect((await getPrimaryResume())?.id).toBe(b.id);
    expect(versions.find((row) => row.id === a.id)?.primary).toBe(false);
  });

  it('основной идёт первым в списке', async () => {
    await createResumeVersion({ name: 'Я последний по алфавиту', text: 'x' });
    const b = await createResumeVersion({ name: 'А первый по алфавиту', text: 'y' });
    await setPrimaryResume(b.id);
    expect((await listResumeVersions())[0]?.id).toBe(b.id);
  });

  it('записи из старой базы читаются как вариант «Основное»', async () => {
    // Так выглядела запись до появления вариантов: без name, baseId и primary.
    const legacy = {
      id: BASE_RESUME_ID,
      text: 'старое резюме',
      fileName: 'cv.pdf',
      source: 'pdf',
      pages: 2,
      charsPerPage: 1800,
      createdAt: 1,
      updatedAt: 2,
      jobId: null,
      tailored: null,
      userEdited: false,
    } as unknown as ResumeRecord;
    await getDb().resumes.put(legacy);

    const versions = await listResumeVersions();
    expect(versions).toHaveLength(1);
    expect(versions[0]?.name).toBe('Основное');
    expect(versions[0]?.primary).toBe(true);
    expect(versions[0]?.text).toBe('старое резюме');
  });

  it('удаление уносит собранные из варианта резюме под вакансии', async () => {
    const version = await createResumeVersion({ name: 'Фронтенд', text: 'Vue' });
    await saveTailoredResume('job1', tailoredResumeSchema.parse({}), { baseId: version.id });
    expect(await getTailoredResume('job1')).not.toBeNull();

    await deleteResumeVersion(version.id);
    expect(await listResumeVersions()).toHaveLength(0);
    expect(await getTailoredResume('job1')).toBeNull();
  });

  it('после удаления основного отметка переходит к оставшемуся', async () => {
    const a = await createResumeVersion({ name: 'A', text: 'a' });
    const b = await createResumeVersion({ name: 'B', text: 'b' });
    await deleteResumeVersion(a.id);
    expect((await getPrimaryResume())?.id).toBe(b.id);
  });

  it('подгонка запоминает, из какого варианта собрана', async () => {
    await createResumeVersion({ name: 'Фронтенд', text: 'Vue' });
    const lead = await createResumeVersion({ name: 'Тимлид', text: 'Управление' });
    const saved = await saveTailoredResume('job1', tailoredResumeSchema.parse({}), {
      baseId: lead.id,
    });
    expect(saved.baseId).toBe(lead.id);
    expect(saved.text).toBe('Управление');
  });

  it('правка варианта не создаёт новую запись', async () => {
    const version = await createResumeVersion({ name: 'Фронтенд', text: 'Vue' });
    await updateResumeVersion(version.id, { text: 'Vue, TypeScript' });
    const versions = await listResumeVersions();
    expect(versions).toHaveLength(1);
    expect(versions[0]?.text).toBe('Vue, TypeScript');
  });
});

describe('подбор варианта под вакансию', () => {
  const profile = makeProfile();
  const job = makeJob();

  it('выше тот вариант, где требований вакансии написано больше', async () => {
    const versions = [
      { id: 'a', name: 'Пустой', text: 'Работал где-то, делал что-то.' },
      {
        id: 'b',
        name: 'Подробный',
        text: 'Node.js, TypeScript, Docker, Vue, AWS — строил REST API и менторил разработчиков.',
      },
    ] as ResumeRecord[];

    const ranked = rankResumeVersions(job, profile, versions);
    expect(ranked[0]?.id).toBe('b');
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });

  it('процент не выходит за границы, а пустой текст даёт ноль', () => {
    const ranked = rankResumeVersions(job, profile, [
      { id: 'a', name: 'Пустой', text: '' },
    ] as ResumeRecord[]);
    expect(ranked[0]?.score).toBe(0);
    expect(ranked[0]?.score).toBeLessThanOrEqual(100);
  });

  it('без вариантов ранжировать нечего', () => {
    expect(rankResumeVersions(job, profile, [])).toEqual([]);
  });
});
