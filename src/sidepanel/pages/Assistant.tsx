import { useEffect, useRef, useState } from 'react';
import { MESSAGE_TYPES } from '@/types/messages';
import { sendToBackground } from '@/utils/messaging';
import {
  clearAssistantMessages,
  listAssistantMessages,
} from '@/database/repositories/assistantRepository';
import { useStore, withBusy } from '../state/store';

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
        <label className="jp-label mb-0 flex-shrink-0">Контекст</label>
        <select
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

      <div className="flex-1 overflow-y-auto rounded-md border border-border bg-surface-2 p-2">
        {turns.length === 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[12px] text-muted">
              Ассистент видит только тот срез ваших локальных данных, который нужен для вопроса.
            </p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="jp-button justify-start text-left"
                onClick={() => ask(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {turns.map((turn, index) => (
              <li
                key={index}
                className={`rounded-md px-2 py-1.5 text-[12px] ${
                  turn.role === 'user'
                    ? 'ml-6 bg-brand/10 text-content'
                    : 'mr-2 border border-border bg-surface'
                }`}
              >
                <p className="mb-0.5 text-[10px] font-semibold uppercase text-muted">
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
            <button key={followUp} type="button" className="jp-badge" onClick={() => ask(followUp)}>
              {followUp}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex gap-1.5">
        <input
          className="jp-input"
          placeholder="Спросите про вакансии, пробелы в навыках или конкретную позицию…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              ask(input);
            }
          }}
        />
        <button type="button" className="jp-button-primary" onClick={() => ask(input)}>
          Спросить
        </button>
        <button
          type="button"
          className="jp-button"
          onClick={() =>
            void clearAssistantMessages().then(() => {
              setTurns([]);
              setFollowUps([]);
            })
          }
          title="Очистить переписку"
        >
          Очистить
        </button>
      </div>
    </div>
  );
}
