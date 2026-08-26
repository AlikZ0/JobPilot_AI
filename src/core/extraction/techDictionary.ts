import type { SkillCategory } from '@/types/profile';
import { normalizeToken } from '@/utils/text';

export interface TechEntry {
  /** Каноническое отображаемое имя, например «Node.js». */
  canonical: string;
  category: SkillCategory;
  /** Синонимы в нижнем регистре — так, как они встречаются в вакансиях. */
  aliases: string[];
  /** Навыки, которые подразумеваются этим: например, Nuxt подразумевает Vue. */
  implies?: string[];
}

/**
 * Составленный вручную словарь для детерминированного сопоставления навыков.
 * Он не обязан быть исчерпывающим: неизвестные технологии всё равно совпадают
 * по нормализованной строке, а пользователь может добавить в профиль любую.
 */
export const TECH_DICTIONARY: TechEntry[] = [
  // Фронтенд
  {
    canonical: 'JavaScript',
    category: 'frontend',
    aliases: ['js', 'java script', 'ecmascript', 'es6', 'es2015', 'vanilla js'],
  },
  { canonical: 'TypeScript', category: 'frontend', aliases: ['ts'], implies: ['JavaScript'] },
  {
    canonical: 'React',
    category: 'frontend',
    aliases: ['react.js', 'reactjs', 'react js'],
    implies: ['JavaScript'],
  },
  {
    canonical: 'Next.js',
    category: 'frontend',
    aliases: ['next', 'nextjs', 'next js'],
    implies: ['React'],
  },
  {
    canonical: 'Vue',
    category: 'frontend',
    aliases: ['vue.js', 'vuejs', 'vue js', 'vue 3', 'vue2', 'vue3'],
    implies: ['JavaScript'],
  },
  {
    canonical: 'Nuxt',
    category: 'frontend',
    aliases: ['nuxt.js', 'nuxtjs', 'nuxt 3'],
    implies: ['Vue'],
  },
  {
    canonical: 'Angular',
    category: 'frontend',
    aliases: ['angularjs', 'angular 2+'],
    implies: ['TypeScript'],
  },
  { canonical: 'Svelte', category: 'frontend', aliases: ['sveltekit'], implies: ['JavaScript'] },
  { canonical: 'Vite', category: 'frontend', aliases: ['vitejs'] },
  { canonical: 'Webpack', category: 'frontend', aliases: [] },
  { canonical: 'HTML', category: 'frontend', aliases: ['html5', 'html 5'] },
  { canonical: 'CSS', category: 'frontend', aliases: ['css3', 'css 3'] },
  { canonical: 'SCSS', category: 'frontend', aliases: ['sass', 'scss/sass'], implies: ['CSS'] },
  { canonical: 'Less', category: 'frontend', aliases: [], implies: ['CSS'] },
  { canonical: 'BEM', category: 'frontend', aliases: ['bem methodology'], implies: ['CSS'] },
  {
    canonical: 'Tailwind CSS',
    category: 'frontend',
    aliases: ['tailwind', 'tailwindcss'],
    implies: ['CSS'],
  },
  { canonical: 'Vuetify', category: 'frontend', aliases: [], implies: ['Vue'] },
  { canonical: 'Bootstrap', category: 'frontend', aliases: [], implies: ['CSS'] },
  {
    canonical: 'Material UI',
    category: 'frontend',
    aliases: ['mui', 'material-ui'],
    implies: ['React'],
  },
  { canonical: 'Pinia', category: 'frontend', aliases: [], implies: ['Vue'] },
  { canonical: 'Vuex', category: 'frontend', aliases: [], implies: ['Vue'] },
  {
    canonical: 'Redux',
    category: 'frontend',
    aliases: ['redux toolkit', 'rtk'],
    implies: ['React'],
  },
  {
    canonical: 'React Native',
    category: 'frontend',
    aliases: ['react-native'],
    implies: ['React'],
  },

  // Бэкенд
  {
    canonical: 'Node.js',
    category: 'backend',
    aliases: ['node', 'nodejs', 'node js'],
    implies: ['JavaScript'],
  },
  {
    canonical: 'Express',
    category: 'backend',
    aliases: ['express.js', 'expressjs'],
    implies: ['Node.js'],
  },
  {
    canonical: 'NestJS',
    category: 'backend',
    aliases: ['nest', 'nest.js', 'nest js'],
    implies: ['Node.js', 'TypeScript'],
  },
  { canonical: 'Fastify', category: 'backend', aliases: [], implies: ['Node.js'] },
  { canonical: 'PHP', category: 'backend', aliases: ['php8', 'php 8', 'php7'] },
  { canonical: 'Laravel', category: 'backend', aliases: [], implies: ['PHP'] },
  { canonical: 'Symfony', category: 'backend', aliases: [], implies: ['PHP'] },
  { canonical: 'Python', category: 'backend', aliases: ['python3', 'python 3'] },
  { canonical: 'Django', category: 'backend', aliases: [], implies: ['Python'] },
  { canonical: 'FastAPI', category: 'backend', aliases: [], implies: ['Python'] },
  { canonical: 'Flask', category: 'backend', aliases: [], implies: ['Python'] },
  { canonical: 'Go', category: 'backend', aliases: ['golang'] },
  { canonical: 'Java', category: 'backend', aliases: ['java 17', 'java8'] },
  {
    canonical: 'Spring',
    category: 'backend',
    aliases: ['spring boot', 'springboot'],
    implies: ['Java'],
  },
  { canonical: 'C#', category: 'backend', aliases: ['csharp', 'c sharp'] },
  {
    canonical: '.NET',
    category: 'backend',
    aliases: ['dotnet', 'asp.net', '.net core'],
    implies: ['C#'],
  },
  { canonical: 'Ruby', category: 'backend', aliases: [] },
  { canonical: 'Ruby on Rails', category: 'backend', aliases: ['rails'], implies: ['Ruby'] },
  { canonical: 'Rust', category: 'backend', aliases: [] },
  { canonical: 'Elixir', category: 'backend', aliases: [] },

  // DevOps
  {
    canonical: 'Docker',
    category: 'devops',
    aliases: ['docker compose', 'docker-compose', 'containers'],
  },
  { canonical: 'Kubernetes', category: 'devops', aliases: ['k8s', 'kube'], implies: ['Docker'] },
  { canonical: 'Linux', category: 'devops', aliases: ['unix', 'ubuntu', 'debian', 'centos'] },
  {
    canonical: 'CI/CD',
    category: 'devops',
    aliases: [
      'ci cd',
      'cicd',
      'continuous integration',
      'continuous delivery',
      'continuous deployment',
    ],
  },
  { canonical: 'GitHub Actions', category: 'devops', aliases: ['gh actions'], implies: ['CI/CD'] },
  { canonical: 'GitLab CI', category: 'devops', aliases: ['gitlab ci/cd'], implies: ['CI/CD'] },
  { canonical: 'Jenkins', category: 'devops', aliases: [], implies: ['CI/CD'] },
  { canonical: 'Nginx', category: 'devops', aliases: [] },
  { canonical: 'Apache', category: 'devops', aliases: ['apache2', 'httpd'] },
  { canonical: 'AWS', category: 'devops', aliases: ['amazon web services', 'ec2', 's3', 'lambda'] },
  { canonical: 'Google Cloud', category: 'devops', aliases: ['gcp', 'google cloud platform'] },
  { canonical: 'Azure', category: 'devops', aliases: ['microsoft azure'] },
  { canonical: 'Terraform', category: 'devops', aliases: ['iac'] },
  { canonical: 'Ansible', category: 'devops', aliases: [] },
  { canonical: 'Prometheus', category: 'devops', aliases: [] },
  { canonical: 'Grafana', category: 'devops', aliases: [] },

  // Базы данных
  { canonical: 'PostgreSQL', category: 'database', aliases: ['postgres', 'psql', 'postgre sql'] },
  { canonical: 'MySQL', category: 'database', aliases: ['mariadb'] },
  { canonical: 'SQLite', category: 'database', aliases: [] },
  { canonical: 'MongoDB', category: 'database', aliases: ['mongo'] },
  { canonical: 'Redis', category: 'database', aliases: [] },
  { canonical: 'Elasticsearch', category: 'database', aliases: ['elastic search', 'opensearch'] },
  { canonical: 'ClickHouse', category: 'database', aliases: [] },
  { canonical: 'SQL', category: 'database', aliases: ['relational databases', 'rdbms'] },
  { canonical: 'Prisma', category: 'database', aliases: [] },
  { canonical: 'TypeORM', category: 'database', aliases: [] },
  { canonical: 'Sequelize', category: 'database', aliases: [] },

  // Прочее
  {
    canonical: 'Git',
    category: 'other',
    aliases: ['github', 'gitlab', 'bitbucket', 'version control'],
  },
  {
    canonical: 'REST API',
    category: 'other',
    aliases: ['rest', 'restful', 'rest apis', 'restful api'],
  },
  { canonical: 'GraphQL', category: 'other', aliases: ['apollo'] },
  { canonical: 'WebSockets', category: 'other', aliases: ['websocket', 'socket.io', 'ws'] },
  { canonical: 'gRPC', category: 'other', aliases: [] },
  { canonical: 'RabbitMQ', category: 'other', aliases: ['amqp'] },
  { canonical: 'Kafka', category: 'other', aliases: ['apache kafka'] },
  {
    canonical: 'Microservices',
    category: 'other',
    aliases: ['micro services', 'microservice architecture'],
  },
  { canonical: 'Agile', category: 'other', aliases: ['scrum', 'kanban'] },
  { canonical: 'Jest', category: 'other', aliases: [] },
  { canonical: 'Vitest', category: 'other', aliases: [] },
  { canonical: 'Playwright', category: 'other', aliases: [] },
  { canonical: 'Cypress', category: 'other', aliases: [] },
  {
    canonical: 'TDD',
    category: 'other',
    aliases: ['test driven development', 'unit testing', 'unit tests'],
  },
  {
    canonical: 'OOP',
    category: 'other',
    aliases: ['object oriented programming', 'object-oriented'],
  },
  { canonical: 'WebRTC', category: 'other', aliases: [] },
  { canonical: 'Figma', category: 'other', aliases: [] },
];

