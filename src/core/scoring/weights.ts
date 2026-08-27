import type { RecommendationBand } from '@/types/ai';
import {
  DEFAULT_SCORE_WEIGHTS,
  SCORE_COMPONENTS,
  type ScoreComponent,
  type ScoreWeights,
} from '@/types/settings';

export { DEFAULT_SCORE_WEIGHTS, SCORE_COMPONENTS };
export type { ScoreComponent, ScoreWeights };

/** Опубликованные в README веса. В сумме обязаны давать 100. */
export const SCORE_WEIGHTS = DEFAULT_SCORE_WEIGHTS;

export const TOTAL_WEIGHT = Object.values(SCORE_WEIGHTS).reduce((sum, w) => sum + w, 0);

export const SCORE_COMPONENT_LABELS: Record<ScoreComponent, string> = {
  technicalSkills: 'Технические навыки',
  experience: 'Опыт',
  seniority: 'Уровень',
  location: 'Локация',
  salary: 'Зарплата',
  language: 'Языки',
  responsibilities: 'Обязанности',
  other: 'Прочее',
};

/**
 * Приводит любые ползунки к целым весам, дающим ровно 100. Ровно — потому что
 * сумма весов и есть максимум балла: разъедься она на единицу, и «100 %» стало
 * бы недостижимым либо превышаемым, а разбор перестал бы сходиться с итогом.
 *
 * Остаток раздаётся методом наибольших дробных частей, при равенстве — тому
 * компоненту, у которого больше вес: так вес не перетекает к мелочи.
 */
export function normalizeWeights(input?: Partial<ScoreWeights> | null): ScoreWeights {
  const raw = SCORE_COMPONENTS.map((component) => {
    const value = input?.[component] ?? DEFAULT_SCORE_WEIGHTS[component];
    return Number.isFinite(value) ? Math.max(0, value as number) : 0;
  });
  const total = raw.reduce((sum, value) => sum + value, 0);
  // Все ползунки в нуле — считать было бы нечем, возвращаем веса по умолчанию.
  if (total <= 0) return { ...DEFAULT_SCORE_WEIGHTS };

  const exact = raw.map((value) => (value * 100) / total);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value), weight: value }))
    .sort((a, b) => b.fraction - a.fraction || b.weight - a.weight || a.index - b.index);

  const result = [...floors];
  for (const entry of order) {
    if (remainder <= 0) break;
    result[entry.index] = (result[entry.index] as number) + 1;
    remainder -= 1;
  }

  return SCORE_COMPONENTS.reduce((acc, component, index) => {
    acc[component] = result[index] as number;
    return acc;
  }, {} as ScoreWeights);
}

/**
 * Подпись весов — часть ключа кеша анализов. Другие приоритеты дают другой балл,
 * и переиспользовать старый разбор нельзя.
 */
export function weightsKey(weights: ScoreWeights): string {
  return SCORE_COMPONENTS.map((component) => weights[component]).join('-');
}

export const DEFAULT_WEIGHTS_KEY = weightsKey(DEFAULT_SCORE_WEIGHTS);

export interface WeightPreset {
  id: string;
  label: string;
  hint: string;
  weights: ScoreWeights;
}

/** Готовые расклады приоритетов. Каждый уже даёт 100 — нормализация их не трогает. */
export const WEIGHT_PRESETS: WeightPreset[] = [
  {
    id: 'balanced',
    label: 'Баланс',
    hint: 'Веса по умолчанию: стек решает, остальное уточняет.',
    weights: { ...DEFAULT_SCORE_WEIGHTS },
  },
  {
    id: 'stack',
    label: 'Стек',
    hint: 'Технологии и обязанности важнее условий.',
    weights: {
      technicalSkills: 50,
      experience: 10,
      seniority: 8,
      location: 6,
      salary: 6,
      language: 5,
      responsibilities: 10,
      other: 5,
    },
  },
  {
    id: 'money',
    label: 'Деньги',
    hint: 'Зарплата весит столько же, сколько стек.',
    weights: {
      technicalSkills: 30,
      experience: 12,
      seniority: 8,
      location: 8,
      salary: 30,
      language: 4,
      responsibilities: 4,
      other: 4,
    },
  },
  {
    id: 'remote',
    label: 'Удалёнка',
    hint: 'Формат работы и локация наравне со стеком.',
    weights: {
      technicalSkills: 30,
      experience: 10,
      seniority: 8,
      location: 30,
      salary: 10,
      language: 5,
      responsibilities: 4,
      other: 3,
    },
  },
  {
    id: 'growth',
    label: 'Рост',
    hint: 'Уровень и опыт: вакансии на ступень выше не проваливаются в конец.',
    weights: {
      technicalSkills: 32,
      experience: 20,
      seniority: 22,
      location: 8,
      salary: 8,
      language: 4,
      responsibilities: 4,
      other: 2,
    },
  },
];

/** id пресета с ровно такими весами, иначе `custom`. */
export function presetForWeights(weights: ScoreWeights): string {
  const key = weightsKey(normalizeWeights(weights));
  return WEIGHT_PRESETS.find((preset) => weightsKey(preset.weights) === key)?.id ?? 'custom';
}

export const BAND_THRESHOLDS: { min: number; band: RecommendationBand; label: string }[] = [
  { min: 90, band: 'strong_match', label: 'Отличное совпадение' },
  { min: 75, band: 'good_match', label: 'Хорошее совпадение' },
  { min: 60, band: 'potential_match', label: 'Возможный вариант' },
  { min: 40, band: 'weak_match', label: 'Слабое совпадение' },
  { min: 0, band: 'not_suitable', label: 'Не подходит' },
];

export function bandForScore(score: number): RecommendationBand {
  return BAND_THRESHOLDS.find((entry) => score >= entry.min)?.band ?? 'not_suitable';
}

export function labelForBand(band: RecommendationBand): string {
  return BAND_THRESHOLDS.find((entry) => entry.band === band)?.label ?? 'Неизвестно';
}

/** Доступный индикатор без опоры на цвет — идёт в паре с цветовой кодировкой. */
export const BAND_GLYPH: Record<RecommendationBand, string> = {
  strong_match: '★★★',
  good_match: '★★',
  potential_match: '★',
  weak_match: '△',
  not_suitable: '✕',
};
