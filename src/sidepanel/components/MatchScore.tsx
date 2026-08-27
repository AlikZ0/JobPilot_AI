import type { RecommendationBand, ScoreBreakdown } from '@/types/ai';
import { BAND_GLYPH, SCORE_COMPONENT_LABELS, labelForBand } from '@/core/scoring/weights';

const BAND_TEXT: Record<RecommendationBand, string> = {
  strong_match: 'text-excellent',
  good_match: 'text-good',
  potential_match: 'text-potential',
  weak_match: 'text-weak',
  not_suitable: 'text-poor',
};

interface Props {
  score: number;
  band: RecommendationBand;
  size?: 'sm' | 'lg';
}

/**
 * Балл в виде кольца: заполнение сразу показывает, насколько вакансия близка
 * к 100 %. Цвет никогда не единственный сигнал — рядом всегда есть число,
 * подпись уровня и значок (WCAG 1.4.1).
 */
export function MatchScore({ score, band, size = 'sm' }: Props) {
  const isLarge = size === 'lg';
  const dimension = isLarge ? 68 : 46;
  const thickness = isLarge ? 6 : 4.5;
  const radius = (dimension - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(100, score)) / 100;

  return (
    <div
      className={`inline-flex flex-shrink-0 ${
        // В карточке подпись уходит под кольцо: так заголовку вакансии
        // остаётся вся ширина строки.
        isLarge ? 'items-center gap-2' : 'w-[76px] flex-col items-center gap-1 text-center'
      }`}
      role="img"
      aria-label={`Совпадение ${score} процентов, ${labelForBand(band)}`}
    >
      <div
        className={`relative flex-shrink-0 ${BAND_TEXT[band]}`}
        style={{ width: dimension, height: dimension }}
      >
        <svg
          aria-hidden="true"
          width={dimension}
          height={dimension}
          viewBox={`0 0 ${dimension} ${dimension}`}
          className="-rotate-90"
        >
          <circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={thickness}
            className="opacity-[0.18]"
          />
          <circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - filled)}
            className="transition-[stroke-dashoffset] duration-500 ease-out"
          />
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center font-bold tabular-nums ${
            isLarge ? 'text-[18px]' : 'text-[13px]'
          }`}
        >
          {score}%
        </span>
      </div>
      <span
        className={`flex flex-col leading-tight ${BAND_TEXT[band]} ${
          isLarge ? '' : 'items-center'
        }`}
      >
        <span className={isLarge ? 'text-[13px] font-semibold' : 'text-[10px] font-semibold'}>
          {labelForBand(band)}
        </span>
        <span aria-hidden="true" className="text-[9px] tracking-widest opacity-80">
          {BAND_GLYPH[band]}
        </span>
      </span>
    </div>
  );
}

const COMPONENT_LABELS: Record<keyof ScoreBreakdown, string> = SCORE_COMPONENT_LABELS;

/** Цвет полоски повторяет шкалу балла: видно, где именно просело совпадение. */
function barColor(ratio: number): string {
  if (ratio >= 0.9) return 'bg-excellent';
  if (ratio >= 0.7) return 'bg-good';
  if (ratio >= 0.5) return 'bg-potential';
  if (ratio > 0) return 'bg-weak';
  return 'bg-poor';
}

export function ScoreBreakdownList({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {(Object.keys(COMPONENT_LABELS) as (keyof ScoreBreakdown)[]).map((key) => {
        const part = breakdown[key];
        // Вес компонента можно увести в ноль — тогда делить не на что, а строку
        // всё равно показываем: пропасть без объяснения хуже, чем прочерк.
        const ratio = part.max > 0 ? part.earned / part.max : 0;
        return (
          <li key={key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className={`text-[12px] font-medium ${part.max === 0 ? 'text-muted' : ''}`}>
                {COMPONENT_LABELS[key]}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-muted">
                {part.max === 0 ? 'не учитывается' : `${part.earned}/${part.max}`}
              </span>
            </div>
            <div
              className="jp-track mt-1"
              role="meter"
              aria-valuenow={part.earned}
              aria-valuemin={0}
              aria-valuemax={part.max}
              aria-label={COMPONENT_LABELS[key]}
            >
              <div className={barColor(ratio)} style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
            {part.detail ? <p className="mt-1 text-[11px] text-muted">{part.detail}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