const aliasIndex = new Map<string, TechEntry>();
for (const entry of TECH_DICTIONARY) {
  aliasIndex.set(normalizeToken(entry.canonical), entry);
  for (const alias of entry.aliases) aliasIndex.set(normalizeToken(alias), entry);
}

/** Приводит любое написание технологии к канонической записи словаря. */
export function lookupTech(name: string): TechEntry | null {
  return aliasIndex.get(normalizeToken(name)) ?? null;
}

export function canonicalizeTech(name: string): string {
  return lookupTech(name)?.canonical ?? name.trim();
}

export function categoryOf(name: string): SkillCategory {
  return lookupTech(name)?.category ?? 'other';
}

/** Раскрывает навык в сам навык плюс всё, что он подразумевает (Nuxt → Vue → JS). */
export function expandImplied(name: string, seen = new Set<string>()): string[] {
  const entry = lookupTech(name);
  const canonical = entry?.canonical ?? name.trim();
  if (seen.has(canonical)) return [];
  seen.add(canonical);
  const out = [canonical];
  for (const implied of entry?.implies ?? []) out.push(...expandImplied(implied, seen));
  return out;
}

/**
 * Разбирает строку вида «Vue 3», «React 18», «PHP 8.1» на название и мажорную
 * версию. Если версии нет, возвращает пустую строку — такой навык совпадает с
 * любой версией.
 */
