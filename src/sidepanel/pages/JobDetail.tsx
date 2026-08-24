import { useStore } from '../state/store';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { Empty } from '../components/Empty';
import { useJobActions } from '../hooks/useJobActions';

export function JobDetail() {
  const jobId = useStore((state) => state.selectedJobId);
  const job = useStore((state) => state.jobs.find((entry) => entry.id === jobId));
  const analysis = useStore((state) => (jobId ? state.analyses[jobId] : undefined));
  const navigate = useStore((state) => state.navigate);
  const actions = useJobActions();

  if (!job) {
    return (
      <Empty
        title="Job not found"
        hint="It may have been deleted."
        action={{ label: 'Back to jobs', onClick: () => navigate('jobs') }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button type="button" className="jp-button-ghost self-start" onClick={() => navigate('jobs')}>
        ← All jobs
      </button>

      <header>
        <h2 className="text-[15px] font-semibold leading-tight">{job.title}</h2>
        <p className="text-[12px] text-muted">
          {job.company}
          {job.location ? ` · ${job.location}` : ''}
          {job.employmentType !== 'unknown' ? ` · ${job.employmentType.replace('_', ' ')}` : ''}
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="jp-button" onClick={() => actions.analyze(job)}>
          Re-analyze
        </button>
        <button type="button" className="jp-button" onClick={() => actions.open(job)}>
          Open job
        </button>
        <button type="button" className="jp-button" onClick={() => actions.save(job)}>
          Save
        </button>
        <button type="button" className="jp-button-primary" onClick={() => actions.prepare(job)}>
          Prepare application
        </button>
      </div>

      {analysis ? (
        <AnalysisPanel job={job} analysis={analysis} />
      ) : (
        <Empty
          title="Not analyzed yet"
          hint="Run an analysis to see the score breakdown."
          action={{ label: 'Analyze now', onClick: () => actions.analyze(job) }}
        />
      )}
    </div>
  );
}
