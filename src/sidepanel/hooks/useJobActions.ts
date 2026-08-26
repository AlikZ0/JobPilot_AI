import { MESSAGE_TYPES } from '@/types/messages';
import type { Job } from '@/types/job';
import { sendToBackground } from '@/utils/messaging';
import { markJobSaved, setJobState, updateJob } from '@/database/repositories/jobRepository';
import { addTag, removeTag } from '@/core/pipeline/triage';
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
        await markJobSaved(job.id);
        await store.refreshData();
      }),

    /** Убрать из списка, не удаляя: решение обратимо. */
    archive: (job: Job) =>
      void withBusy('Убираем в архив', async () => {
        await setJobState(job.id, 'rejected');
        await store.refreshData();
        store.pushToast({
          level: 'info',
          message: `«${job.title || 'Вакансия'}» в архиве. Её видно по фильтру «В архиве».`,
        });
      }),

    restore: (job: Job) =>
      void withBusy('Возвращаем', async () => {
        // Проанализированная возвращается в свой разбор, остальные — в найденные.
        await setJobState(job.id, job.score !== null ? 'analyzed' : 'discovered');
        await store.refreshData();
      }),

    saveNotes: (job: Job, notes: string) =>
      withBusy('Сохраняем заметку', async () => {
        await updateJob(job.id, { notes });
        await store.refreshData();
      }),

    addTag: (job: Job, tag: string) =>
      withBusy('Сохраняем пометку', async () => {
        const tags = addTag(job.tags, tag);
        if (tags === job.tags) return;
        await updateJob(job.id, { tags });
        await store.refreshData();
      }),

    removeTag: (job: Job, tag: string) =>
      withBusy('Убираем пометку', async () => {
        await updateJob(job.id, { tags: removeTag(job.tags, tag) });
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
