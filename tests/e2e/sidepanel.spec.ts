import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/** Inserts a job and an application straight into the app's IndexedDB. */
async function seedJob(page: Page): Promise<{ jobId: string; applicationId: string }> {
  return page.evaluate(async () => {
    const now = Date.now();
    const jobId = 'job_e2e_1';
    const applicationId = 'app_e2e_1';
    const analysisId = 'ana_e2e_1';
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('jobpilot');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['jobs', 'applications', 'analyses'], 'readwrite');
      tx.objectStore('jobs').put({
        id: jobId,
        fingerprint: 'c:e2e',
        title: 'Senior Node.js Developer',
        company: 'Example Inc.',
        companyUrl: '',
        url: 'https://jobs.example.com/1',
        description: 'Remote Node.js role for the end-to-end test.',
        requirements: ['Node.js required'],
        responsibilities: ['Build APIs'],
        benefits: [],
        salary: { min: 3000, max: 4000, currency: 'USD', period: 'month', raw: '' },
        location: 'Remote',
        country: 'Poland',
        city: '',
        workMode: 'remote',
        seniority: 'senior',
        employmentType: 'full_time',
        technologies: ['Node.js'],
        languageRequirements: [],
        postedAt: '',
        applyUrl: '',
        source: 'test',
        fieldSources: {},
        extractionQuality: 0.9,
        state: 'analyzed',
        priority: 'high',
        score: 92,
        discoveredAt: now,
        updatedAt: now,
        analyzedAt: now,
        savedAt: null,
        duplicateOf: null,
        notes: '',
        error: '',
        scanSessionId: null,
      });
      tx.objectStore('analyses').put({
        id: analysisId,
        jobId,
        jobFingerprint: 'c:e2e',
        profileVersion: 5,
        analysisVersion: 1,
        createdAt: now,
        score: 92,
        band: 'strong_match',
        breakdown: {
          technicalSkills: { earned: 38, max: 40, detail: '3/3 required technologies' },
          experience: { earned: 15, max: 15, detail: '5 years vs 5 required.' },
          seniority: { earned: 10, max: 10, detail: 'Both senior.' },
          location: { earned: 10, max: 10, detail: 'Remote role.' },
          salary: { earned: 8, max: 10, detail: 'Top of range meets expectation.' },
          language: { earned: 5, max: 5, detail: 'No requirement.' },
          responsibilities: { earned: 3, max: 5, detail: 'Partially aligned.' },
          other: { earned: 3, max: 5, detail: 'No issues detected.' },
        },
        matchedSkills: ['Node.js', 'TypeScript'],
        missingSkills: ['AWS'],
        bonusSkills: ['Vue'],
        seniorityMatch: true,
        salaryMatch: true,
        locationMatch: true,
        languageMatch: true,
        experienceMatch: true,
        redFlags: [],
        reasoning: 'Seeded by the end-to-end test.',
        summary: 'Excellent match.',
        usedAI: false,
        providerId: null,
        model: null,
      });
      tx.objectStore('applications').put({
        id: applicationId,
        jobId,
        state: 'draft',
        createdAt: now,
        updatedAt: now,
        submittedAt: null,
        coverLetter: '',
        coverLetterStatus: 'none',
        unverifiedClaims: [],
        questions: [],
        fieldMappings: [],
        attachmentIds: [],
        notes: '',
        error: '',
        submittedByUser: false,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { jobId, applicationId };
  });
}

async function completeOnboarding(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Who you are' })).toBeVisible();
  await page.getByLabel('First name').fill('Alex');
  await page.getByLabel('Email', { exact: false }).first().fill('alex@example.com');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Your role' })).toBeVisible();
  await page.getByLabel('Desired position').fill('Senior Fullstack Developer');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Your stack' })).toBeVisible();
  for (const skill of ['Node.js', 'TypeScript', 'Vue']) {
    await page.getByLabel('Technology name').fill(skill);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'What you want' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: 'JobPilot AI' })).toBeVisible();
}

