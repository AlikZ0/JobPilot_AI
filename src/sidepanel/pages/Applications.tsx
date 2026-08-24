import { useStore } from '../state/store';
import { Empty } from '../components/Empty';
import { formatRelative } from '@/utils/time';
import { APPLICATION_STATE_LABEL } from '../labels';

export function Applications() {
  const applications = useStore((state) => state.applications);
  const jobs = useStore((state) => state.jobs);
  const navigate = useStore((state) => state.navigate);

  if (applications.length === 0) {
    return (
      <Empty
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
              className="jp-card w-full text-left transition hover:border-brand"
              onClick={() => navigate('application', application.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">
                    {job?.title ?? 'Вакансия не найдена'}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {job?.company ?? ''} · обновлено {formatRelative(application.updatedAt)}
                  </p>
                </div>
                <span className="jp-badge">{APPLICATION_STATE_LABEL[application.state]}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {application.coverLetter ? '✓ письмо готово' : '· письма нет'} · вопросов:{' '}
                {application.questions.length} · полей размечено:{' '}
                {application.fieldMappings.length}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
