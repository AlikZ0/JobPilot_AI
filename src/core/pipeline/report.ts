import type { Application } from '@/types/application';
import type { Job } from '@/types/job';
import { canonicalizeTech } from '@/core/extraction/techDictionary';
import { DAY_MS } from '@/utils/time';
import { hostnameOf } from '@/utils/url';

/**
 * Сводка по поиску работы: что сделано за неделю, какой сайт приносит лучшие
 * совпадения, какие навыки требуют чаще всего, и выгрузка откликов в CSV или
 * Markdown — для своей таблицы или отчёта в центр занятости.
 *
 * Всё считается по локальной базе и без AI: цифры, которые человек кому-то
 * показывает, должны быть проверяемыми.
 */

export interface WeeklySummary {
  /** Проанализировано вакансий за период. */
  analyzed: number;
  submitted: number;
  replies: number;
  interviews: number;
  offers: number;
}

export function summarizeWeek(
  jobs: Job[],
  applications: Application[],
  now = Date.now(),
  days = 7,
): WeeklySummary {
  const since = now - days * DAY_MS;
  const within = (at: number | null | undefined) => at !== null && at !== undefined && at >= since;

  return {
    analyzed: jobs.filter((job) => within(job.analyzedAt)).length,
    submitted: applications.filter((application) => within(application.submittedAt)).length,
    // Ступени считаем по датам их достижения: ответ мог прийти на отклик,
    // отправленный месяц назад, и к этой неделе он всё равно относится.
    replies: applications.filter((application) => within(application.outcomeAt.replied)).length,
    interviews: applications.filter((application) => within(application.outcomeAt.interview))
      .length,
    offers: applications.filter((application) => within(application.outcomeAt.offer)).length,
  };
}

export interface SourceStat {
  /** Сайт, с которого вакансия попала в JobPilot. */
  source: string;
  jobs: number;
  /** Средний балл по проанализированным, 0–100. Null, если анализа ещё не было. */
  averageScore: number | null;
  submitted: number;
}

/**
 * Откуда приходят вакансии и какие из них лучше подходят. Источник берётся из
 * адреса, а не из поля `source`: там лежит идентификатор адаптера, и все
 * незнакомые сайты слились бы в один «generic».
 */
export function statsBySource(jobs: Job[], applications: Application[]): SourceStat[] {
  const submittedJobIds = new Set(
    applications.filter((row) => row.submittedAt !== null).map((row) => row.jobId),
  );
  const groups = new Map<string, Job[]>();
  for (const job of jobs) {
    const key = hostnameOf(job.url) || job.source || 'неизвестно';
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }

  return [...groups.entries()]
    .map(([source, list]) => {
      const scored = list.filter((job) => job.score !== null);
      return {
        source,
        jobs: list.length,
        averageScore: scored.length
          ? Math.round(scored.reduce((sum, job) => sum + (job.score ?? 0), 0) / scored.length)
          : null,
        submitted: list.filter((job) => submittedJobIds.has(job.id)).length,
      };
    })
    .sort((a, b) => b.jobs - a.jobs || a.source.localeCompare(b.source));
}

export interface DemandedSkill {
  skill: string;
  count: number;
}

/** Какие технологии требуют чаще всего — по всем разобранным вакансиям. */
export function mostDemandedSkills(jobs: Job[], limit = 10): DemandedSkill[] {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    // Внутри одной вакансии технология считается один раз, сколько бы раз она
    // ни повторилась в тексте: иначе одно многословное описание перевесит всё.
    for (const tech of new Set(job.technologies.map((name) => canonicalizeTech(name)))) {
      counts.set(tech, (counts.get(tech) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill))
    .slice(0, limit);
}

export interface ReportRow {
  submittedAt: number | null;
  title: string;
  company: string;
  source: string;
  url: string;
  score: number | null;
  outcome: string;
  repliedAt: number | null;
  interviewAt: number | null;
  offerAt: number | null;
}

const OUTCOME_TEXT: Record<string, string> = {
  awaiting: 'ждём ответа',
  replied: 'ответили',
  interview: 'интервью',
  offer: 'оффер',
  rejected: 'отказ',
};

/** Отправленные отклики, свежие сверху. Черновики в отчёт не попадают. */
export function buildReportRows(jobs: Job[], applications: Application[]): ReportRow[] {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  return applications
    .filter((application) => application.submittedAt !== null)
    .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))
    .map((application) => {
      const job = byId.get(application.jobId);
      return {
        submittedAt: application.submittedAt,
        title: job?.title ?? '',
        company: job?.company ?? '',
        source: job ? hostnameOf(job.url) : '',
        url: job?.url ?? '',
        score: job?.score ?? null,
        outcome: OUTCOME_TEXT[application.outcome] ?? application.outcome,
        repliedAt: application.outcomeAt.replied ?? null,
        interviewAt: application.outcomeAt.interview ?? null,
        offerAt: application.outcomeAt.offer ?? null,
      };
    });
}

function isoDate(at: number | null): string {
  return at === null ? '' : new Date(at).toISOString().slice(0, 10);
}

/** Экранирование по RFC 4180: кавычки удваиваются, спорное берётся в кавычки. */
function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_HEADER = [
  'Дата отправки',
  'Должность',
  'Компания',
  'Источник',
  'Ссылка',
  'Балл',
  'Статус',
  'Ответ',
  'Интервью',
  'Оффер',
];

/**
 * CSV с BOM и точкой с запятой: без BOM Excel читает кириллицу как мусор, а
 * запятая в русской локали воспринимается как десятичный разделитель, и всё
 * съезжает в одну колонку.
 */
export function reportToCsv(rows: ReportRow[]): string {
  const lines = [
    CSV_HEADER.join(';'),
    ...rows.map((row) =>
      [
        isoDate(row.submittedAt),
        row.title,
        row.company,
        row.source,
        row.url,
        row.score,
        row.outcome,
        isoDate(row.repliedAt),
        isoDate(row.interviewAt),
        isoDate(row.offerAt),
      ]
        .map(csvCell)
        .join(';'),
    ),
  ];
  // \ufeff — та самая метка порядка байтов; записана escape-последовательностью,
  // потому что невидимый символ в коде читать невозможно.
  return `\ufeff${lines.join('\r\n')}\r\n`;
}

export function reportToMarkdown(rows: ReportRow[], summary: WeeklySummary): string {
  const head = [
    '# Отчёт по поиску работы',
    '',
    `За неделю: отправлено ${summary.submitted}, ответов ${summary.replies}, интервью ${summary.interviews}, офферов ${summary.offers}.`,
    '',
    '| Дата | Должность | Компания | Источник | Балл | Статус |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  const body = rows.map((row) =>
    [
      isoDate(row.submittedAt),
      // Вертикальная черта разорвала бы таблицу.
      row.title.replace(/\|/g, '\\|'),
      row.company.replace(/\|/g, '\\|'),
      row.source,
      row.score === null ? '—' : `${row.score}%`,
      row.outcome,
    ].join(' | '),
  );
  return [...head, ...body.map((line) => `| ${line} |`), ''].join('\n');
}

export function reportFileName(extension: string, now = new Date()): string {
  return `jobpilot-otkliki-${now.toISOString().slice(0, 10)}.${extension}`;
}
