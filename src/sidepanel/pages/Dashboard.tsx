import { useMemo } from 'react';
import { useStore } from '../state/store';
import { PageActions } from '../components/PageActions';
import { JobCard } from '../components/JobCard';
import { Empty } from '../components/Empty';
import { isToday } from '@/utils/time';
import { useJobActions } from '../hooks/useJobActions';

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="jp-card py-2">
      <p className="text-[18px] font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] font-medium">{label}</p>
      {hint ? <p className="text-[10px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Dashboard() {
  const jobs = useStore((state) => state.jobs);
  const analyses = useStore((state) => state.analyses);
  const applications = useStore((state) => state.applications);
  const navigate = useStore((state) => state.navigate);
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
      submitted: applications.filter((app) => app.state === 'submitted').length,
      topMissing,
      recommendedRoles: [...roleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [jobs, analyses, applications]);

  const recent = jobs.slice(0, 5);

  return (
    <div className="flex flex-col gap-3">
      <PageActions />

      <section>
        <h2 className="jp-section-title mb-1.5">Сегодня</h2>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Проанализировано" value={stats.analyzedToday} />
          <Stat label="Хорошие" value={stats.good} hint="75–89%" />
          <Stat label="Отличные" value={stats.excellent} hint="90%+" />
          <Stat label="Заявок готово" value={stats.prepared} />
          <Stat label="Отправлено" value={stats.submitted} />
          <Stat label="Средний балл" value={`${stats.average}%`} />
        </div>
      </section>

      {stats.topMissing.length > 0 ? (
        <section className="jp-card">
          <h2 className="jp-section-title mb-1.5">Чего чаще всего не хватает</h2>
          <ul className="flex flex-wrap gap-1">
            {stats.topMissing.map(([skill, count]) => (
              <li key={skill} className="jp-badge">
                {skill} <span className="text-muted">×{count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted">
            Освоив первый пункт, вы улучшите совпадение по {stats.topMissing[0]?.[1] ?? 0}{' '}
            проанализированным вакансиям.
          </p>
        </section>
      ) : null}

      {stats.recommendedRoles.length > 0 ? (
        <section className="jp-card">
          <h2 className="jp-section-title mb-1.5">Какие роли подходят вам чаще всего</h2>
          <ul className="flex flex-col gap-0.5 text-[12px]">
            {stats.recommendedRoles.map(([role, count]) => (
              <li key={role} className="flex justify-between gap-2">
                <span className="truncate">{role}</span>
                <span className="text-muted">×{count}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="jp-section-title">Последние вакансии</h2>
          <button type="button" className="jp-button-ghost" onClick={() => navigate('jobs')}>
            Все вакансии
          </button>
        </div>
        {recent.length === 0 ? (
          <Empty
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
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
