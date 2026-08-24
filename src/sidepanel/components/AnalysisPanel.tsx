import type { JobAnalysis } from '@/types/ai';
import type { Job } from '@/types/job';
import { MatchScore, ScoreBreakdownList } from './MatchScore';
import { SkillBadge } from './SkillBadge';

const SEVERITY_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

interface Props {
  job: Job;
  analysis: JobAnalysis;
}

/** Full scoring explanation, as required by "not just 92%". */
export function AnalysisPanel({ job, analysis }: Props) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <MatchScore score={analysis.score} band={analysis.band} size="lg" />
        <div className="text-right text-[11px] text-muted">
          <p>
            {analysis.usedAI ? `AI: ${analysis.model ?? 'unknown model'}` : 'Deterministic only'}
          </p>
          <p>Profile v{analysis.profileVersion}</p>
        </div>
      </div>

      <div className="jp-card">
        <h3 className="jp-section-title mb-2">Score breakdown</h3>
        <ScoreBreakdownList breakdown={analysis.breakdown} />
      </div>

      <div className="jp-card">
        <h3 className="jp-section-title mb-2">Skills</h3>
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
        <h3 className="jp-section-title mb-2">Checks</h3>
        <ul className="grid grid-cols-2 gap-1 text-[12px]">
          {(
            [
              ['Seniority', analysis.seniorityMatch],
              ['Experience', analysis.experienceMatch],
              ['Salary', analysis.salaryMatch],
              ['Location', analysis.locationMatch],
              ['Language', analysis.languageMatch],
            ] as const
          ).map(([label, value]) => (
            <li key={label} className="flex items-center gap-1.5">
              <span aria-hidden="true">{value ? '✓' : '✕'}</span>
              <span className={value ? 'text-excellent' : 'text-poor'}>
                {label}: {value ? 'match' : 'mismatch'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {analysis.redFlags.length > 0 ? (
        <div className="jp-card border-weak/40">
          <h3 className="jp-section-title mb-2">Red flags</h3>
          <ul className="flex flex-col gap-1.5">
            {analysis.redFlags.map((flag, index) => (
              <li key={`${flag.code}-${index}`} className="text-[12px]">
                <span className="jp-badge mr-1">{SEVERITY_LABEL[flag.severity]}</span>
                <span className="font-medium">{flag.code.replace(/_/g, ' ')}</span>
                <p className="text-[11px] text-muted">{flag.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.reasoning ? (
        <div className="jp-card">
          <h3 className="jp-section-title mb-2">Reasoning</h3>
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed">{analysis.reasoning}</p>
        </div>
      ) : null}

      <div className="jp-card">
        <h3 className="jp-section-title mb-2">Posting</h3>
        <p className="text-[11px] text-muted">
          Source: {job.source} · extraction quality {Math.round(job.extractionQuality * 100)}%
        </p>
        {job.requirements.length > 0 ? (
          <>
            <h4 className="mt-2 text-[12px] font-semibold">Requirements</h4>
            <ul className="ml-4 list-disc text-[12px]">
              {job.requirements.slice(0, 12).map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </>
        ) : null}
        {job.responsibilities.length > 0 ? (
          <>
            <h4 className="mt-2 text-[12px] font-semibold">Responsibilities</h4>
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
