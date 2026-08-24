import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/** Кладёт вакансию и заявку напрямую в IndexedDB приложения. */
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
        description: 'Удалённая вакансия на Node.js для end-to-end теста.',
        requirements: ['Требуется Node.js'],
        responsibilities: ['Разрабатывать API'],
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
          technicalSkills: { earned: 38, max: 40, detail: '3 из 3 требуемых технологий' },
          experience: { earned: 15, max: 15, detail: '5 лет при требуемых 5.' },
          seniority: { earned: 10, max: 10, detail: 'Оба уровня senior.' },
          location: { earned: 10, max: 10, detail: 'Удалённая работа.' },
          salary: { earned: 8, max: 10, detail: 'Верх вилки покрывает ожидание.' },
          language: { earned: 5, max: 5, detail: 'Требований нет.' },
          responsibilities: { earned: 3, max: 5, detail: 'Совпадают частично.' },
          other: { earned: 3, max: 5, detail: 'Проблем не обнаружено.' },
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
        reasoning: 'Данные подготовлены end-to-end тестом.',
        summary: 'Отличное совпадение.',
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
  await expect(page.getByRole('heading', { name: 'Кто вы' })).toBeVisible();
  await page.getByLabel('Имя', { exact: true }).fill('Алекс');
  await page.getByLabel('Email', { exact: false }).first().fill('alex@example.com');
  await page.getByRole('button', { name: 'Дальше' }).click();

  await expect(page.getByRole('heading', { name: 'Ваша роль' })).toBeVisible();
  await page.getByLabel('Желаемая должность').fill('Senior Fullstack Developer');
  await page.getByRole('button', { name: 'Дальше' }).click();

  await expect(page.getByRole('heading', { name: 'Ваш стек' })).toBeVisible();
  for (const skill of ['Node.js', 'TypeScript', 'Vue']) {
    await page.getByLabel('Название технологии').fill(skill);
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Дальше' }).click();

  await expect(page.getByRole('heading', { name: 'Чего вы хотите' })).toBeVisible();
  await page.getByRole('button', { name: 'Готово' }).click();
  await expect(page.getByRole('heading', { name: 'JobPilot AI' })).toBeVisible();
}

test.describe('боковая панель', () => {
  test('проводит нового пользователя через онбординг до обзора', async ({ panel }) => {
    await completeOnboarding(panel);
    await expect(panel.getByText('Сегодня')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Обзор' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Профиль переживает перезагрузку — значит, он действительно попал в IndexedDB.
    await panel.reload();
    await expect(panel.getByText('Сегодня')).toBeVisible();
  });

  test('сначала просит доступ к сайту, потом предлагает действия', async ({ panel }) => {
    await completeOnboarding(panel);
    await expect(panel.getByRole('heading', { name: 'Этот сайт ещё не подключён' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Выдать доступ к этому сайту' })).toBeVisible();
  });

  test('показывает сохранённую вакансию с баллом и объяснением', async ({ panel }) => {
    await completeOnboarding(panel);
    await seedJob(panel);
    await panel.reload();

    await panel.getByRole('button', { name: 'Вакансии', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Senior Node.js Developer' })).toBeVisible();
    await expect(panel.getByText('92%')).toBeVisible();
    await expect(panel.getByText('Отличное совпадение')).toBeVisible();

    await panel.getByRole('button', { name: 'Senior Node.js Developer' }).click();
    await expect(panel.getByRole('heading', { name: 'Senior Node.js Developer' })).toBeVisible();

    // Балл всегда показывается с полным объяснением, а не голым числом.
    await expect(panel.getByText('Из чего сложился балл')).toBeVisible();
    await expect(panel.getByText('38/40')).toBeVisible();
    await expect(panel.getByText('Технические навыки')).toBeVisible();
    await expect(panel.getByTitle('есть у вас: Node.js').first()).toBeVisible();
    await expect(panel.getByTitle('не хватает: AWS').first()).toBeVisible();
  });

  test('фильтрует список вакансий по поиску', async ({ panel }) => {
    await completeOnboarding(panel);
    await seedJob(panel);
    await panel.reload();
    await panel.getByRole('button', { name: 'Вакансии', exact: true }).click();
    await expect(panel.getByText('Показано 1 из 1')).toBeVisible();
    await panel.getByLabel('Поиск вакансий').fill('python');
    await expect(panel.getByText('Показано 0 из 1')).toBeVisible();
  });

  test('не даёт зафиксировать отправку без явного подтверждения', async ({ panel }) => {
    await completeOnboarding(panel);
    await seedJob(panel);
    await panel.reload();

    await panel.getByRole('button', { name: 'Заявки' }).click();
    await panel.getByRole('button', { name: /Senior Node\.js Developer/ }).click();

    await expect(panel.getByRole('heading', { name: '4 · Проверка и отправка' })).toBeVisible();
    await expect(panel.getByText('JobPilot никогда не отправляет заявку за вас.')).toBeVisible();

    const submit = panel.getByRole('button', { name: 'Зафиксировать отправку' });
    await expect(submit).toBeDisabled();

    await panel.getByLabel('Я сам(а) отправил(а) эту заявку на сайте вакансии.').check();
    await expect(submit).toBeEnabled();
  });

  test('не заполняет поле без одобренного сопоставления', async ({ panel }) => {
    await completeOnboarding(panel);
    await seedJob(panel);
    await panel.reload();
    await panel.getByRole('button', { name: 'Заявки' }).click();
    await panel.getByRole('button', { name: /Senior Node\.js Developer/ }).click();

    // Пока поля не размечены, кнопка заполнения недоступна.
    await expect(
      panel.getByRole('button', { name: /Заполнить одобренные поля \(0\)/ }),
    ).toBeDisabled();
  });

  test('держит подтверждение отправки постоянно включённым', async ({ panel }) => {
    await completeOnboarding(panel);
    await panel.getByRole('button', { name: 'Настройки' }).click();
    const checkbox = panel.getByLabel('Всегда обязательно');
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toBeDisabled();
  });

  test('показывает настройки AI-провайдера, и по умолчанию AI выключен', async ({ panel }) => {
    await completeOnboarding(panel);
    await panel.getByRole('button', { name: 'Настройки' }).click();
    await expect(panel.getByText('AI-провайдер')).toBeVisible();
    await expect(panel.getByText('По умолчанию выключено', { exact: false })).toBeVisible();
  });
});
