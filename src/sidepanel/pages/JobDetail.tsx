import { useStore } from '../state/store';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { Empty } from '../components/Empty';
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
      <button type="button" className="jp-button-ghost self-start" onClick={() => navigate('jobs')}>
        ← Все вакансии
      </button>

      <header>
        <h2 className="text-[15px] font-semibold leading-tight">{job.title}</h2>
        <p className="text-[12px] text-muted">
          {job.company}
          {job.location ? ` · ${job.location}` : ''}
          {job.employmentType !== 'unknown'
            ? ` · ${EMPLOYMENT_TYPE_LABEL[job.employmentType]}`
            : ''}
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="jp-button" onClick={() => actions.analyze(job)}>
          Проанализировать заново
        </button>
        <button type="button" className="jp-button" onClick={() => actions.open(job)}>
          Открыть вакансию
        </button>
        <button type="button" className="jp-button" onClick={() => actions.save(job)}>
          Сохранить
        </button>
        <button type="button" className="jp-button-primary" onClick={() => actions.prepare(job)}>
          Подготовить заявку
        </button>
      </div>

      {analysis ? (
        <AnalysisPanel job={job} analysis={analysis} />
      ) : (
        <Empty
          title="Ещё не проанализирована"
          hint="Запустите анализ, чтобы увидеть разбор балла."
          action={{ label: 'Анализировать', onClick: () => actions.analyze(job) }}
        />
      )}
    </div>
  );
}
