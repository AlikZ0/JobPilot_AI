import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { Empty } from '../components/Empty';
import { Icon } from '../components/Icon';
import { useJobActions } from '../hooks/useJobActions';
import { EMPLOYMENT_TYPE_LABEL } from '../labels';

export function JobDetail() {
  const jobId = useStore((state) => state.selectedJobId);
  const job = useStore((state) => state.jobs.find((entry) => entry.id === jobId));
  const analysis = useStore((state) => (jobId ? state.analyses[jobId] : undefined));
  const navigate = useStore((state) => state.navigate);
  const actions = useJobActions();
  const saved = job ? job.savedAt !== null || job.state === 'saved' : false;
  const archived = job?.state === 'rejected';

  const [notes, setNotes] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  // Заметка редактируется локально, а в базу уходит по кнопке: сохранять на
  // каждое нажатие клавиши значило бы дёргать всё состояние приложения.
  useEffect(() => setNotes(job?.notes ?? ''), [job?.id, job?.notes]);

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
      <button
        type="button"
        className="jp-button-ghost jp-button-sm self-start"
        onClick={() => navigate('jobs')}
      >
        <Icon name="chevronLeft" size={13} />
        Все вакансии
      </button>

      <header>
        <h2 className="text-[16px] font-semibold leading-snug">{job.title}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-muted">
          <span className="flex items-center gap-1">
            <Icon name="briefcase" size={12} />
            {job.company}
          </span>
          {job.location ? (
            <span className="flex items-center gap-1">
              <Icon name="pin" size={12} />
              {job.location}
            </span>
          ) : null}
          {job.employmentType !== 'unknown' ? (
            <span className="flex items-center gap-1">
              <Icon name="clock" size={12} />
              {EMPLOYMENT_TYPE_LABEL[job.employmentType]}
            </span>
          ) : null}
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="jp-button-primary jp-button-sm"
          onClick={() => actions.prepare(job)}
        >
          <Icon name="send" size={13} />
          Подготовить заявку
        </button>
        <button
          type="button"
          className="jp-button jp-button-sm"
          onClick={() => actions.analyze(job)}
        >
          <Icon name="refresh" size={13} />
          Проанализировать заново
        </button>
        <button
          type="button"
          className={`jp-button jp-button-sm ${saved ? 'text-brand' : ''}`}
          onClick={() => actions.save(job)}
          disabled={saved}
          title={saved ? 'Вакансия уже сохранена' : 'Сохранить вакансию'}
        >
          <Icon name="bookmark" size={13} />
          {saved ? 'Сохранена' : 'Сохранить'}
        </button>
        <button
          type="button"
          className="jp-button-ghost jp-button-sm"
          onClick={() => actions.open(job)}
        >
          <Icon name="external" size={13} />
          Открыть вакансию
        </button>
        {archived ? (
          <button
            type="button"
            className="jp-button jp-button-sm"
            onClick={() => actions.restore(job)}
          >
            <Icon name="refresh" size={13} />
            Вернуть из архива
          </button>
        ) : (
          <button
            type="button"
            className="jp-button-ghost jp-button-sm"
            onClick={() => actions.archive(job)}
            title="Убрать из списка, не удаляя"
          >
            <Icon name="eraser" size={13} />
            Не интересно
          </button>
        )}
      </div>

      <section className="jp-card flex flex-col gap-2">
        <h3 className="jp-section-title">Ваши пометки</h3>
        <ul className="flex flex-wrap gap-1">
          {job.tags.map((tag) => (
            <li key={tag} className="jp-badge gap-1.5">
              {tag}
              <button
                type="button"
                aria-label={`Убрать пометку ${tag}`}
                className="rounded-full text-muted transition hover:text-poor"
                onClick={() => void actions.removeTag(job, tag)}
              >
                <Icon name="x" size={11} strokeWidth={2.4} />
              </button>
            </li>
          ))}
          {job.tags.length === 0 ? (
            <li className="text-[11px] text-muted">Пометок пока нет.</li>
          ) : null}
        </ul>
        <div className="flex gap-1.5">
          <input
            className="jp-input"
            placeholder="Например: удалёнка, хорошая зп, спросить про овертаймы"
            aria-label="Новая пометка"
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              void actions.addTag(job, tagDraft).then(() => setTagDraft(''));
            }}
          />
          <button
            type="button"
            className="jp-button flex-shrink-0"
            disabled={!tagDraft.trim()}
            onClick={() => void actions.addTag(job, tagDraft).then(() => setTagDraft(''))}
          >
            <Icon name="plus" size={13} />
            Добавить
          </button>
        </div>

        <textarea
          className="jp-input min-h-[80px]"
          placeholder="Заметка: с кем говорили, что обещали, о чём спросить"
          aria-label="Заметка по вакансии"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <button
          type="button"
          className={notes !== job.notes ? 'jp-button-primary self-start' : 'jp-button self-start'}
          disabled={notes === job.notes}
          onClick={() => void actions.saveNotes(job, notes)}
        >
          {notes === job.notes ? 'Заметка сохранена' : 'Сохранить заметку'}
        </button>
      </section>

      {analysis ? (
        <AnalysisPanel job={job} analysis={analysis} />
      ) : (
        <Empty
          icon="target"
          title="Ещё не проанализирована"
          hint="Запустите анализ, чтобы увидеть разбор балла."
          action={{ label: 'Анализировать', onClick: () => actions.analyze(job) }}
        />
      )}
    </div>
  );
}