export function splitNameAndVersion(input: string): { name: string; version: string } {
  const value = input.trim();
  // Версия — последнее «слово» из цифр, возможно с точкой: 3, 18, 8.1, v3.
  const match = value.match(/^(.*?)([\s./-]*)v?(\d{1,2}(?:\.\d{1,2})?)\s*(?:\+|\.x)?$/i);
  if (!match) return { name: value, version: '' };

  const name = (match[1] ?? '').trim();
  const separator = match[2] ?? '';
  const version = match[3] ?? '';
  if (!name) return { name: value, version: '' };

  // Если само название известно словарю — цифры рядом это версия («Vue 3»).
  if (lookupTech(name)) return { name, version };
  // «ES6», «S3», «Web3» словарь знает целиком: цифра — часть имени.
  if (lookupTech(value)) return { name: value, version: '' };
  // Незнакомая технология: версией считаем только явно отделённые цифры.
  return separator ? { name, version } : { name: value, version: '' };
}

/** Только мажорная часть версии: «3.2» -> «3». */
export function majorVersion(version: string): string {
  const match = version.trim().match(/^(\d{1,2})/);
  return match?.[1] ?? '';
}

export interface DetectedTech {
  name: string;
  /** Версия, указанная рядом с названием в тексте; пустая, если не указана. */
  version: string;
}

