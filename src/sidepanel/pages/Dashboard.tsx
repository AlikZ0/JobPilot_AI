import { useMemo } from 'react';
import { useStore } from '../state/store';
import { PageActions } from '../components/PageActions';
import { JobCard } from '../components/JobCard';
import { Empty } from '../components/Empty';
import { formatRelative, isToday } from '@/utils/time';
import { buildFunnel } from '@/core/pipeline/funnel';
import {
  buildReportRows,
  mostDemandedSkills,
  reportFileName,
  reportToCsv,
  reportToMarkdown,
  statsBySource,
  summarizeWeek,
} from '@/core/pipeline/report';
import { FUNNEL_STEP_LABEL } from '../labels';
import { useJobActions } from '../hooks/useJobActions';
import { Icon, type IconName } from '../components/Icon';

type Accent = 'brand' | 'good' | 'excellent' | 'potential';

const ACCENT: Record<Accent, string> = {
  brand: 'bg-brand/10 text-brand',
  good: 'bg-good/10 text-good',
  excellent: 'bg-excellent/10 text-excellent',
  potential: 'bg-potential/10 text-potential',
};

function Stat({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: IconName;
  accent: Accent;
}) {
  return (
    <div className="jp-card flex flex-col gap-2 p-3">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full ${ACCENT[accent]}`}
        aria-hidden="true"
      >
        <Icon name={icon} size={13} />
      </span>
      <p className="text-[22px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
        {value}
      </p>
      <div>
        <p className="text-[11px] font-medium leading-tight">{label}</p>
        {hint ? <p className="mt-0.5 text-[10px] text-muted">{hint}</p> : null}
      </div>
    </div>
  );
}

export function Dashboard() {
  const jobs = useStore((state) => state.jobs);
  const analyses = useStore((state) => state.analyses);
  const applications = useStore((state) => state.applications);
  const submissions = useStore((state) => state.submissions);
  const navigate = useStore((state) => state.navigate);
  const openSubmissionHistory = useStore((state) => state.openSubmissionHistory);
  const actions = useJobActions();

  const stats = useMemo(() => {
    const analyzedToday = jobs.filter((job) => job.analyzedAt && isToday(job.analyzedAt));
    const scored = jobs.filter((job) => job.score !== null);
    const good = scored.filter((job) => (job.score ?? 0) >= 75 && (job.score ?? 0) < 90);
    const excellent = scored.filter((job) => (job.score ?? 0) >= 90);
    const average = scored.length
      ? Math.round(scored.reduce((sum, job) => sum + (job.score ?? 0), 0) / scored.length)
      : 0;

    const missing = new Map<string, number>();
    for (const analysis of Object.values(analyses)) {
      for (const skill of analysis.missingSkills) {
        missing.set(skill, (missing.get(skill) ?? 0) + 1);
      }
    }
    const topMissing = [...missing.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

    const roleCounts = new Map<string, number>();
    for (const job of scored.filter((job) => (job.score ?? 0) >= 75)) {
      const key = job.title.replace(/\(.*?\)/g, '').trim();
      if (key) roleCounts.set(key, (roleCounts.get(key) ?? 0) + 1);
    }

    return {
      analyzedToday: analyzedToday.length,
      good: good.length,
      excellent: excellent.length,
      average,
      prepared: applications.filter((app) => ['review', 'ready', 'filling'].includes(app.state))
        .length,
      // «Отправлено» считается по журналу откликов: туда попадают и отклики,
      // отправленные мимо JobPilot, прямо на сайте.
      submitted: submissions.filter((row) => isToday(row.at)).length,
      topMissing,
      recommendedRoles: [...roleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [jobs, analyses, applications, submissions]);

  /** Что стало с отправленными откликами. Считается по всей истории, не за день. */
  const funnel = useMemo(() => buildFunnel(applications), [applications]);
  const week = useMemo(() => summarizeWeek(jobs, applications), [jobs, applications]);
  const sources = useMemo(() => statsBySource(jobs, applications), [jobs, applications]);
  const demanded = useMemo(() => mostDemandedSkills(jobs, 6), [jobs]);

  /** Отчёт скачивается файлом: он нужен в чужой таблице, а не в расширении. */
  const download = (kind: 'csv' | 'md') => {
    const rows = buildReportRows(jobs, applications);
    const content = kind === 'csv' ? reportToCsv(rows) : reportToMarkdown(rows, week);
    const blob = new Blob([content], {
      type: kind === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = reportFileName(kind);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const recent = jobs.slice(0, 5);
  const recentSubmissions = submissions.slice(0, 3);

  return (
    <div className="flex flex-col gap-3">
      <PageActions />

      <section>
        <h2 className="jp-section-title mb-1.5">
          <Icon name="dashboard" size={12} />
          Сегодня
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Проанализировано" value={stats.analyzedToday} icon="target" accent="brand" />
          <Stat label="Хорошие" value={stats.good} hint="75–89%" icon="check" accent="good" />
          <Stat
            label="Отличные"
            value={stats.excellent}
            hint="90%+"
            icon="sparkles"
            accent="excellent"
          />
          <Stat label="Заявок готово" value={stats.prepared} icon="file" accent="potential" />
          <Stat label="Откликов" value={stats.submitted} icon="send" accent="excellent" />
          <Stat label="Средний балл" value={`${stats.average}%`} icon="trending" accent="brand" />
        </div>
      </section>

      {jobs.length > 0 ? (
        <section className="jp-card">
          <h2 className="jp-section-title mb-2">
            <Icon name="trending" size={12} />
            За неделю
          </h2>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
            {(
              [
                ['Проанализировано', week.analyzed],
                ['Отправлено', week.submitted],
                ['Ответов', week.replies],
                ['Интервью', week.interviews],
                ['Офферов', week.offers],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-2">
                <dt className="text-muted">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {funnel.submitted > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border pt-2.5">
              <button
                type="button"
                className="jp-button jp-button-sm"
                onClick={() => download('csv')}
              >
                <Icon name="download" size={12} />
                Отклики в CSV
              </button>
              <button
                type="button"
                className="jp-button jp-button-sm"
                onClick={() => download('md')}
              >
                <Icon name="download" size={12} />В Markdown
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {sources.length > 1 ? (
        <section className="jp-card">
          <h2 className="jp-section-title mb-2">
            <Icon name="link" size={12} />
            Откуда приходят вакансии
          </h2>
          <ul className="flex flex-col text-[12px]">
            {sources.slice(0, 6).map((row) => (
              <li
                key={row.source}
                className="flex items-center gap-2 border-b border-border py-1.5 last:border-0"
              >
                <span className="min-w-0 flex-1 truncate">{row.source}</span>
                <span className="flex-shrink-0 text-[11px] text-muted">
                  {row.jobs} шт.
                  {row.submitted > 0 ? ` · откликов ${row.submitted}` : ''}
                </span>
                <span className="w-10 flex-shrink-0 text-right font-medium tabular-nums">
                  {row.averageScore === null ? '—' : `${row.averageScore}%`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted">
            Справа — средний балл по проанализированным. Видно, какой сайт приносит вакансии, где вы
            подходите лучше.
          </p>
        </section>
      ) : null}

      {demanded.length > 0 ? (
        <section className="jp-card">
          <h2 className="jp-section-title mb-2">
            <Icon name="target" size={12} />
            Чаще всего требуют
          </h2>
          <ul className="flex flex-col gap-1.5">
            {demanded.map((row) => (
              <li key={row.skill}>
                <div className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span>{row.skill}</span>
                  <span className="tabular-nums text-muted">{row.count}</span>
                </div>
                <div className="jp-track mt-0.5">
                  <div
                    className="bg-brand"
                    style={{
                      width: `${Math.round((row.count / (demanded[0]?.count || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {funnel.submitted > 0 ? (
        <section className="jp-card">
          <h2 className="jp-section-title mb-2">
            <Icon name="trending" size={12} />
            Воронка откликов
          </h2>
          <ul className="flex flex-col gap-2">
            {funnel.steps.map((step) => (
              <li key={step.stage}>
                <div className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="font-medium">{FUNNEL_STEP_LABEL[step.stage]}</span>
                  <span className="tabular-nums">
                    {step.count}
                    {step.stage !== 'submitted' ? (
                      <span className="ml-1.5 text-[11px] text-muted">{step.share}%</span>
                    ) : null}
                  </span>
                </div>
                <div className="jp-track mt-1">
                  <div
                    className={step.stage === 'offer' ? 'bg-excellent' : 'bg-brand'}
                    style={{ width: `${step.share}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Ждут ответа: {funnel.awaiting} · отказов: {funnel.rejected}. Ступень засчитывается, даже
            если потом пришёл отказ, — интервью было.
          </p>
        </section>
      ) : null}

      {submissions.length > 0 ? (
        <section className="jp-card">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h2 className="jp-section-title">
              <Icon name="send" size={12} />
              Последние отклики
            </h2>
            <button
              type="button"
              className="jp-button-ghost jp-button-sm"
              onClick={openSubmissionHistory}
            >
              Вся история
              <Icon name="chevronRight" size={12} />
            </button>
          </div>
          <ul className="flex flex-col">
            {recentSubmissions.map((record) => (
              <li
                key={record.id}
                className="flex items-center justify-between gap-2 border-b border-border py-1.5 text-[12px] last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{record.title || 'Вакансия без названия'}</p>
                  <p className="truncate text-[10px] text-muted">
                    {record.company || record.hostname || 'источник неизвестен'}
                  </p>
                </div>
                <span className="flex flex-shrink-0 items-center gap-1 text-[10px] text-muted">
                  {record.source === 'auto' ? (
                    <Icon name="bolt" size={10} />
                  ) : (
                    <Icon name="check" size={10} strokeWidth={2.4} />
                  )}
                  {formatRelative(record.at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stats.topMissing.length > 0 ? (
        <section className="jp-card">
          <h2 className="jp-section-title mb-1.5">
            <Icon name="alert" size={12} />
            Чего чаще всего не хватает
          </h2>
          <ul className="flex flex-wrap gap-1">
            {stats.topMissing.map(([skill, count]) => (
              <li key={skill} className="jp-badge bg-weak/10 text-weak">
                {skill} <span className="opacity-70">×{count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-muted">
            Освоив первый пункт, вы улучшите совпадение по {stats.topMissing[0]?.[1] ?? 0}{' '}
            проанализированным вакансиям.
          </p>
        </section>
      ) : null}

      {stats.recommendedRoles.length > 0 ? (
        <section className="jp-card">
          <h2 className="jp-section-title mb-1.5">
            <Icon name="target" size={12} />
            Какие роли подходят вам чаще всего
          </h2>
          <ul className="flex flex-col text-[12px]">
            {stats.recommendedRoles.map(([role, count]) => (
              <li
                key={role}
                className="flex justify-between gap-2 border-b border-border py-1 last:border-0"
              >
                <span className="truncate">{role}</span>
                <span className="flex-shrink-0 tabular-nums text-muted">×{count}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h2 className="jp-section-title">
            <Icon name="briefcase" size={12} />
            Последние вакансии
          </h2>
          <button
            type="button"
            className="jp-button-ghost jp-button-sm"
            onClick={() => navigate('jobs')}
          >
            Все вакансии
            <Icon name="chevronRight" size={12} />
          </button>
        </div>
        {recent.length === 0 ? (
          <Empty
            icon="briefcase"
            title="Вакансий пока нет"
            hint="Откройте вакансию и нажмите «Анализировать эту вакансию» или запустите массовый анализ на странице поиска."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                analysis={analyses[job.id]}
                onAnalyze={() => actions.analyze(job)}
                onSave={() => actions.save(job)}
                onOpen={() => actions.open(job)}
                onPrepare={() => actions.prepare(job)}
                onSelect={() => navigate('job', job.id)}
                onArchive={() => actions.archive(job)}
                onRestore={() => actions.restore(job)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
