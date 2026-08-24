import type { JobAnalysis } from '@/types/ai';
import type { Job } from '@/types/job';
import { MatchScore, ScoreBreakdownList } from './MatchScore';
import { SkillBadge } from './SkillBadge';
import { SEVERITY_LABEL, redFlagLabel } from '../labels';

interface Props {
  job: Job;
  analysis: JobAnalysis;
}

/** Полное объяснение балла: не просто «92%», а из чего он сложился. */
export function AnalysisPanel({ job, analysis }: Props) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <MatchScore score={analysis.score} band={analysis.band} size="lg" />
        <div className="text-right text-[11px] text-muted">
          <p>
            {analysis.usedAI ? `AI: ${analysis.model ?? 'модель неизвестна'}` : 'Без AI'}
          </p>
          <p>Профиль v{analysis.profileVersion}</p>
        </div>
      </div>

      <div className="jp-card">
        <h3 className="jp-section-title mb-2">Из чего сложился балл</h3>
        <ScoreBreakdownList breakdown={analysis.breakdown} />
      </div>

      <div className="jp-card">
        <h3 className="jp-section-title mb-2">Навыки</h3>
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
      </div>

      <div className="jp-card">
        <h3 className="jp-section-title mb-2">Проверки</h3>
        <ul className="grid grid-cols-2 gap-1 text-[12px]">
          {(
            [
              ['Уровень', analysis.seniorityMatch],
              ['Опыт', analysis.experienceMatch],
              ['Зарплата', analysis.salaryMatch],
              ['Локация', analysis.locationMatch],
              ['Языки', analysis.languageMatch],
            ] as const
          ).map(([label, value]) => (
            <li key={label} className="flex items-center gap-1.5">
              <span aria-hidden="true">{value ? '✓' : '✕'}</span>
              <span className={value ? 'text-excellent' : 'text-poor'}>
                {label}: {value ? 'совпадает' : 'не совпадает'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {analysis.redFlags.length > 0 ? (
        <div className="jp-card border-weak/40">
          <h3 className="jp-section-title mb-2">Красные флаги</h3>
          <ul className="flex flex-col gap-1.5">
            {analysis.redFlags.map((flag, index) => (
              <li key={`${flag.code}-${index}`} className="text-[12px]">
                <span className="jp-badge mr-1">{SEVERITY_LABEL[flag.severity]}</span>
                <span className="font-medium">{redFlagLabel(flag.code)}</span>
                <p className="text-[11px] text-muted">{flag.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.reasoning ? (
        <div className="jp-card">
          <h3 className="jp-section-title mb-2">Обоснование</h3>
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed">{analysis.reasoning}</p>
        </div>
      ) : null}

      <div className="jp-card">
        <h3 className="jp-section-title mb-2">Текст вакансии</h3>
        <p className="text-[11px] text-muted">
          Источник: {job.source} · качество извлечения {Math.round(job.extractionQuality * 100)}%
        </p>
        {job.requirements.length > 0 ? (
          <>
            <h4 className="mt-2 text-[12px] font-semibold">Требования</h4>
            <ul className="ml-4 list-disc text-[12px]">
              {job.requirements.slice(0, 12).map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </>
        ) : null}
        {job.responsibilities.length > 0 ? (
          <>
            <h4 className="mt-2 text-[12px] font-semibold">Обязанности</h4>
            <ul className="ml-4 list-disc text-[12px]">
              {job.responsibilities.slice(0, 12).map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  );
}
