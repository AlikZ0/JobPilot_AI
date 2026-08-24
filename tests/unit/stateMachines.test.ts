import { describe, expect, it } from 'vitest';
import { assertJobTransition, canTransitionJob, JOB_TRANSITIONS } from '@/core/state/jobState';
import {
  assertApplicationTransition,
  canTransitionApplication,
  APPLICATION_TRANSITIONS,
} from '@/core/state/applicationState';
import { JOB_STATES } from '@/types/job';
import { APPLICATION_STATES } from '@/types/application';

describe('машина состояний вакансии', () => {
  it('покрывает все объявленные состояния', () => {
    for (const state of JOB_STATES) {
      expect(JOB_TRANSITIONS[state]).toBeDefined();
    }
  });

  it('разрешает основной сценарий', () => {
    expect(canTransitionJob('discovered', 'queued')).toBe(true);
    expect(canTransitionJob('queued', 'analyzing')).toBe(true);
    expect(canTransitionJob('analyzing', 'analyzed')).toBe(true);
    expect(canTransitionJob('analyzed', 'saved')).toBe(true);
    expect(canTransitionJob('saved', 'application_preparing')).toBe(true);
    expect(canTransitionJob('application_preparing', 'application_ready')).toBe(true);
    expect(canTransitionJob('application_ready', 'submitted')).toBe(true);
  });

  it('не даёт прыгнуть сразу в «отправлено»', () => {
    expect(canTransitionJob('discovered', 'submitted')).toBe(false);
    expect(canTransitionJob('analyzed', 'submitted')).toBe(false);
    expect(() => assertJobTransition('analyzed', 'submitted')).toThrow(
      /Недопустимый переход вакансии/,
    );
  });

  it('считает переход в то же состояние допустимым', () => {
    expect(canTransitionJob('saved', 'saved')).toBe(true);
  });
});

describe('машина состояний заявки', () => {
  it('покрывает все объявленные состояния', () => {
    for (const state of APPLICATION_STATES) {
      expect(APPLICATION_TRANSITIONS[state]).toBeDefined();
    }
  });

  it('в «отправлено» попадает только из «готово»', () => {
    for (const state of APPLICATION_STATES) {
      const allowed = canTransitionApplication(state, 'submitted');
      expect(allowed).toBe(state === 'ready' || state === 'submitted');
    }
    expect(() => assertApplicationTransition('draft', 'submitted')).toThrow();
  });

  it('после отправки состояние конечное', () => {
    expect(APPLICATION_TRANSITIONS.submitted).toHaveLength(0);
    expect(canTransitionApplication('submitted', 'draft')).toBe(false);
  });
});