const VERSION_AFTER = /^[\s.]{0,3}v?(\d{1,2})(?:\.\d{1,2})?(?:\s*\+|\.x)?/i;

/**
 * Как detectTechnologies, но дополнительно вытаскивает версию, стоящую рядом с
 * названием: «Vue 3», «React 18», «Angular 15+».
 */
export function detectTechnologiesDetailed(text: string): DetectedTech[] {
  if (!text) return [];
  const haystack = text.replace(/[\n\r\t]+/g, ' ');
  const out = new Map<string, DetectedTech>();

  for (const entry of TECH_DICTIONARY) {
    for (const candidate of [entry.canonical, ...entry.aliases]) {
      const needle = candidate.toLowerCase();
      if (needle.length < 2) continue;
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const boundary = /^[a-z0-9]/.test(needle) ? '(?<![a-z0-9+#.])' : '';
      const tail = /[a-z0-9]$/.test(needle) ? '(?![a-z0-9+#])' : '';
      const re = new RegExp(`${boundary}${escaped}${tail}`, 'gi');
      let match: RegExpExecArray | null;
      while ((match = re.exec(haystack)) !== null) {
        const after = haystack.slice(match.index + match[0].length);
        const version = majorVersion(after.match(VERSION_AFTER)?.[1] ?? '');
        const existing = out.get(entry.canonical);
        // Версия, найденная явно, важнее записи без версии.
        if (!existing || (!existing.version && version)) {
          out.set(entry.canonical, { name: entry.canonical, version });
        }
      }
    }
  }
  return [...out.values()];
}

/**
 * Находит технологии в свободном тексте. Совпадение учитывает границы слов,
 * поэтому «Go» не срабатывает на «Google», а «R» не срабатывает вовсе.
 */
export function detectTechnologies(text: string): string[] {
  if (!text) return [];
  const haystack = ` ${text.toLowerCase().replace(/[\n\r\t]+/g, ' ')} `;
  const found = new Set<string>();
  for (const entry of TECH_DICTIONARY) {
    const candidates = [entry.canonical, ...entry.aliases];
    for (const candidate of candidates) {
      const needle = candidate.toLowerCase();
      if (needle.length < 2) continue;
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const boundary = /^[a-z0-9]/.test(needle) ? '(?<![a-z0-9+#.])' : '';
      const tail = /[a-z0-9]$/.test(needle) ? '(?![a-z0-9+#])' : '';
      const re = new RegExp(`${boundary}${escaped}${tail}`, 'i');
      if (re.test(haystack)) {
        found.add(entry.canonical);
        break;
      }
    }
  }
  return [...found];
}
