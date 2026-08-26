import { describe, expect, it } from 'vitest';
import { applicationSchema, type Application } from '@/types/application';
import { jobSchema, type Job } from '@/types/job';
import { fingerprintOf } from '@/core/extraction/fingerprint';
import {
  buildReportRows,
  mostDemandedSkills,
  reportFileName,
  reportToCsv,
  reportToMarkdown,
  statsBySource,
  summarizeWeek,
} from '@/core/pipeline/report';
import { DAY_MS } from '@/utils/time';
import { makeJob } from '../fixtures/jobs';

const NOW = 1_800_000_000_000;

function job(overrides: Partial<Job> = {}): Job {
  const extracted = makeJob();
  return jobSchema.parse({
    ...extracted,
    id: `job_${Math.random().toString(36).slice(2)}`,
    fingerprint: fingerprintOf(extracted),
    discoveredAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function application(overrides: Partial<Application> = {}): Application {
  return applicationSchema.parse({
    id: `app_${Math.random().toString(36).slice(2)}`,
    jobId: 'job1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

describe('сводка за неделю', () => {
  it('считает только то, что попало в период', () => {
    const summary = summarizeWeek(
      [job({ analyzedAt: NOW - DAY_MS }), job({ analyzedAt: NOW - 30 * DAY_MS })],
      [
        application({ submittedAt: NOW - 2 * DAY_MS }),
        application({ submittedAt: NOW - 20 * DAY_MS }),
      ],
      NOW,
    );
    expect(summary.analyzed).toBe(1);
    expect(summary.submitted).toBe(1);
  });

  it('ответ на старый отклик относится к той неделе, когда пришёл', () => {
    const summary = summarizeWeek(
      [],
      [
        application({
          submittedAt: NOW - 40 * DAY_MS,
          outcomeAt: { replied: NOW - DAY_MS, interview: NOW - 2 * DAY_MS },
        }),
      ],
      NOW,
    );
    expect(summary.submitted).toBe(0);
    expect(summary.replies).toBe(1);
    expect(summary.interviews).toBe(1);
  });

  it('пустая база даёт нули, а не ошибку', () => {
    expect(summarizeWeek([], [], NOW)).toEqual({
      analyzed: 0,
      submitted: 0,
      replies: 0,
      interviews: 0,
      offers: 0,
    });
  });
});

describe('разбор по источникам', () => {
  it('группирует по адресу, а не по адаптеру', () => {
    const stats = statsBySource(
      [
        job({ url: 'https://hh.ru/vacancy/1', source: 'generic', score: 80 }),
        job({ url: 'https://hh.ru/vacancy/2', source: 'generic', score: 60 }),
        job({ url: 'https://www.linkedin.com/jobs/3', source: 'linkedin', score: 90 }),
      ],
      [],
    );
    expect(stats.map((row) => row.source)).toEqual(['hh.ru', 'linkedin.com']);
    expect(stats[0]?.averageScore).toBe(70);
  });

  it('без проанализированных средний балл не выдумывается', () => {
    const stats = statsBySource([job({ url: 'https://a.com/1', score: null })], []);
    expect(stats[0]?.averageScore).toBeNull();
  });

  it('считает отправленные отклики по источнику', () => {
    const target = job({ url: 'https://hh.ru/1', score: 70 });
    const stats = statsBySource(
      [target, job({ url: 'https://hh.ru/2', score: 70 })],
      [application({ jobId: target.id, submittedAt: NOW })],
    );
    expect(stats[0]?.submitted).toBe(1);
  });
});

describe('чаще всего требуют', () => {
  it('технология внутри вакансии считается один раз', () => {
    const top = mostDemandedSkills([
      job({ technologies: ['TypeScript', 'typescript', 'ts', 'Docker'] }),
      job({ technologies: ['TypeScript'] }),
    ]);
    expect(top[0]).toEqual({ skill: 'TypeScript', count: 2 });
    expect(top.find((row) => row.skill === 'Docker')?.count).toBe(1);
  });

  it('длина списка ограничена', () => {
    expect(mostDemandedSkills([job({ technologies: ['A', 'B', 'C'] })], 2)).toHaveLength(2);
  });
});

describe('выгрузка откликов', () => {
  const sent = job({ title: 'Senior "Frontend" Engineer', company: 'Acme; Ltd', score: 88 });
  const rows = () =>
    buildReportRows(
      [sent],
      [
        application({
          jobId: sent.id,
          submittedAt: NOW - DAY_MS,
          outcome: 'interview',
          outcomeAt: { replied: NOW - 12 * 3600_000, interview: NOW },
        }),
        application({ jobId: sent.id, submittedAt: null }),
      ],
    );

  it('черновики в отчёт не попадают', () => {
    expect(rows()).toHaveLength(1);
  });

  it('CSV начинается с BOM и разделён точкой с запятой', () => {
    const csv = reportToCsv(rows());
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv.split('\r\n')[0]).toContain('Дата отправки;Должность');
  });

  it('кавычки и разделители в тексте не ломают колонки', () => {
    const line = reportToCsv(rows()).split('\r\n')[1] ?? '';
    expect(line).toContain('"Senior ""Frontend"" Engineer"');
    expect(line).toContain('"Acme; Ltd"');
    // Шапка и одна строка данных: разделители внутри ячеек не создали новых.
    expect(reportToCsv(rows()).trimEnd().split('\r\n')).toHaveLength(2);
  });

  it('в Markdown вертикальная черта экранируется', () => {
    const piped = job({ title: 'Dev | Ops', company: 'Acme' });
    const md = reportToMarkdown(
      buildReportRows([piped], [application({ jobId: piped.id, submittedAt: NOW })]),
      summarizeWeek([], [], NOW),
    );
    expect(md).toContain('Dev \\| Ops');
    expect(md).toContain('| Дата | Должность |');
  });

  it('имя файла содержит дату', () => {
    expect(reportFileName('csv', new Date('2026-08-26T10:00:00Z'))).toBe(
      'jobpilot-otkliki-2026-08-26.csv',
    );
  });
});
