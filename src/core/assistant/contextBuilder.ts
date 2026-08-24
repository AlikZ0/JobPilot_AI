import type { Job } from '@/types/job';
import { listJobs } from '@/database/repositories/jobRepository';
import { getLatestAnalysis } from '@/database/repositories/analysisRepository';
import { listApplications } from '@/database/repositories/applicationRepository';
import { truncate } from '@/utils/text';

export type ContextKind = 'specific_job' | 'job_list' | 'skill_gaps' | 'applications' | 'stats';

/** Chooses the smallest slice of local data that can answer the question. */
export function classifyQuestion(question: string, hasJobId: boolean): ContextKind {
  const q = question.toLowerCase();
  if (hasJobId && /(this|эт[аойу])\s|why|почему|score|балл/.test(q)) return 'specific_job';
  if (/applicat|заявк|cover letter|submitted/.test(q)) return 'applications';
  if (/missing|не хватает|learn|изуч|gap|skill/.test(q)) return 'skill_gaps';
  if (/how many|statistic|average|стат|средн|today|сегодня/.test(q)) return 'stats';
  return 'job_list';
}

function describeJob(job: Job): string {
  return [
    `id=${job.id}`,
    `title=${job.title}`,
    `company=${job.company}`,
    `score=${job.score ?? 'n/a'}`,
    `state=${job.state}`,
    `location=${job.location || job.country}`,
    `mode=${job.workMode}`,
    job.salary.min !== null
      ? `salary=${job.salary.currency} ${job.salary.min}${job.salary.max ? `-${job.salary.max}` : ''}/${job.salary.period}`
      : 'salary=undisclosed',
    `tech=${job.technologies.slice(0, 14).join('|')}`,
  ].join(' ');
}

export async function buildAssistantContext(
  question: string,
  jobId?: string,
): Promise<{ kind: ContextKind; context: string }> {
  const kind = classifyQuestion(question, Boolean(jobId));

  if (kind === 'specific_job' && jobId) {
    const jobs = await listJobs({ limit: 1000 });
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job) return { kind, context: 'The referenced job is no longer stored locally.' };
    const analysis = await getLatestAnalysis(job.id);
    return {
      kind,
      context: [
        `JOB: ${describeJob(job)}`,
        `REQUIREMENTS: ${job.requirements.slice(0, 20).join(' | ')}`,
        `DESCRIPTION: ${truncate(job.description, 3000)}`,
        analysis
          ? `ANALYSIS: score=${analysis.score} band=${analysis.band}\nBREAKDOWN=${JSON.stringify(analysis.breakdown)}\nMATCHED=${analysis.matchedSkills.join(', ')}\nMISSING=${analysis.missingSkills.join(', ')}\nRED_FLAGS=${JSON.stringify(analysis.redFlags)}`
          : 'ANALYSIS: not analyzed yet',
      ].join('\n\n'),
    };
  }

  if (kind === 'applications') {
    const [applications, jobs] = await Promise.all([listApplications(), listJobs({ limit: 500 })]);
    const byId = new Map(jobs.map((job) => [job.id, job]));
    const lines = applications.slice(0, 40).map((application) => {
      const job = byId.get(application.jobId);
      return `application=${application.id} state=${application.state} job=${job?.title ?? 'unknown'} company=${job?.company ?? ''} score=${job?.score ?? 'n/a'} coverLetter=${application.coverLetter ? 'yes' : 'no'}`;
    });
    return { kind, context: lines.join('\n') || 'No applications yet.' };
  }

  if (kind === 'skill_gaps') {
    const jobs = await listJobs({ limit: 300 });
    const counts = new Map<string, number>();
    for (const job of jobs) {
      const analysis = await getLatestAnalysis(job.id);
      for (const skill of analysis?.missingSkills ?? []) {
        counts.set(skill, (counts.get(skill) ?? 0) + 1);
      }
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
    return {
      kind,
      context: `MISSING SKILL FREQUENCY (skill=count across ${jobs.length} analyzed jobs):\n${ranked
        .map(([skill, count]) => `${skill}=${count}`)
        .join('\n')}`,
    };
  }

  if (kind === 'stats') {
    const jobs = await listJobs({ limit: 1000 });
    const scored = jobs.filter((job) => job.score !== null);
    const average = scored.length
      ? Math.round(scored.reduce((sum, job) => sum + (job.score ?? 0), 0) / scored.length)
      : 0;
    return {
      kind,
      context: [
        `TOTAL_JOBS=${jobs.length}`,
        `ANALYZED=${scored.length}`,
        `AVERAGE_SCORE=${average}`,
        `EXCELLENT=${scored.filter((job) => (job.score ?? 0) >= 90).length}`,
        `GOOD=${scored.filter((job) => (job.score ?? 0) >= 75 && (job.score ?? 0) < 90).length}`,
        `SAVED=${jobs.filter((job) => job.state === 'saved').length}`,
        `TOP_JOBS:\n${scored
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .slice(0, 10)
          .map(describeJob)
          .join('\n')}`,
      ].join('\n'),
    };
  }

  const jobs = await listJobs({ limit: 60, sortBy: 'score' });
  return {
    kind,
    context: `STORED JOBS (most relevant first):\n${jobs.map(describeJob).join('\n')}`,
  };
}
