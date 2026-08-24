import { useMemo, useState } from 'react';
import type { SubmissionRecord, SubmissionSignal } from '@/types/submission';
import { deleteSubmission } from '@/database/repositories/submissionRepository';
import { formatDateTime, DAY_MS } from '@/utils/time';
import { useStore, withBusy } from '../state/store';
import { Empty } from './Empty';
import { Icon, type IconName } from './Icon';

type Period = 'all' | 'week' | 'month';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'all', label: 'Всё время' },
  { value: 'week', label: '7 дней' },
  { value: 'month', label: '30 дней' },
];

/** Как отклик попал в журнал — пользователь должен понимать, чему верить. */
const SIGNAL_LABEL: Record<SubmissionSignal, string> = {
  user_confirmed: 'вы подтвердили отправку',
  form_submit: 'замечена отправка формы',
  success_page: 'сайт показал «отклик отправлен»',
  site_marker: 'сайт отмечает вас как откликнувшегося',
  manual_entry: 'добавлено вручную',
};

const SIGNAL_ICON: Record<SubmissionSignal, IconName> = {
  user_confirmed: 'checkCircle',
  form_submit: 'send',
  success_page: 'file',
  site_marker: 'flag',
  manual_entry: 'plus',
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="jp-card flex-1 p-2 text-center">
      <p className="text-[18px] font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-[10px] text-muted">{label}</p>
    </div>
  );
}

export function SubmissionHistory() {
  const submissions = useStore((state) => state.submissions);
  const jobs = useStore((state) => state.jobs);
  const navigate = useStore((state) => state.navigate);
  const refreshData = useStore((state) => state.refreshData);
  const pushToast = useStore((state) => state.pushToast);
  const [period, setPeriod] = useState<Period>('all');

  const now = Date.now();
  const stats = useMemo(
    () => ({
      today: submissions.filter(
        (row) => new Date(row.at).toDateString() === new Date().toDateString(),
      ).length,
      week: submissions.filter((row) => row.at >= now - 7 * DAY_MS).length,
      total: submissions.length,
    }),
    [submissions, now],
  );

  const visible = useMemo(() => {
    const since = period === 'week' ? now - 7 * DAY_MS : period === 'month' ? now - 30 * DAY_MS : 0;
    return submissions.filter((row) => row.at >= since);
  }, [submissions, period, now]);

  const remove = (record: SubmissionRecord) =>
    void withBusy('Удаляем запись', async () => {
      await deleteSubmission(record.id);
      await refreshData();
      pushToast({ level: 'info', message: 'Запись удалена из журнала откликов.' });
    });

  if (submissions.length === 0) {
    return (
      <Empty
        icon="send"
        title="Откликов пока не записано"
        hint="JobPilot сам добавит отклик сюда, как только вы отправите форму на сайте, которому выдан доступ. Записи можно удалять."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Stat label="сегодня" value={stats.today} />
        <Stat label="за 7 дней" value={stats.week} />
        <Stat label="всего" value={stats.total} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            className={`jp-chip ${period === entry.value ? 'jp-chip-active' : ''}`}
            aria-pressed={period === entry.value}
            onClick={() => setPeriod(entry.value)}
          >
            {entry.label}
          </button>
        ))}
        <span className="ml-auto self-center text-[11px] text-muted">
          Записей: {visible.length}
        </span>
      </div>

      <ol className="flex flex-col gap-2">
        {visible.map((record) => {
          const job = jobs.find((entry) => entry.id === record.jobId);
          return (
            <li key={record.id} className="jp-card flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <button
                    type="button"
                    className="truncate text-left text-[13px] font-semibold hover:text-brand hover:underline"
                    onClick={() => navigate('job', record.jobId)}
                    disabled={!job}
                  >
                    {record.title || job?.title || 'Вакансия без названия'}
                  </button>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted">
                    <Icon name="briefcase" size={11} />
                    {record.company || job?.company || 'Компания не указана'}
                    {record.hostname ? ` · ${record.hostname}` : ''}
                  </p>
                </div>
                {record.score !== null ? (
                  <span className="jp-badge flex-shrink-0 tabular-nums">{record.score}%</span>
                ) : null}
              </div>

              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted">
                <span className="flex items-center gap-1">
                  <Icon name="clock" size={11} />
                  {formatDateTime(record.at)}
                </span>
                <span
                  className={`flex items-center gap-1 ${
                    record.source === 'manual' ? 'text-excellent' : ''
                  }`}
                  title={
                    record.source === 'auto'
                      ? 'Запись добавила автоматика — проверьте, если она ошиблась.'
                      : 'Вы подтвердили отправку вручную.'
                  }
                >
                  <Icon name={SIGNAL_ICON[record.signal]} size={11} />
                  {SIGNAL_LABEL[record.signal]}
                </span>
              </p>

              <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
                {record.url ? (
                  <a
                    className="jp-button jp-button-sm"
                    href={record.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Icon name="external" size={12} />
                    Открыть вакансию
                  </a>
                ) : null}
                {job ? (
                  <button
                    type="button"
                    className="jp-button jp-button-sm"
                    onClick={() => navigate('job', job.id)}
                  >
                    <Icon name="target" size={12} />
                    Разбор балла
                  </button>
                ) : null}
                <button
                  type="button"
                  className="jp-button-ghost jp-button-sm ml-auto"
                  onClick={() => remove(record)}
                  title="Убрать из журнала — например, если автоматика ошиблась"
                >
                  <Icon name="trash" size={12} />
                  Удалить
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
