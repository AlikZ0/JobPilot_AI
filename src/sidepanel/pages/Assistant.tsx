import { useEffect, useRef, useState } from 'react';
import { MESSAGE_TYPES } from '@/types/messages';
import { sendToBackground } from '@/utils/messaging';
import {
  clearAssistantMessages,
  listAssistantMessages,
} from '@/database/repositories/assistantRepository';
import { useStore, withBusy } from '../state/store';
import { Icon } from '../components/Icon';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'В каких сохранённых вакансиях нужны Node.js и Docker?',
  'Почему эта вакансия получила такой балл?',
  'Чего мне не хватает для senior backend?',
  'Какие технологии чаще всего встречаются в найденных вакансиях?',
];

export function Assistant() {
  const selectedJobId = useStore((state) => state.selectedJobId);
  const jobs = useStore((state) => state.jobs);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [jobContext, setJobContext] = useState<string>(selectedJobId ?? '');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void listAssistantMessages(40).then((messages) =>
      setTurns(messages.map((message) => ({ role: message.role, content: message.content }))),
    );
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns.length]);

  const ask = (question: string) =>
    void withBusy('Думаем', async () => {
      const prompt = question.trim();
      if (!prompt) return;
      setInput('');
      setTurns((current) => [...current, { role: 'user', content: prompt }]);
      const result = await sendToBackground(MESSAGE_TYPES.ASK_ASSISTANT, {
        prompt,
        ...(jobContext ? { jobId: jobContext } : {}),
        history: turns.slice(-6),
      });
      setTurns((current) => [...current, { role: 'assistant', content: result.answer }]);
      setFollowUps(result.followUps);
    });

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <label className="jp-label mb-0 flex flex-shrink-0 items-center gap-1" htmlFor="jp-context">
          <Icon name="target" size={12} />
          Контекст
        </label>
        <select
          id="jp-context"
          className="jp-input py-1"
          value={jobContext}
          onChange={(event) => setJobContext(event.target.value)}
        >
          <option value="">Все сохранённые вакансии</option>
          {jobs.slice(0, 60).map((job) => (
            <option key={job.id} value={job.id}>
              {job.title} — {job.company}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-surface-2 p-2">
        {turns.length === 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-col items-center gap-1.5 px-2 py-3 text-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand">
                <Icon name="sparkles" size={18} />
              </span>
              <p className="text-[12px] leading-snug text-muted">
                Ассистент видит только тот срез ваших локальных данных, который нужен для вопроса.
              </p>
            </div>
            <p className="jp-section-title px-1">
              <Icon name="message" size={12} />С чего начать
            </p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="jp-button h-auto justify-start gap-2 py-2 text-left leading-snug"
                onClick={() => ask(suggestion)}
              >
                <Icon name="chevronRight" size={12} />
                <span className="flex-1">{suggestion}</span>
              </button>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {turns.map((turn, index) => (
              <li
                key={index}
                className={`jp-animate-in max-w-[92%] rounded-xl px-2.5 py-2 text-[12px] ${
                  turn.role === 'user'
                    ? 'ml-auto bg-brand text-brand-fg'
                    : 'mr-auto border border-border bg-surface'
                }`}
              >
                <p
                  className={`mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${
                    turn.role === 'user' ? 'opacity-70' : 'text-muted'
                  }`}
                >
                  <Icon name={turn.role === 'user' ? 'user' : 'sparkles'} size={10} />
                  {turn.role === 'user' ? 'Вы' : 'JobPilot'}
                </p>
                <p className="whitespace-pre-wrap leading-relaxed">{turn.content}</p>
              </li>
            ))}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      {followUps.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {followUps.map((followUp) => (
            <button key={followUp} type="button" className="jp-chip" onClick={() => ask(followUp)}>
              <Icon name="chevronRight" size={11} />
              {followUp}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex gap-1.5">
        <input
          className="jp-input"
          placeholder="Спросите про вакансии, пробелы в навыках или конкретную позицию…"
          aria-label="Вопрос ассистенту"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              ask(input);
            }
          }}
        />
        <button
          type="button"
          className="jp-button-primary flex-shrink-0"
          onClick={() => ask(input)}
          title="Отправить вопрос (Enter)"
        >
          <Icon name="send" size={13} />
          Спросить
        </button>
        <button
          type="button"
          className="jp-button flex-shrink-0 px-2"
          onClick={() =>
            void clearAssistantMessages().then(() => {
              setTurns([]);
              setFollowUps([]);
            })
          }
          title="Очистить переписку"
          aria-label="Очистить переписку"
        >
          <Icon name="eraser" size={14} />
        </button>
      </div>
    </div>
  );
}
