import type { Job } from '@/types/job';
import type { JobAnalysis } from '@/types/ai';
import { MatchScore } from './MatchScore';
import { SkillBadge } from './SkillBadge';
import { formatRelative } from '@/utils/time';
import { JOB_PRIORITY_LABEL, JOB_STATE_LABEL, WORK_MODE_LABEL } from '../labels';

interface Props {
  job: Job;
  analysis?: JobAnalysis | undefined;
  onAnalyze(): void;
  onSave(): void;
  onOpen(): void;
  onPrepare(): void;
  onSelect(): void;
  busy?: boolean;
}

function salaryLabel(job: Job): string {
  if (job.salary.min === null && job.salary.max === null) return 'Не указана';
  const currency = job.salary.currency ? `${job.salary.currency} ` : '';
  const range =
    job.salary.max !== null && job.salary.max !== job.salary.min
      ? `${job.salary.min?.toLocaleString()}–${job.salary.max.toLocaleString()}`
      : `${(job.salary.min ?? job.salary.max)?.toLocaleString()}`;
  const period = job.salary.period !== 'unknown' ? `/${job.salary.period}` : '';
  return `${currency}${range}${period}`;
}

export function JobCard({
  job,
  analysis,
  onAnalyze,
  onSave,
  onOpen,
  onPrepare,
  onSelect,
  busy,
}: Props) {
  const matched = analysis?.matchedSkills.slice(0, 6) ?? [];
  const missing = analysis?.missingSkills.slice(0, 4) ?? [];

  return (
    <article className="jp-card flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onSelect}
            className="text-left text-[14px] font-semibold leading-tight hover:underline"
          >
            {job.title || 'Вакансия без названия'}
          </button>
          <p className="truncate text-[12px] text-muted">
            {job.company || 'Компания не указана'}
            {job.location ? ` · ${job.location}` : ''}
            {job.workMode !== 'unknown' ? ` · ${WORK_MODE_LABEL[job.workMode]}` : ''}
          </p>
        </div>
        {analysis ? (
          <MatchScore score={analysis.score} band={analysis.band} />
        ) : (
          <span className="jp-badge">Не проанализирована</span>
        )}
      </div>

      {matched.length > 0 || missing.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {matched.map((skill) => (
            <SkillBadge key={`m-${skill}`} name={skill} kind="matched" />
          ))}
          {missing.map((skill) => (
            <SkillBadge key={`x-${skill}`} name={skill} kind="missing" />
          ))}
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted">
        <div className="flex gap-1">
          <dt className="font-medium">Зарплата:</dt>
          <dd>{salaryLabel(job)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-medium">Найдена:</dt>
          <dd>{formatRelative(job.discoveredAt)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-medium">Статус:</dt>
          <dd>{JOB_STATE_LABEL[job.state]}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-medium">Приоритет:</dt>
          <dd>{JOB_PRIORITY_LABEL[job.priority]}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="jp-button" onClick={onAnalyze} disabled={busy}>
          {analysis ? 'Проанализировать заново' : 'Анализировать'}
        </button>
        <button
          type="button"
          className="jp-button"
          onClick={onSave}
          disabled={busy || job.state === 'saved'}
        >
          {job.state === 'saved' ? 'Сохранена' : 'Сохранить'}
        </button>
        <button type="button" className="jp-button" onClick={onOpen}>
          Открыть вакансию
        </button>
        <button type="button" className="jp-button-primary" onClick={onPrepare} disabled={busy}>
          Подготовить заявку
        </button>
      </div>
    </article>
  );
}
