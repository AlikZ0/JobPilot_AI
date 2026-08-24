import type { RecommendationBand } from '@/types/ai';

/** Опубликованные в README веса. В сумме обязаны давать 100. */
export const SCORE_WEIGHTS = {
  technicalSkills: 40,
  experience: 15,
  seniority: 10,
  location: 10,
  salary: 10,
  language: 5,
  responsibilities: 5,
  other: 5,
} as const;

export type ScoreComponent = keyof typeof SCORE_WEIGHTS;

export const TOTAL_WEIGHT = Object.values(SCORE_WEIGHTS).reduce((sum, w) => sum + w, 0);

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
