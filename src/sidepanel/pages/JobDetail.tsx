import { useStore } from '../state/store';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { Empty } from '../components/Empty';
import { Icon } from '../components/Icon';
import { useJobActions } from '../hooks/useJobActions';
import { EMPLOYMENT_TYPE_LABEL } from '../labels';

export function JobDetail() {
  const jobId = useStore((state) => state.selectedJobId);
  const job = useStore((state) => state.jobs.find((entry) => entry.id === jobId));
  const analysis = useStore((state) => (jobId ? state.analyses[jobId] : undefined));
  const navigate = useStore((state) => state.navigate);
  const actions = useJobActions();

  if (!job) {
    return (
      <Empty
        title="Вакансия не найдена"
        hint="Возможно, она была удалена."
        action={{ label: 'К списку вакансий', onClick: () => navigate('jobs') }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className="jp-button-ghost jp-button-sm self-start"
        onClick={() => navigate('jobs')}
      >
        <Icon name="chevronLeft" size={13} />
        Все вакансии
      </button>

      <header>
        <h2 className="text-[16px] font-semibold leading-snug">{job.title}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-muted">
          <span className="flex items-center gap-1">
            <Icon name="briefcase" size={12} />
            {job.company}
          </span>
          {job.location ? (
            <span className="flex items-center gap-1">
              <Icon name="pin" size={12} />
              {job.location}
            </span>
          ) : null}
          {job.employmentType !== 'unknown' ? (
            <span className="flex items-center gap-1">
              <Icon name="clock" size={12} />
              {EMPLOYMENT_TYPE_LABEL[job.employmentType]}
            </span>
          ) : null}
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="jp-button-primary jp-button-sm"
          onClick={() => actions.prepare(job)}
        >
          <Icon name="send" size={13} />
          Подготовить заявку
        </button>
        <button
          type="button"
          className="jp-button jp-button-sm"
          onClick={() => actions.analyze(job)}
        >
          <Icon name="refresh" size={13} />
          Проанализировать заново
        </button>
        <button type="button" className="jp-button jp-button-sm" onClick={() => actions.save(job)}>
          <Icon name="bookmark" size={13} />
          Сохранить
        </button>
        <button
          type="button"
          className="jp-button-ghost jp-button-sm"
          onClick={() => actions.open(job)}
        >
          <Icon name="external" size={13} />
          Открыть вакансию
        </button>
      </div>

      {analysis ? (
        <AnalysisPanel job={job} analysis={analysis} />
      ) : (
        <Empty
          icon="target"
          title="Ещё не проанализирована"
          hint="Запустите анализ, чтобы увидеть разбор балла."
          action={{ label: 'Анализировать', onClick: () => actions.analyze(job) }}
        />
      )}
    </div>
  );
}
