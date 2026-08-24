import { useStore } from '../state/store';
import { Empty } from '../components/Empty';
import { formatRelative } from '@/utils/time';

const STATE_LABEL: Record<string, string> = {
  draft: 'Draft',
  analyzing: 'Analyzing form',
  filling: 'Filling',
  review: 'In review',
  ready: 'Ready to submit',
  submitted: 'Submitted',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function Applications() {
  const applications = useStore((state) => state.applications);
  const jobs = useStore((state) => state.jobs);
  const navigate = useStore((state) => state.navigate);

  if (applications.length === 0) {
    return (
      <Empty
        title="No applications yet"
        hint="Open a job and press “Prepare application” to start a draft."
        action={{ label: 'Browse jobs', onClick: () => navigate('jobs') }}
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
              className="jp-card w-full text-left transition hover:border-brand"
              onClick={() => navigate('application', application.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">
                    {job?.title ?? 'Unknown job'}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {job?.company ?? ''} · updated {formatRelative(application.updatedAt)}
                  </p>
                </div>
                <span className="jp-badge">
                  {STATE_LABEL[application.state] ?? application.state}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {application.coverLetter ? '✓ cover letter' : '· no cover letter'} ·{' '}
                {application.questions.length} question(s) · {application.fieldMappings.length}{' '}
                mapped field(s)
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
