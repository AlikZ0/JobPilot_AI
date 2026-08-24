import { useMemo, useState } from 'react';
import type { JobState } from '@/types/job';
import { useStore } from '../state/store';
import { JobCard } from '../components/JobCard';
import { Empty } from '../components/Empty';
import { Icon } from '../components/Icon';
import { useJobActions } from '../hooks/useJobActions';

type SortKey = 'score' | 'recent';

const STATE_FILTERS: { value: 'all' | JobState; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'analyzed', label: 'Проанализированные' },
  { value: 'saved', label: 'Сохранённые' },
  { value: 'application_ready', label: 'Заявка готова' },
  { value: 'submitted', label: 'Отправленные' },
];

export function Jobs() {
  const jobs = useStore((state) => state.jobs);
  const analyses = useStore((state) => state.analyses);
  const navigate = useStore((state) => state.navigate);
  const actions = useJobActions();

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | JobState>('all');
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState<SortKey>('score');

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = jobs.filter((job) => {
      if (stateFilter !== 'all' && job.state !== stateFilter) return false;
      if ((job.score ?? 0) < minScore) return false;
      if (!needle) return true;
      return (
        job.title.toLowerCase().includes(needle) ||
        job.company.toLowerCase().includes(needle) ||
        job.technologies.some((tech) => tech.toLowerCase().includes(needle))
      );
    });
    return filtered.sort((a, b) =>
      sort === 'score' ? (b.score ?? -1) - (a.score ?? -1) : b.discoveredAt - a.discoveredAt,
    );
  }, [jobs, search, stateFilter, minScore, sort]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" size={14} />
          </span>
          <input
            className="jp-input pl-8"
            type="search"
            placeholder="Поиск по должности, компании или технологии"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Поиск вакансий"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStateFilter(filter.value)}
              aria-pressed={stateFilter === filter.value}
              className={`jp-chip ${stateFilter === filter.value ? 'jp-chip-active' : ''}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <label className="flex flex-1 items-center gap-1.5">
            <span className="flex-shrink-0">Мин. балл</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minScore}
              onChange={(event) => setMinScore(Number(event.target.value))}
              className="flex-1"
            />
            <span className="w-8 flex-shrink-0 text-right font-medium tabular-nums text-content">
              {minScore}%
            </span>
          </label>
          <label className="flex flex-shrink-0 items-center gap-1">
            <span className="sr-only">Сортировка</span>
            <Icon name="sliders" size={12} />
            <select
              className="jp-input w-auto py-0.5 text-[11px]"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              aria-label="Сортировка"
            >
              <option value="score">Лучшее совпадение</option>
              <option value="recent">Сначала новые</option>
            </select>
          </label>
        </div>
      </div>

      <p className="text-[11px] text-muted">
        Показано {visible.length} из {jobs.length}
      </p>

      {visible.length === 0 ? (
        <Empty
          icon="search"
          title="Под эти фильтры ничего не подходит"
          hint="Снизьте минимальный балл или очистите поиск."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((job) => (
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
    </div>
  );
}
