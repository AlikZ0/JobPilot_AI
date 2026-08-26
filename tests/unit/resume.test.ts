import { describe, expect, it } from 'vitest';
import { auditResume, mentions } from '@/core/resume/atsAudit';
import { analyzeResumeGaps, suggestedKeywords } from '@/core/resume/gapAnalysis';
import { enforceTruthfulness, tailorWithoutAI } from '@/core/resume/tailorResume';
import {
  renderMarkdown,
  renderPlainText,
  renderPrintableHtml,
  suggestedFileName,
} from '@/core/resume/render';
import { tailoredResumeSchema } from '@/types/resume';
import { makeSkill } from '@/types/profile';
import { makeProfile } from '../fixtures/profile';
import { makeJob } from '../fixtures/jobs';

const GOOD_RESUME = `Алекс Доу
alex@example.com · +1 555 0100
Краков, Польша

ОПЫТ РАБОТЫ
Fullstack Developer — Example Inc. (2020 — настоящее время)
- Разрабатывал внутренние сервисы на Node.js и PostgreSQL
- Поддерживал интерфейсы на Vue

НАВЫКИ
JavaScript, TypeScript, Node.js, PostgreSQL, Git

ОБРАЗОВАНИЕ
Ягеллонский университет — Информатика
`;

describe('ATS-аудит', () => {
  it('высоко оценивает чистое текстовое резюме', () => {
    const audit = auditResume({ text: GOOD_RESUME, charsPerPage: GOOD_RESUME.length });
    expect(audit.score).toBeGreaterThanOrEqual(80);
    expect(audit.checks.find((check) => check.id === 'contacts')?.severity).toBe('ok');
    expect(audit.checks.find((check) => check.id === 'sections')?.severity).toBe('ok');
    expect(audit.checks.find((check) => check.id === 'dates')?.severity).toBe('ok');
  });

  it('ловит скан вместо текста', () => {
    const audit = auditResume({ text: 'Алекс', charsPerPage: 12 });
    const check = audit.checks.find((item) => item.id === 'text_layer');
    expect(check?.severity).toBe('error');
    expect(check?.fix).toMatch(/не сканируйте/i);
  });

  it('ловит отсутствие контактов', () => {
    const audit = auditResume({ text: GOOD_RESUME.replace(/alex@example\.com.*\n/, '') });
    expect(audit.checks.find((check) => check.id === 'contacts')?.severity).not.toBe('ok');
  });

  it('ловит вёрстку в колонки', () => {
    const audit = auditResume({ text: `${GOOD_RESUME}\n${'Навык │ Уровень\n'.repeat(6)}` });
    expect(audit.checks.find((check) => check.id === 'layout')?.severity).toBe('warning');
  });

  it('ругается на имя файла с кириллицей', () => {
    const audit = auditResume({ text: GOOD_RESUME, fileName: 'Резюме итог(1).pdf' });
    expect(audit.checks.find((check) => check.id === 'file_name')?.severity).toBe('warning');
  });

  it('каждая непройденная проверка объясняет, что делать', () => {
    const audit = auditResume({ text: 'Слишком коротко', charsPerPage: 15 });
    for (const check of audit.checks) {
      if (check.severity === 'ok') continue;
      expect(check.fix.length, check.id).toBeGreaterThan(10);
    }
  });

  it('находит упоминание навыка по границам слов', () => {
    expect(mentions('Работал с Node.js и Vue', 'Vue')).toBe(true);
    expect(mentions('Использую Google Workspace', 'Go')).toBe(false);
  });
});

