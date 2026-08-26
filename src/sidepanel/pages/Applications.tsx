import type { ApplicationOutcome, ApplicationState } from '@/types/application';
import { useStore } from '../state/store';
import { Empty } from '../components/Empty';
import { Icon, type IconName } from '../components/Icon';
import { SubmissionHistory } from '../components/SubmissionHistory';
import { formatRelative, formatUntil } from '@/utils/time';
import { APPLICATION_OUTCOME_LABEL, APPLICATION_STATE_LABEL } from '../labels';

/** Цвет ответа: оффер — успех, отказ — конец, остальное нейтрально. */
const OUTCOME_STYLE: Record<ApplicationOutcome, string> = {
  awaiting: '',
  replied: 'text-good',
  interview: 'text-brand',
  offer: 'text-excellent',
  rejected: 'text-poor',
};

const OUTCOME_ICON: Record<ApplicationOutcome, IconName> = {
  awaiting: 'clock',
  replied: 'message',
  interview: 'user',
  offer: 'checkCircle',
  rejected: 'xCircle',
};

/** Цвет статуса заявки повторяет шкалу «черновик → готово → отправлено». */
const STATE_STYLE: Record<ApplicationState, string> = {
  draft: '',
  analyzing: 'bg-good/10 text-good',
  filling: 'bg-good/10 text-good',
  review: 'bg-potential/10 text-potential',
  ready: 'bg-brand/10 text-brand',
  submitted: 'bg-excellent/10 text-excellent',
  failed: 'bg-poor/10 text-poor',
  cancelled: 'border-border bg-surface-3 text-muted',
};

type Tab = 'drafts' | 'history';

export function Applications() {
  const applications = useStore((state) => state.applications);
  const submissions = useStore((state) => state.submissions);
  const jobs = useStore((state) => state.jobs);
  const navigate = useStore((state) => state.navigate);
  const tab = useStore((state) => state.applicationsTab);
  const setTab = (value: Tab) => useStore.setState({ applicationsTab: value });

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: 'drafts', label: 'Заявки', count: applications.length },
    { value: 'history', label: 'История откликов', count: submissions.length },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="jp-segmented flex w-full">
        {tabs.map((entry) => (
          <button
            key={entry.value}
            type="button"
            aria-pressed={tab === entry.value}
            onClick={() => setTab(entry.value)}
            className="flex flex-1 items-center justify-center gap-1.5 text-[12px]"
          >
            {entry.label}
            <span className="tabular-nums opacity-60">{entry.count}</span>
          </button>
        ))}
      </div>

      {tab === 'history' ? <SubmissionHistory /> : <ApplicationList />}
    </div>
  );

  function ApplicationList() {
    if (applications.length === 0) {
      return (
        <Empty
          icon="send"
          title="Заявок пока нет"
          hint="Откройте вакансию и нажмите «Подготовить заявку», чтобы создать черновик."
          action={{ label: 'К вакансиям', onClick: () => navigate('jobs') }}
        />
      );
    }
    return (
      <ul className="flex flex-col gap-2">
        {applications.map((application) => {
          const job = jobs.find((entry) => entry.id === application.jobId);
          return (
            <li key={application.id}>
              <button
                type="button"
                className="jp-card-interactive w-full text-left"
                onClick={() => navigate('application', application.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">
                      {job?.title ?? 'Вакансия не найдена'}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {job?.company ? `${job.company} · ` : ''}обновлено{' '}
                      {formatRelative(application.updatedAt)}
                    </p>
                  </div>
                  <span
                    className={`jp-badge flex-shrink-0 ${STATE_STYLE[application.state]}`}
                    title={
                      application.state === 'submitted' && application.submissionSource === 'auto'
                        ? 'Отметил JobPilot, заметив отправку формы на сайте'
                        : undefined
                    }
                  >
                    {application.state === 'submitted' &&
                    application.submissionSource === 'auto' ? (
                      <Icon name="bolt" size={10} />
                    ) : null}
                    {APPLICATION_STATE_LABEL[application.state]}
                  </span>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                  {/* Ответ работодателя — отдельная ось от состояния заявки,
                      поэтому и показывается отдельной пометкой. */}
                  {application.submittedAt !== null ? (
                    <span
                      className={`flex items-center gap-1 ${OUTCOME_STYLE[application.outcome]}`}
                    >
                      <Icon name={OUTCOME_ICON[application.outcome]} size={11} />
                      {APPLICATION_OUTCOME_LABEL[application.outcome].toLowerCase()}
                    </span>
                  ) : null}
                  {application.followUpAt !== null ? (
                    <span className="flex items-center gap-1 text-brand">
                      <Icon name="bell" size={11} />
                      напомнить {formatUntil(application.followUpAt)}
                    </span>
                  ) : null}
                  <span
                    className={`flex items-center gap-1 ${
                      application.coverLetter ? 'text-excellent' : ''
                    }`}
                  >
                    <Icon
                      name={application.coverLetter ? 'check' : 'x'}
                      size={11}
                      strokeWidth={2.4}
                    />
                    {application.coverLetter ? 'письмо готово' : 'письма нет'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="message" size={11} />
                    вопросов: {application.questions.length}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="list" size={11} />
                    полей размечено: {application.fieldMappings.length}
                  </span>
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }
}
