import type { Job, JobState } from '@/types/job';
import type { JobAnalysis } from '@/types/ai';
import { MatchScore } from './MatchScore';
import { SkillBadge } from './SkillBadge';
import { Icon } from './Icon';
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

/** Цвет статуса подсказывает, на каком шаге вакансия, без чтения подписи. */
const STATE_STYLE: Record<JobState, string> = {
  discovered: '',
  queued: '',
  analyzing: 'bg-good/10 text-good',
  analyzed: 'bg-good/10 text-good',
  saved: 'bg-brand/10 text-brand',
  application_preparing: 'bg-potential/10 text-potential',
  application_ready: 'bg-potential/10 text-potential',
  submitted: 'bg-excellent/10 text-excellent',
  rejected: 'bg-poor/10 text-poor',
  error: 'bg-poor/10 text-poor',
};

/** Заявка по вакансии уже начата — предлагаем вернуться к ней, а не создавать. */
const PREPARE_LABEL: Partial<Record<JobState, string>> = {
  application_preparing: 'Продолжить заявку',
  application_ready: 'Открыть заявку',
  submitted: 'Открыть заявку',
};

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
  // Состояние уходит вперёд (готовится заявка, отправлена), а отметка о
  // сохранении остаётся в savedAt — иначе кнопка снова предлагает сохранить.
  const saved = job.savedAt !== null || job.state === 'saved';
  const prepareLabel = PREPARE_LABEL[job.state] ?? 'Подготовить заявку';

  return (
    <article className="jp-card flex flex-col gap-3 transition duration-200 ease-apple hover:border-border-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onSelect}
            className="text-left text-[14.5px] font-semibold leading-snug tracking-[-0.015em] transition-colors hover:text-brand"
          >
            {job.title || 'Вакансия без названия'}
          </button>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-muted">
            <Icon name="briefcase" size={12} />
            <span className="truncate">{job.company || 'Компания не указана'}</span>
          </p>
          {job.location || job.workMode !== 'unknown' ? (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted">
              <Icon name="pin" size={12} />
              <span className="truncate">
                {[job.location, job.workMode !== 'unknown' ? WORK_MODE_LABEL[job.workMode] : '']
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </p>
          ) : null}
        </div>
        {analysis ? (
          <MatchScore score={analysis.score} band={analysis.band} />
        ) : (
          <span className="jp-badge flex-shrink-0 text-muted">
            <Icon name="clock" size={11} />
            Не проанализирована
          </span>
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

      <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <div className="flex items-center gap-1">
          <dt className="sr-only">Зарплата</dt>
          <Icon name="money" size={12} />
          <dd>{salaryLabel(job)}</dd>
        </div>
        <div className="flex items-center gap-1">
          <dt className="sr-only">Найдена</dt>
          <Icon name="clock" size={12} />
          <dd>{formatRelative(job.discoveredAt)}</dd>
        </div>
        {job.priority !== 'normal' ? (
          <div className="flex items-center gap-1">
            <dt className="sr-only">Приоритет</dt>
            <Icon name="flag" size={12} />
            <dd>{JOB_PRIORITY_LABEL[job.priority]}</dd>
          </div>
        ) : null}
        <div className="ml-auto">
          <dt className="sr-only">Статус</dt>
          <dd className={`jp-badge ${STATE_STYLE[job.state]}`}>{JOB_STATE_LABEL[job.state]}</dd>
        </div>
      </dl>

      {/*
        Четыре кнопки в строку не помещаются в узкой панели и разъезжались на
        три ряда. Главное действие занимает всю ширину, второстепенные делят
        строку под ним, а «открыть на сайте» остаётся значком.
      */}
      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <button
          type="button"
          className="jp-button-primary jp-button-sm w-full"
          onClick={onPrepare}
          disabled={busy}
        >
          <Icon name="send" size={13} />
          {prepareLabel}
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="jp-button jp-button-sm flex-1"
            onClick={onAnalyze}
            disabled={busy}
            title={analysis ? 'Проанализировать заново' : 'Проанализировать вакансию'}
          >
            <Icon name={analysis ? 'refresh' : 'target'} size={13} />
            {analysis ? 'Заново' : 'Анализировать'}
          </button>
          <button
            type="button"
            className={`jp-button jp-button-sm flex-1 ${saved ? 'text-brand' : ''}`}
            onClick={onSave}
            disabled={busy || saved}
            title={saved ? 'Вакансия уже сохранена' : 'Сохранить вакансию'}
          >
            <Icon name="bookmark" size={13} />
            {saved ? 'Сохранена' : 'Сохранить'}
          </button>
          <button
            type="button"
            className="jp-button-ghost jp-button-sm flex-shrink-0 px-2.5"
            onClick={onOpen}
            title="Открыть вакансию на сайте"
            aria-label="Открыть вакансию на сайте"
          >
            <Icon name="external" size={13} />
          </button>
        </div>
      </div>
    </article>
  );
}
