import { useMemo, useState } from 'react';
import type { JobState } from '@/types/job';
import { useStore } from '../state/store';
import { JobCard } from '../components/JobCard';
import { Empty } from '../components/Empty';
import { Icon } from '../components/Icon';
import { useJobActions } from '../hooks/useJobActions';
import { collectTags, isArchived } from '@/core/pipeline/triage';

type SortKey = 'score' | 'recent';

const STATE_FILTERS: { value: 'all' | JobState; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'analyzed', label: 'Проанализированные' },
  { value: 'saved', label: 'Сохранённые' },
  { value: 'application_ready', label: 'Заявка готова' },
  { value: 'submitted', label: 'Отправленные' },
  // Архив последним и только по явному запросу: он для того и архив.
  { value: 'rejected', label: 'В архиве' },
];

export function Jobs() {
  const jobs = useStore((state) => state.jobs);
  const analyses = useStore((state) => state.analyses);
  const navigate = useStore((state) => state.navigate);
  const hiddenByCompany = useStore((state) => state.hiddenByCompany);
  const actions = useJobActions();

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | JobState>('all');
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState<SortKey>('score');
  const [tag, setTag] = useState('');

  const tags = useMemo(() => collectTags(jobs), [jobs]);
  // Пометку могли снять с последней вакансии, пока фильтр по ней включён. Тогда
  // чип исчезает, а список остаётся пустым и снять фильтр уже нечем.
  const activeTag = tags.includes(tag) ? tag : '';

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = jobs.filter((job) => {
      // Архив не мешается в общем списке: чтобы его увидеть, его надо выбрать.
      if (stateFilter !== 'rejected' && isArchived(job)) return false;
      if (stateFilter !== 'all' && job.state !== stateFilter) return false;
      if (activeTag && !job.tags.includes(activeTag)) return false;
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
  }, [jobs, search, stateFilter, minScore, sort, activeTag]);

  if (jobs.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center">
        <Empty
          icon="briefcase"
          title="Вакансий пока нет"
          hint="Откройте вакансию на сайте и нажмите «Анализировать» — она появится здесь."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-col gap-2.5">
        {/* Поле поиска в стиле системного: заливка вместо рамки, круглая форма. */}
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" size={14} />
          </span>
          <input
            className="jp-input rounded-full border-transparent bg-surface-3 pl-9 pr-8 hover:border-transparent"
            type="search"
            placeholder="Должность, компания или технология"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Поиск вакансий"
          />
          {search ? (
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full text-muted transition hover:text-content"
              onClick={() => setSearch('')}
              aria-label="Очистить поиск"
            >
              <Icon name="xCircle" size={15} />
            </button>
          ) : null}
        </div>

        {/* Фильтры уезжают вбок, а не переносятся: строка остаётся одной. */}
        <div className="-mx-3.5 overflow-x-auto px-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="jp-segmented w-max">
            {STATE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStateFilter(filter.value)}
                aria-pressed={stateFilter === filter.value}
                className="whitespace-nowrap"
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {tags.length > 0 ? (
          <div className="-mx-3.5 overflow-x-auto px-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max items-center gap-1">
              <span className="mr-1 flex-shrink-0 text-[11px] text-muted">Пометки:</span>
              {tags.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={`jp-chip whitespace-nowrap ${activeTag === entry ? 'jp-chip-active' : ''}`}
                  aria-pressed={activeTag === entry}
                  onClick={() => setTag(activeTag === entry ? '' : entry)}
                >
                  {entry}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="flex items-center gap-2.5 text-[11px] text-muted">
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
      </div>

      {/* Заголовок списка: сколько нашлось и в каком порядке показано. */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-[11px] text-muted">
          Показано {visible.length} из {jobs.length}
          {hiddenByCompany > 0 ? ` · скрыто компаний: ${hiddenByCompany}` : ''}
        </p>
        <label className="flex flex-shrink-0 items-center">
          <span className="sr-only">Сортировка</span>
          <select
            className="jp-input w-auto border-transparent bg-surface-3 py-1 pl-3 text-[11px] font-medium hover:border-transparent"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            aria-label="Сортировка"
          >
            <option value="score">Лучшее совпадение</option>
            <option value="recent">Сначала новые</option>
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center">
          <Empty
            icon="search"
            title="Под эти фильтры ничего не подходит"
            hint="Снизьте минимальный балл или очистите поиск."
          />
        </div>
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
              onArchive={() => actions.archive(job)}
              onRestore={() => actions.restore(job)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
