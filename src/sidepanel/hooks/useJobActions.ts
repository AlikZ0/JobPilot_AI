import { MESSAGE_TYPES } from '@/types/messages';
import type { Job } from '@/types/job';
import { sendToBackground } from '@/utils/messaging';
import { updateJob } from '@/database/repositories/jobRepository';
import { useStore, withBusy } from '../state/store';

/** Общие действия над вакансией — для карточек, списка и страницы вакансии. */
export function useJobActions() {
  const store = useStore();

  return {
    analyze: (job: Job, force = true) =>
      void withBusy('Анализируем', async () => {
        const result = await sendToBackground(MESSAGE_TYPES.ANALYZE_JOB_BY_ID, {
          jobId: job.id,
          force,
        });
        store.applyAnalysis(result.job, result.analysis);
        store.pushToast({
          level: 'success',
          message: `«${result.job.title || 'Вакансия'}» — ${result.analysis.score}%${
            result.fromCache ? ' (из кеша)' : ''
          }`,
        });
      }),

    save: (job: Job) =>
      void withBusy('Сохраняем', async () => {
        await updateJob(job.id, { state: 'saved', savedAt: Date.now() });
        await store.refreshData();
      }),

    open: (job: Job) => {
      if (job.url) void chrome.tabs.create({ url: job.url, active: true });
    },

    prepare: (job: Job) =>
      void withBusy('Готовим заявку', async () => {
        const result = await sendToBackground(MESSAGE_TYPES.PREPARE_APPLICATION, { jobId: job.id });
        await store.refreshData();
        store.navigate('application', result.applicationId);
      }),
  };
}