describe('анализ пробелов между резюме, профилем и вакансией', () => {
  const job = makeJob({
    title: 'Senior Vue Developer',
    requirements: ['Vue обязателен', 'Docker обязателен', 'Kubernetes обязателен'],
    responsibilities: [],
    technologies: ['Vue', 'Docker', 'Kubernetes'],
    description: 'Нужны Vue, Docker и Kubernetes.',
  });

  // Ровно сценарий пользователя: Vue он знает, но в резюме про него забыл.
  const resumeWithoutVue = `ОПЫТ РАБОТЫ
Developer — Example Inc. (2020 — 2024)
- Делал сервисы на Node.js
НАВЫКИ
Node.js, Docker, PostgreSQL`;

  const profile = makeProfile({
    experience: [],
    skills: [
      makeSkill({ name: 'Vue', category: 'frontend' }),
      makeSkill({ name: 'Docker', category: 'devops' }),
      makeSkill({ name: 'Node.js', category: 'backend' }),
    ],
  });

  it('находит навык, который есть у пользователя, но забыт в резюме', () => {
    const gaps = analyzeResumeGaps(job, profile, resumeWithoutVue);
    expect(gaps.missingFromResume.map((gap) => gap.skill)).toContain('Vue');
    expect(gaps.covered.map((gap) => gap.skill)).toContain('Docker');
  });

  it('отделяет то, чего нет ни в профиле, ни в резюме', () => {
    const gaps = analyzeResumeGaps(job, profile, resumeWithoutVue);
    expect(gaps.notOwned.map((gap) => gap.skill)).toContain('Kubernetes');
    expect(gaps.missingFromResume.map((gap) => gap.skill)).not.toContain('Kubernetes');
  });

  it('покрытие профилем выше, чем покрытие резюме', () => {
    const gaps = analyzeResumeGaps(job, profile, resumeWithoutVue);
    expect(gaps.profileCoverage).toBeGreaterThan(gaps.resumeCoverage);
  });

  it('засчитывает навык, если в резюме есть технология, которая его подразумевает', () => {
    const gaps = analyzeResumeGaps(
      makeJob({
        title: 'Vue Developer',
        requirements: ['Vue'],
        responsibilities: [],
        technologies: ['Vue'],
        description: 'Vue',
      }),
      profile,
      'НАВЫКИ\nNuxt, TypeScript',
    );
    expect(gaps.covered.map((gap) => gap.skill)).toContain('Vue');
  });

  it('предлагает ключевые слова с версией из профиля', () => {
    const versioned = makeProfile({
      experience: [],
      skills: [makeSkill({ name: 'Vue', category: 'frontend', version: '3' })],
    });
    const gaps = analyzeResumeGaps(job, versioned, 'НАВЫКИ\nDocker');
    expect(suggestedKeywords(gaps)).toContain('Vue 3');
  });
});

describe('фильтр правдивости поверх ответа модели', () => {
  const profile = makeProfile({
    experience: [
      {
        id: 'exp1',
        company: 'Example Inc.',
        position: 'Developer',
        startDate: '2020-01',
        endDate: '',
        current: true,
        description: '',
        technologies: ['Vue'],
      },
    ],
    skills: [makeSkill({ name: 'Vue', category: 'frontend' })],
  });

  it('выбрасывает навык, которого нет ни в профиле, ни в резюме', () => {
    const generated = tailoredResumeSchema.parse({
      skills: ['Vue', 'Kubernetes'],
      addedFromProfile: ['Kubernetes'],
    });
    const result = enforceTruthfulness(generated, profile, 'Резюме без кубера');
    expect(result.resume.skills).toEqual(['Vue']);
    expect(result.rejected).toContain('Kubernetes');
    expect(result.resume.notAdded).toContain('Kubernetes');
    expect(result.resume.status).toBe('needs_user_confirmation');
  });

  it('оставляет навык, который написан в исходном резюме', () => {
    const generated = tailoredResumeSchema.parse({ skills: ['Redis'] });
    const result = enforceTruthfulness(generated, profile, 'НАВЫКИ\nRedis, Vue');
    expect(result.resume.skills).toEqual(['Redis']);
    expect(result.rejected).toHaveLength(0);
  });

  it('выбрасывает выдуманного работодателя', () => {
    const generated = tailoredResumeSchema.parse({
      experience: [{ company: 'Google', position: 'Engineer', period: '2019 — 2021', bullets: [] }],
    });
    const result = enforceTruthfulness(generated, profile, 'Резюме');
    expect(result.resume.experience).toHaveLength(0);
    expect(result.rejected).toContain('Google');
  });

  it('оставляет работодателя из профиля', () => {
    const generated = tailoredResumeSchema.parse({
      experience: [
        { company: 'Example Inc.', position: 'Developer', period: '2020 — сейчас', bullets: ['x'] },
      ],
    });
    const result = enforceTruthfulness(generated, profile, 'Резюме');
    expect(result.resume.experience).toHaveLength(1);
  });
});

