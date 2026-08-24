import { MESSAGE_TYPES, type PageMark, type TrackerConfig } from '@/types/messages';
import type { SubmissionSignal } from '@/types/submission';
import { broadcast, sendToTab } from '@/utils/messaging';
import { createLogger } from '@/utils/logger';
import { isRestrictedUrl, normalizeUrl } from '@/utils/url';
import { getSettings } from '@/database/repositories/settingsRepository';
import {
  getJobByUrl,
  listJobs,
  setJobState,
  upsertExtractedJob,
} from '@/database/repositories/jobRepository';
import { getApplicationByJob } from '@/database/repositories/applicationRepository';
import { listSubmissions, recordSubmission } from '@/database/repositories/submissionRepository';
import { ensureContentScript } from './tabManager';

const log = createLogger('submissions');

export async function getTrackerConfig(): Promise<TrackerConfig> {
  const settings = await getSettings();
  return {
    trackSubmissions: settings.automation.trackSubmissions,
    showPageBadges: settings.automation.showPageBadges,
  };
}

/**
 * Автоматика заметила отправку отклика на сайте.
 *
 * Важно: JobPilot ничего не отправляет — он только фиксирует то, что сделал сам
 * пользователь. Состояние заявки (`Application`) при этом не переводится в
 * `submitted`: туда по-прежнему можно попасть лишь через явное подтверждение на
 * экране проверки. Автоматика пишет в журнал откликов и предлагает подтвердить.
 */
export async function handleSubmissionDetected(
  payload: { url: string; signal: SubmissionSignal; title?: string },
  sender: chrome.runtime.MessageSender,
): Promise<{ recorded: boolean; reason: string }> {
  const settings = await getSettings();
  if (!settings.automation.trackSubmissions) return { recorded: false, reason: 'tracking_off' };

  const url = payload.url || sender.tab?.url || '';
  if (!url || isRestrictedUrl(url)) return { recorded: false, reason: 'restricted_url' };

  let job = await getJobByUrl(url);

  // Отклик мог уйти с вакансии, которую JobPilot ещё не видел: читаем её сейчас,
  // иначе в журнале останется голая ссылка без компании и должности.
  const tabId = sender.tab?.id;
  if (!job && typeof tabId === 'number') {
    try {
      await ensureContentScript(tabId, url);
      const extracted = await sendToTab(tabId, MESSAGE_TYPES.CONTENT_EXTRACT_JOB, {
        maxDescriptionChars: settings.costControl.maxDescriptionChars,
      });
      const result = await upsertExtractedJob(extracted);
      job = result.job;
    } catch (error) {
      log.debug('вакансию со страницы отклика прочитать не удалось', error);
    }
  }
  if (!job) return { recorded: false, reason: 'no_job' };

  const application = await getApplicationByJob(job.id);
  const record = await recordSubmission({
    jobId: job.id,
    applicationId: application?.id ?? null,
    source: 'auto',
    signal: payload.signal,
    url,
    title: job.title || payload.title || '',
    company: job.company,
    score: job.score,
  });

  // Единственный законный автоматический переход: заявка была готова к отправке.
  if (job.state === 'application_ready') {
    try {
      await setJobState(job.id, 'submitted');
    } catch (error) {
      log.debug('состояние вакансии не изменилось', error);
    }
  }

  broadcast(MESSAGE_TYPES.EVENT_DATA_CHANGED, { entity: 'applications' });
  broadcast(MESSAGE_TYPES.EVENT_TOAST, {
    level: 'success',
    message: `Отклик записан: «${record.title || job.title || 'вакансия'}».`,
  });
  log.info('отклик записан автоматически', { jobId: job.id, signal: payload.signal });
  return { recorded: true, reason: payload.signal };
}

/** Что показывать метками на самой странице сайта с вакансиями. */
export async function getPageMarks(urls: string[]): Promise<PageMark[]> {
  const settings = await getSettings();
  if (!settings.automation.showPageBadges) return [];

  const wanted = new Set(
    urls
      .filter((url) => Boolean(url))
      .slice(0, 300)
      .map((url) => normalizeUrl(url)),
  );
  if (wanted.size === 0) return [];

  const [jobs, submissions] = await Promise.all([listJobs({ limit: 1000 }), listSubmissions(1000)]);
  const submittedAtByJob = new Map(submissions.map((row) => [row.jobId, row.at]));

  const marks: PageMark[] = [];
  for (const job of jobs) {
    if (!job.url) continue;
    const normalized = normalizeUrl(job.url);
    if (!wanted.has(normalized)) continue;
    marks.push({
      url: normalized,
      jobId: job.id,
      score: job.score,
      state: job.state,
      submittedAt: submittedAtByJob.get(job.id) ?? null,
    });
  }
  return marks;
}
