import type { TailoredResume } from '@/types/resume';
import type { UserProfile } from '@/types/profile';

/**
 * Отрисовка подогнанного резюме в форматы, которые ATS читают без потерь.
 *
 * Мы не редактируем исходный PDF: у PDF нет надёжного способа переставить текст
 * внутри чужой вёрстки, а ATS всё равно лучше разбирает чистый документ. Поэтому
 * собирается новый: одна колонка, стандартные заголовки, без таблиц и иконок.
 */

export interface RenderContext {
  resume: TailoredResume;
  profile: UserProfile;
  /** Название вакансии — попадает в заголовок документа. */
  jobTitle: string;
}

function contactLine(profile: UserProfile): string[] {
  const { personal, location, links } = profile;
  return [
    [personal.firstName, personal.lastName].filter(Boolean).join(' '),
    [personal.email, personal.phone].filter(Boolean).join(' · '),
    [location.city, location.country].filter(Boolean).join(', '),
    [links.linkedin, links.github, links.portfolio].filter(Boolean).join(' · '),
  ].filter(Boolean);
}

/** Простой текст — самый безопасный для ATS формат. */
export function renderPlainText(context: RenderContext): string {
  const { resume, profile } = context;
  const out: string[] = [];

  out.push(...contactLine(profile));
  out.push('');
  if (resume.headline) out.push(resume.headline.toUpperCase(), '');

  if (resume.summary) {
    out.push('О СЕБЕ', resume.summary, '');
  }
  if (resume.skills.length) {
    out.push('НАВЫКИ', resume.skills.join(', '), '');
  }
  if (resume.experience.length) {
    out.push('ОПЫТ РАБОТЫ');
    for (const entry of resume.experience) {
      out.push(`${entry.position} — ${entry.company}${entry.period ? ` (${entry.period})` : ''}`);
      for (const bullet of entry.bullets) out.push(`- ${bullet}`);
      out.push('');
    }
  }
  if (resume.education.length) {
    out.push('ОБРАЗОВАНИЕ');
    for (const entry of resume.education) {
      out.push(`${entry.institution}${entry.degree ? ` — ${entry.degree}` : ''}`);
    }
    out.push('');
  }
  if (resume.languages.length) {
    out.push('ЯЗЫКИ', resume.languages.join(', '), '');
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function renderMarkdown(context: RenderContext): string {
  const { resume, profile } = context;
  const out: string[] = [];
  const [name, ...contacts] = contactLine(profile);

  out.push(`# ${name || resume.headline || 'Резюме'}`);
  if (resume.headline && name) out.push(`**${resume.headline}**`);
  if (contacts.length) out.push('', contacts.join('  \n'));
  if (resume.summary) out.push('', '## О себе', '', resume.summary);
  if (resume.skills.length) out.push('', '## Навыки', '', resume.skills.join(', '));
  if (resume.experience.length) {
    out.push('', '## Опыт работы');
    for (const entry of resume.experience) {
      out.push('', `### ${entry.position} — ${entry.company}`);
      if (entry.period) out.push(`_${entry.period}_`);
      out.push('', ...entry.bullets.map((bullet) => `- ${bullet}`));
    }
  }
  if (resume.education.length) {
    out.push('', '## Образование', '');
    out.push(
      ...resume.education.map(
        (entry) => `- ${entry.institution}${entry.degree ? ` — ${entry.degree}` : ''}`,
      ),
    );
  }
  if (resume.languages.length) out.push('', '## Языки', '', resume.languages.join(', '));
  return out.join('\n').trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * HTML для печати в PDF средствами Chrome: одна колонка, системные шрифты,
 * никаких таблиц и картинок. Кириллица работает без встроенных шрифтов, а сам
 * PDF получается текстовым — именно такой и нужен ATS.
 */
export function renderPrintableHtml(context: RenderContext): string {
  const { resume, profile, jobTitle } = context;
  const [name, ...contacts] = contactLine(profile);
  const section = (title: string, body: string) =>
    body ? `<section><h2>${escapeHtml(title)}</h2>${body}</section>` : '';

  const experience = resume.experience
    .map(
      (entry) => `
      <article>
        <h3>${escapeHtml(entry.position)} — ${escapeHtml(entry.company)}</h3>
        ${entry.period ? `<p class="period">${escapeHtml(entry.period)}</p>` : ''}
        <ul>${entry.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>
      </article>`,
    )
    .join('');

  const education = resume.education
    .map(
      (entry) =>
        `<p>${escapeHtml(entry.institution)}${entry.degree ? ` — ${escapeHtml(entry.degree)}` : ''}</p>`,
    )
    .join('');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(name || 'Резюме')}${jobTitle ? ` — ${escapeHtml(jobTitle)}` : ''}</title>
<style>
  /* Только системные шрифты и одна колонка: так ATS разбирает текст без потерь. */
  * { box-sizing: border-box; }
  body {
    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.45;
    color: #000;
    background: #fff;
    max-width: 190mm;
    margin: 0 auto;
    padding: 12mm 10mm;
  }
  h1 { font-size: 18pt; margin: 0 0 2mm; }
  h2 { font-size: 12pt; margin: 6mm 0 2mm; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #000; padding-bottom: 1mm; }
  h3 { font-size: 11pt; margin: 3mm 0 0; }
  p { margin: 0 0 1.5mm; }
  ul { margin: 1mm 0 0; padding-left: 6mm; }
  li { margin-bottom: 1mm; }
  .headline { font-weight: bold; margin-bottom: 2mm; }
  .contacts { margin-bottom: 3mm; }
  .period { color: #333; font-size: 10pt; }
  @page { size: A4; margin: 12mm; }
  @media print { body { padding: 0; max-width: none; } }
</style>
</head>
<body>
  <h1>${escapeHtml(name || 'Резюме')}</h1>
  ${resume.headline ? `<p class="headline">${escapeHtml(resume.headline)}</p>` : ''}
  <p class="contacts">${contacts.map(escapeHtml).join('<br />')}</p>
  ${section('О себе', resume.summary ? `<p>${escapeHtml(resume.summary)}</p>` : '')}
  ${section('Навыки', resume.skills.length ? `<p>${escapeHtml(resume.skills.join(', '))}</p>` : '')}
  ${section('Опыт работы', experience)}
  ${section('Образование', education)}
  ${section('Языки', resume.languages.length ? `<p>${escapeHtml(resume.languages.join(', '))}</p>` : '')}
</body>
</html>`;
}

export function suggestedFileName(profile: UserProfile, jobTitle: string): string {
  const transliterate = (value: string) =>
    value
      .toLowerCase()
      .replace(/[а-яё]/g, (char) => {
        const map: Record<string, string> = {
          а: 'a',
          б: 'b',
          в: 'v',
          г: 'g',
          д: 'd',
          е: 'e',
          ё: 'e',
          ж: 'zh',
          з: 'z',
          и: 'i',
          й: 'y',
          к: 'k',
          л: 'l',
          м: 'm',
          н: 'n',
          о: 'o',
          п: 'p',
          р: 'r',
          с: 's',
          т: 't',
          у: 'u',
          ф: 'f',
          х: 'h',
          ц: 'ts',
          ч: 'ch',
          ш: 'sh',
          щ: 'sch',
          ъ: '',
          ы: 'y',
          ь: '',
          э: 'e',
          ю: 'yu',
          я: 'ya',
        };
        return map[char] ?? '';
      })
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  const parts = [
    transliterate(profile.personal.lastName || profile.personal.firstName || 'resume'),
    transliterate(jobTitle).slice(0, 30),
  ].filter(Boolean);
  return `${parts.join('_') || 'resume'}.pdf`;
}
