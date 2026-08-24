import { splitLines } from '@/utils/text';

export interface JobSections {
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
  about: string[];
}

type SectionKey = keyof JobSections;

const HEADINGS: [SectionKey, RegExp][] = [
  [
    'requirements',
    /^(requirements|qualifications|what (we|you).{0,20}(need|expect|looking for)|must[- ]have|your profile|skills( and experience)?|who you are|we expect|expectations|required|essential|our requirements|необходимые навыки|требования|наши ожидания|ваш опыт)\b/i,
  ],
  [
    'responsibilities',
    /^(responsibilities|what you.{0,10}(will|'ll) (do|be doing)|your (role|tasks|mission)|the role|duties|day[- ]to[- ]day|about the (job|role)|job description|обязанности|задачи|чем предстоит заниматься)\b/i,
  ],
  [
    'benefits',
    /^(benefits|what we offer|we offer|perks|why join|compensation( and benefits)?|our offer|what.s in it for you|мы предлагаем|условия)\b/i,
  ],
  ['about', /^(about (us|the company)|company|who we are|о (компании|нас))\b/i],
];

const BULLET_RE = /^[•▪◦·*\-–—]\s*/;

function classifyHeading(line: string): SectionKey | null {
  const cleaned = line
    .replace(BULLET_RE, '')
    .replace(/[:：]\s*$/, '')
    .trim();
  if (cleaned.length > 80) return null;
  for (const [key, pattern] of HEADINGS) {
    if (pattern.test(cleaned)) return key;
  }
  return null;
}

/**
 * Слой, который превращает сплошное описание в блоки «требования»,
 * «обязанности» и «условия», ориентируясь на заголовки. Если заголовков нет
 * вовсе, используется запасной вариант по маркированным спискам.
 */
export function splitSections(description: string): JobSections {
  const sections: JobSections = { requirements: [], responsibilities: [], benefits: [], about: [] };
  const rawLines = description.split(/\r?\n/);
  let current: SectionKey | null = null;
  let sawHeading = false;

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = classifyHeading(line);
    if (heading) {
      current = heading;
      sawHeading = true;
      continue;
    }
    if (!current) continue;
    const content = line.replace(BULLET_RE, '').trim();
    if (content.length < 3) continue;
    if (sections[current].length < 40) sections[current].push(content);
  }

  if (!sawHeading) {
    // Заголовков нет: считаем пункты списка требованиями — именно их обычно
    // перечисляют короткие объявления. Количество ограничиваем.
    const bullets = rawLines
      .map((line) => line.trim())
      .filter((line) => BULLET_RE.test(line))
      .map((line) => line.replace(BULLET_RE, '').trim())
      .filter((line) => line.length > 2);
    sections.requirements = bullets.slice(0, 30);
  }

  if (sections.requirements.length === 0 && sections.responsibilities.length === 0) {
    sections.requirements = splitLines(description)
      .filter((line) => /\b(experience|knowledge|proficien|familiar|years|skills?)\b/i.test(line))
      .slice(0, 20);
  }

  return sections;
}