describe('сборка резюме без AI', () => {
  const job = makeJob({
    title: 'Vue Developer',
    requirements: ['Vue обязателен'],
    responsibilities: [],
    technologies: ['Vue'],
    description: 'Vue',
  });

  it('дописывает подтверждённые профилем навыки', () => {
    const outcome = tailorWithoutAI(job, makeProfile(), 'НАВЫКИ\nNode.js');
    expect(outcome.resume.skills).toContain('Vue');
    expect(outcome.resume.addedFromProfile).toContain('Vue');
    expect(outcome.rejectedSkills).toHaveLength(0);
  });

  it('не добавляет то, чего у пользователя нет', () => {
    const outcome = tailorWithoutAI(
      makeJob({
        title: 'Kubernetes Engineer',
        requirements: ['Kubernetes обязателен'],
        responsibilities: [],
        technologies: ['Kubernetes'],
        description: 'Kubernetes',
      }),
      makeProfile({ experience: [], skills: [makeSkill({ name: 'Docker', category: 'devops' })] }),
      'НАВЫКИ\nDocker',
    );
    expect(outcome.resume.skills).not.toContain('Kubernetes');
    expect(outcome.resume.notAdded).toContain('Kubernetes');
  });
});

describe('экспорт резюме', () => {
  const profile = makeProfile();
  const resume = tailoredResumeSchema.parse({
    headline: 'Senior Fullstack Developer',
    summary: 'Инженер с опытом на Vue и Node.js.',
    skills: ['Vue 3', 'Node.js'],
    experience: [
      {
        company: 'Example Inc.',
        position: 'Fullstack Developer',
        period: '2020 — настоящее время',
        bullets: ['Разрабатывал внутренние сервисы'],
      },
    ],
    education: [{ institution: 'Ягеллонский университет', degree: 'Информатика' }],
    languages: ['English (C1)'],
  });
  const context = { resume, profile, jobTitle: 'Senior Vue Developer' };

  it('простой текст содержит стандартные разделы', () => {
    const text = renderPlainText(context);
    expect(text).toContain('НАВЫКИ');
    expect(text).toContain('ОПЫТ РАБОТЫ');
    expect(text).toContain('ОБРАЗОВАНИЕ');
    expect(text).toContain('Vue 3');
  });

  it('текстовая версия сама проходит ATS-аудит', () => {
    const audit = auditResume({ text: renderPlainText(context) });
    expect(audit.score).toBeGreaterThanOrEqual(80);
  });

  it('markdown содержит заголовки', () => {
    expect(renderMarkdown(context)).toMatch(/^# /m);
    expect(renderMarkdown(context)).toContain('## Навыки');
  });

  it('печатная версия — одна колонка без таблиц и картинок', () => {
    const html = renderPrintableHtml(context);
    expect(html).not.toMatch(/<table|<img|position:\s*absolute|column-count/i);
    expect(html).toContain('@page');
    expect(html).toContain('Arial');
  });

  it('печатная версия экранирует пользовательский текст', () => {
    const hostile = tailoredResumeSchema.parse({
      summary: '<script>alert(1)</script>',
      skills: ['<img src=x onerror=alert(1)>'],
    });
    const html = renderPrintableHtml({ ...context, resume: hostile });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('имя файла транслитерируется и безопасно для ATS', () => {
    const name = suggestedFileName(profile, 'Senior Vue Developer');
    expect(name).toMatch(/^[\w.-]+\.pdf$/);
    expect(
      auditResume({ text: 'x', fileName: name }).checks.find((c) => c.id === 'file_name')?.severity,
    ).toBe('ok');
  });
});
