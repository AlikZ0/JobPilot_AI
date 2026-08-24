import type { RecommendationBand, ScoreBreakdown } from '@/types/ai';
import { BAND_GLYPH, labelForBand } from '@/core/scoring/weights';

const BAND_CLASS: Record<RecommendationBand, string> = {
  strong_match: 'text-excellent border-excellent/40 bg-excellent/10',
  good_match: 'text-good border-good/40 bg-good/10',
  potential_match: 'text-potential border-potential/40 bg-potential/10',
  weak_match: 'text-weak border-weak/40 bg-weak/10',
  not_suitable: 'text-poor border-poor/40 bg-poor/10',
};

interface Props {
  score: number;
  band: RecommendationBand;
  size?: 'sm' | 'lg';
}

/**
 * Colour is never the only signal: the band label and a glyph are always
 * rendered next to the percentage (WCAG 1.4.1).
 */
export function MatchScore({ score, band, size = 'sm' }: Props) {
  const isLarge = size === 'lg';
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 ${BAND_CLASS[band]}`}
      role="img"
      aria-label={`Match score ${score} percent, ${labelForBand(band)}`}
    >
      <span
        className={isLarge ? 'text-2xl font-bold leading-none' : 'text-sm font-bold leading-none'}
      >
        {score}%
      </span>
      <span className="flex flex-col leading-tight">
        <span className={isLarge ? 'text-[12px] font-semibold' : 'text-[10px] font-semibold'}>
          {labelForBand(band)}
        </span>
        <span aria-hidden="true" className="text-[10px] tracking-widest">
          {BAND_GLYPH[band]}
        </span>
      </span>
    </div>
  );
}

const COMPONENT_LABELS: Record<keyof ScoreBreakdown, string> = {
  technicalSkills: 'Technical skills',
  experience: 'Experience',
  seniority: 'Seniority',
  location: 'Location',
  salary: 'Salary',
  language: 'Language',
  responsibilities: 'Responsibilities',
  other: 'Other',
};

export function ScoreBreakdownList({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <ul className="flex flex-col gap-2">
      {(Object.keys(COMPONENT_LABELS) as (keyof ScoreBreakdown)[]).map((key) => {
        const part = breakdown[key];
        const ratio = part.earned / part.max;
        return (
          <li key={key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-medium">{COMPONENT_LABELS[key]}</span>
              <span className="font-mono text-[12px] tabular-nums">
                {part.earned}/{part.max}
              </span>
            </div>
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
              role="meter"
              aria-valuenow={part.earned}
              aria-valuemin={0}
              aria-valuemax={part.max}
              aria-label={COMPONENT_LABELS[key]}
            >
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
            {part.detail ? <p className="mt-1 text-[11px] text-muted">{part.detail}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
