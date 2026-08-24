import type { JobAnalysis } from '@/types/ai';
import type { Job } from '@/types/job';
import { MatchScore, ScoreBreakdownList } from './MatchScore';
import { SkillBadge } from './SkillBadge';
import { Icon } from './Icon';
import { SEVERITY_LABEL, redFlagLabel } from '../labels';

interface Props {
  job: Job;
  analysis: JobAnalysis;
}

const SEVERITY_STYLE: Record<'low' | 'medium' | 'high', string> = {
  low: 'border-border bg-surface-3 text-muted',
  medium: 'border-potential/40 bg-potential/10 text-potential',
  high: 'border-poor/40 bg-poor/10 text-poor',
};

/** Полное объяснение балла: не просто «92%», а из чего он сложился. */
export function AnalysisPanel({ job, analysis }: Props) {
  const checks = [
    ['Уровень', analysis.seniorityMatch],
    ['Опыт', analysis.experienceMatch],
    ['Зарплата', analysis.salaryMatch],
    ['Локация', analysis.locationMatch],
    ['Языки', analysis.languageMatch],
  ] as const;

  return (
    <section className="flex flex-col gap-3">
      <div className="jp-card flex items-center justify-between gap-2">
        <MatchScore score={analysis.score} band={analysis.band} size="lg" />
        <div className="flex flex-col items-end gap-1 text-[10px] text-muted">
          <span className="jp-badge">
            <Icon name={analysis.usedAI ? 'sparkles' : 'shield'} size={11} />
            {analysis.usedAI ? (analysis.model ?? 'модель неизвестна') : 'Без AI'}
          </span>
          <span>Профиль v{analysis.profileVersion}</span>
        </div>
      </div>

      <div className="jp-card">
        <h3 className="jp-section-title mb-2.5">
          <Icon name="sliders" size={12} />
          Из чего сложился балл
        </h3>
        <ScoreBreakdownList breakdown={analysis.breakdown} />
      </div>

      <div className="jp-card">
        <h3 className="jp-section-title mb-2">
          <Icon name="bolt" size={12} />
          Навыки
        </h3>
        <div className="flex flex-wrap gap-1">
          {analysis.matchedSkills.map((skill) => (
            <SkillBadge key={`m-${skill}`} name={skill} kind="matched" />
          ))}
          {analysis.missingSkills.map((skill) => (
            <SkillBadge key={`x-${skill}`} name={skill} kind="missing" />
          ))}
          {analysis.bonusSkills.slice(0, 10).map((skill) => (
            <SkillBadge key={`b-${skill}`} name={skill} kind="bonus" />
          ))}
        </div>
        {analysis.versionMismatches.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-0.5 text-[11px] text-potential">
            {analysis.versionMismatches.map((mismatch) => (
              <li key={mismatch.skill}>
                ⚠ {mismatch.skill}: вакансии нужна версия {mismatch.required}, в профиле{' '}
                {mismatch.have.join(', ') || 'версия не указана'}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <Icon name="check" size={10} strokeWidth={2.6} /> есть у вас
          </span>
          <span className="flex items-center gap-1">
            <Icon name="alert" size={10} /> не хватает
          </span>
          <span className="flex items-center gap-1">
            <Icon name="plus" size={10} /> бонус
          </span>
        </p>
      </div>

      <div className="jp-card">
        <h3 className="jp-section-title mb-2">
          <Icon name="checkCircle" size={12} />
          Проверки
        </h3>
        <ul className="grid grid-cols-2 gap-1.5 text-[12px]">
          {checks.map(([label, value]) => (
            <li key={label} className="flex items-center gap-1.5">
              <span className={value ? 'text-excellent' : 'text-poor'}>
                <Icon name={value ? 'checkCircle' : 'xCircle'} size={13} />
              </span>
              <span className={value ? '' : 'text-muted'}>
                {label}: {value ? 'совпадает' : 'не совпадает'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {analysis.redFlags.length > 0 ? (
        <div className="jp-card border-weak/40 bg-weak/[0.06]">
          <h3 className="jp-section-title mb-2 text-weak">
            <Icon name="flag" size={12} />
            Красные флаги
          </h3>
          <ul className="flex flex-col gap-2">
            {analysis.redFlags.map((flag, index) => (
              <li key={`${flag.code}-${index}`} className="text-[12px]">
                <div className="flex items-center gap-1.5">
                  <span className={`jp-badge ${SEVERITY_STYLE[flag.severity]}`}>
                    {SEVERITY_LABEL[flag.severity]}
                  </span>
                  <span className="font-medium">{redFlagLabel(flag.code)}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{flag.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.reasoning ? (
        <div className="jp-card">
          <h3 className="jp-section-title mb-2">
            <Icon name="message" size={12} />
            Обоснование
          </h3>
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed">{analysis.reasoning}</p>
        </div>
      ) : null}

      <div className="jp-card">
        <h3 className="jp-section-title mb-2">
          <Icon name="file" size={12} />
          Текст вакансии
        </h3>
        <div className="flex flex-wrap items-center gap-1">
          <span className="jp-badge text-muted">источник: {job.source}</span>
          <span className="jp-badge text-muted">
            качество извлечения {Math.round(job.extractionQuality * 100)}%
          </span>
        </div>
        {job.requirements.length > 0 ? (
          <>
            <h4 className="mt-2.5 text-[12px] font-semibold">Требования</h4>
            <ul className="mt-1 flex flex-col gap-1 text-[12px] leading-snug">
              {job.requirements.slice(0, 12).map((line, index) => (
                <li key={index} className="flex gap-1.5">
                  <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-muted" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {job.responsibilities.length > 0 ? (
          <>
            <h4 className="mt-2.5 text-[12px] font-semibold">Обязанности</h4>
            <ul className="mt-1 flex flex-col gap-1 text-[12px] leading-snug">
              {job.responsibilities.slice(0, 12).map((line, index) => (
                <li key={index} className="flex gap-1.5">
                  <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-muted" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  );
}
