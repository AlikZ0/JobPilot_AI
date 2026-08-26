import { beforeEach, describe, expect, it } from 'vitest';
import { JobPilotDatabase, getDb, setDb } from '@/database/db';
import { listJobs } from '@/database/repositories/jobRepository';
import { canTransitionJob } from '@/core/state/jobState';
import { collectTags } from '@/core/pipeline/triage';
import type { Job } from '@/types/job';

let counter = 0;
beforeEach(() => {
  counter += 1;
  setDb(new JobPilotDatabase(`jobpilot-legacy-${counter}`));
});

describe('вакансии из старой базы', () => {
  it('читаются с пометками по умолчанию, а не с undefined', async () => {
    // Так запись выглядела до появления пометок.
    await getDb().jobs.put({
      id: 'j1',
      fingerprint: 'c:1',
      state: 'analyzed',
      priority: 'normal',
      score: 80,
      discoveredAt: 1,
      updatedAt: 1,
      analyzedAt: 1,
      savedAt: null,
      duplicateOf: null,
      notes: '',
      error: '',
      scanSessionId: null,
      title: 'Vue Developer',
      company: 'Acme',
      companyUrl: '',
      url: 'https://a.com/1',
      description: 'd',
      requirements: [],
      responsibilities: [],
      benefits: [],
      salary: { min: null, max: null, currency: '', period: 'unknown', raw: '' },
      location: '',
      country: '',
      city: '',
      workMode: 'unknown',
      seniority: 'unknown',
      employmentType: 'unknown',
      technologies: [],
      languageRequirements: [],
      postedAt: '',
      applyUrl: '',
      source: 'generic',
      fieldSources: {},
      extractionQuality: 0.5,
    } as unknown as Job);

    const jobs = await listJobs();
    expect(jobs[0]?.tags).toEqual([]);
    // Именно здесь падал интерфейс: flatMap по undefined.
    expect(() => collectTags(jobs)).not.toThrow();
  });
});

describe('возврат из архива', () => {
  it('отправленная вакансия может вернуться отправленной', () => {
    // Архив не отменяет того, что отклик был, поэтому переход разрешён.
    expect(canTransitionJob('rejected', 'submitted')).toBe(true);
  });

  it('из найденной в отправленную по-прежнему нельзя', () => {
    expect(canTransitionJob('discovered', 'submitted')).toBe(false);
  });
});
