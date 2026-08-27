import { useState } from 'react';
import { DEFAULT_SCORE_WEIGHTS, SCORE_COMPONENTS, type ScoreComponent } from '@/types/settings';
import {
  SCORE_COMPONENT_LABELS,
  WEIGHT_PRESETS,
  normalizeWeights,
  presetForWeights,
} from '@/core/scoring/weights';
import { rescoreStoredJobs } from '@/core/scoring/rescore';
import { useStore, withBusy } from '../state/store';
import { Icon } from './Icon';

/** Верхняя граница ползунка. Дальше двигать нечего: важность задаёт доля, а не число. */
const SLIDER_MAX = 60;

const COMPONENT_HINTS: Record<ScoreComponent, string> = {
  technicalSkills: 'Покрытие стека вакансии и незакрытые обязательные технологии.',
  experience: 'Ваши годы против требуемых.',
  seniority: 'Насколько уровень вакансии совпадает с вашим.',
  location: 'Формат работы, город, страна и готовность к переезду.',
  salary: 'Вилка вакансии против ваших ожиданий.',
  language: 'Требования по языкам против ваших уровней.',
  responsibilities: 'Насколько задачи совпадают с тем, что вы делаете.',
  other: 'Тип занятости, красные флаги и ваши стоп-факторы.',
};

/**
 * Приоритеты, по которым считается балл. Ползунки — это «важность», а не сами
 * баллы: к сотне их приводит `normalizeWeights`, и рядом всегда написано, во
 * сколько баллов важность превратилась. Иначе сдвиг одного ползунка молча менял
 * бы максимумы всех остальных компонентов.
 */
export function ScoringWeights() {
  const settings = useStore((state) => state.settings);
  const profile = useStore((state) => state.profile);
  const updateSettings = useStore((state) => state.updateSettings);
  const refreshData = useStore((state) => state.refreshData);
  const pushToast = useStore((state) => state.pushToast);
  const reportError = useStore((state) => state.reportError);
  const [progress, setProgress] = useState('');

  if (!settings) return null;

  const raw = settings.scoring.weights;
  const normalized = normalizeWeights(raw);
  const rawTotal = SCORE_COMPONENTS.reduce((sum, component) => sum + raw[component], 0);
  const activePreset = settings.scoring.preset;

  const applyPreset = (id: string) => {
    const preset = WEIGHT_PRESETS.find((entry) => entry.id === id);
    if (!preset) return;
    void updateSettings({ scoring: { weights: { ...preset.weights }, preset: preset.id } });
  };

  const setWeight = (component: ScoreComponent, value: number) => {
    const next = { ...raw, [component]: value };
    void updateSettings({ scoring: { weights: next, preset: presetForWeights(next) } });
  };

  const rescore = () =>
    void withBusy('Пересчитываем баллы', async () => {
      if (!profile) return;
      try {
        const outcome = await rescoreStoredJobs(profile, settings, (done, total) =>
          setProgress(`${done} / ${total}`),
        );
        await refreshData();
        if (outcome.total === 0) {
          pushToast({ level: 'info', message: 'Пересчитывать нечего: анализов пока нет.' });
          return;
        }
        const parts = [`Пересчитано ${outcome.rescored} из ${outcome.total}`];
        if (outcome.changed) parts.push(`балл изменился у ${outcome.changed}`);
        if (outcome.upToDate) parts.push(`${outcome.upToDate} уже были по текущим весам`);
        if (outcome.withoutFindings) {
          parts.push(`${outcome.withoutFindings} без выводов AI — они не сохранялись`);
        }
        pushToast({ level: 'success', message: `${parts.join(', ')}.` });
      } catch (error) {
        reportError(error);
      } finally {
        setProgress('');
      }
    });

  return (
    <section className="jp-card flex flex-col gap-3">
      <h2 className="jp-section-title mb-0">
        <Icon name="sliders" size={12} />
        Что для вас важнее
      </h2>
      <p className="text-[11px] leading-relaxed text-muted">
        Веса восьми компонентов балла. Ползунок задаёт важность, а не баллы: сумма приводится к 100,
        и справа написано, во сколько баллов важность превратилась. AI на это не влияет — он и так
        никогда не называет процент.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {WEIGHT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`jp-chip ${activePreset === preset.id ? 'jp-chip-active' : ''}`}
            aria-pressed={activePreset === preset.id}
            title={preset.hint}
            onClick={() => applyPreset(preset.id)}
          >
            {preset.label}
          </button>
        ))}
        {activePreset === 'custom' ? (
          <span className="jp-badge text-muted" aria-current="true">
            Свой расклад
          </span>
        ) : null}
      </div>

      <p className="text-[11px] leading-relaxed text-muted">
        {WEIGHT_PRESETS.find((preset) => preset.id === activePreset)?.hint ??
          'Ползунки настроены вручную.'}
      </p>

      <ul className="flex flex-col gap-2.5">
        {SCORE_COMPONENTS.map((component) => {
          const points = normalized[component];
          return (
            <li key={component}>
              <div className="flex items-baseline justify-between gap-2">
                <label className="text-[12px] font-medium" htmlFor={`jp-weight-${component}`}>
                  {SCORE_COMPONENT_LABELS[component]}
                </label>
                <span className="font-mono text-[11px] tabular-nums text-muted">
                  {points === 0 ? 'не учитывается' : `${points} из 100`}
                </span>
              </div>
              <input
                id={`jp-weight-${component}`}
                type="range"
                min={0}
                max={SLIDER_MAX}
                step={1}
                value={raw[component]}
                aria-describedby={`jp-weight-hint-${component}`}
                aria-valuetext={`${points} из 100`}
                onChange={(event) => setWeight(component, Number(event.target.value))}
                className="mt-1 w-full"
              />
              <p id={`jp-weight-hint-${component}`} className="text-[11px] leading-snug text-muted">
                {COMPONENT_HINTS[component]}
              </p>
            </li>
          );
        })}
      </ul>

      {rawTotal === 0 ? (
        <p className="text-[11px] leading-snug text-poor">
          Все ползунки в нуле — считать нечем, поэтому балл считается весами по умолчанию.
        </p>
      ) : null}

      <div className="jp-divider" />

      <p className="text-[11px] leading-relaxed text-muted">
        Новые веса применяются к следующему анализу: старый разбор посчитан по другим максимумам и
        переиспользован не будет. Уже сохранённые вакансии пересчитываются по кнопке — к
        AI-провайдеру пересчёт не обращается.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="jp-button" onClick={rescore} disabled={!profile}>
          <Icon name="refresh" size={13} />
          Пересчитать сохранённые баллы
        </button>
        <button
          type="button"
          className="jp-button-ghost"
          onClick={() => applyPreset('balanced')}
          disabled={presetForWeights(raw) === 'balanced'}
        >
          Вернуть веса по умолчанию
        </button>
        {progress ? (
          <span className="font-mono text-[11px] tabular-nums text-muted">{progress}</span>
        ) : null}
      </div>
      <p className="text-[11px] leading-snug text-muted">
        По умолчанию:{' '}
        {SCORE_COMPONENTS.map(
          (component) => `${SCORE_COMPONENT_LABELS[component]} ${DEFAULT_SCORE_WEIGHTS[component]}`,
        ).join(' · ')}
        .
      </p>
    </section>
  );
}