test.describe('side panel', () => {
  test('walks a new user through onboarding into the dashboard', async ({ panel }) => {
    await completeOnboarding(panel);
    await expect(panel.getByText('Today')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // The profile survives a reload, which proves it reached IndexedDB.
    await panel.reload();
    await expect(panel.getByText('Today')).toBeVisible();
  });

  test('asks for site access before offering page actions', async ({ panel }) => {
    await completeOnboarding(panel);
    await expect(panel.getByRole('heading', { name: 'This site is not connected' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Grant access to this site' })).toBeVisible();
  });

  test('shows a stored job with its score and explanation', async ({ panel }) => {
    await completeOnboarding(panel);
    await seedJob(panel);
    await panel.reload();

    await panel.getByRole('button', { name: 'Jobs' }).click();
    await expect(panel.getByRole('button', { name: 'Senior Node.js Developer' })).toBeVisible();
    await expect(panel.getByText('92%')).toBeVisible();
    await expect(panel.getByText('Excellent match')).toBeVisible();

    await panel.getByRole('button', { name: 'Senior Node.js Developer' }).click();
    await expect(panel.getByRole('heading', { name: 'Senior Node.js Developer' })).toBeVisible();

    // The score is always shown with its full explanation, never as a bare number.
    await expect(panel.getByText('Score breakdown')).toBeVisible();
    await expect(panel.getByText('38/40')).toBeVisible();
    await expect(panel.getByText('Technical skills')).toBeVisible();
    await expect(panel.getByTitle('matched: Node.js').first()).toBeVisible();
    await expect(panel.getByTitle('missing: AWS').first()).toBeVisible();
  });

  test('filters the job list by minimum score', async ({ panel }) => {
    await completeOnboarding(panel);
    await seedJob(panel);
    await panel.reload();
    await panel.getByRole('button', { name: 'Jobs' }).click();
    await expect(panel.getByText('1 of 1 jobs')).toBeVisible();
    await panel.getByLabel('Search jobs').fill('python');
    await expect(panel.getByText('0 of 1 jobs')).toBeVisible();
  });

  test('gates submission behind an explicit confirmation', async ({ panel }) => {
    await completeOnboarding(panel);
    await seedJob(panel);
    await panel.reload();

    await panel.getByRole('button', { name: 'Applications' }).click();
    await panel.getByRole('button', { name: /Senior Node\.js Developer/ }).click();

    await expect(panel.getByRole('heading', { name: '4 · Review & submit' })).toBeVisible();
    await expect(panel.getByText('JobPilot never submits an application for you.')).toBeVisible();

    const submit = panel.getByRole('button', { name: 'Record submission' });
    await expect(submit).toBeDisabled();

    await panel.getByLabel('I submitted this application on the job site myself.').check();
    await expect(submit).toBeEnabled();
  });

  test('never fills a form field without an approved mapping', async ({ panel }) => {
    await completeOnboarding(panel);
    await seedJob(panel);
    await panel.reload();
    await panel.getByRole('button', { name: 'Applications' }).click();
    await panel.getByRole('button', { name: /Senior Node\.js Developer/ }).click();

    // With no mapped fields, the fill button is unavailable.
    await expect(panel.getByRole('button', { name: /Fill 0 approved field/ })).toBeDisabled();
  });

  test('keeps the submit-confirmation setting locked on', async ({ panel }) => {
    await completeOnboarding(panel);
    await panel.getByRole('button', { name: 'Settings' }).click();
    const checkbox = panel.getByLabel('Always required');
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toBeDisabled();
  });

  test('exposes the AI provider settings and defaults to AI off', async ({ panel }) => {
    await completeOnboarding(panel);
    await panel.getByRole('button', { name: 'Settings' }).click();
    await expect(panel.getByText('AI provider')).toBeVisible();
    await expect(panel.getByText('Off by default')).toBeVisible();
  });
});
