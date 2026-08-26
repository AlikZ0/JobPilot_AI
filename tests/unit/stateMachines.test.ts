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

  it('не даёт прыгнуть в «отправлено» с непрочитанной вакансии', () => {
    // Вакансию ещё не открывали — отправлять было нечего.
    expect(canTransitionJob('discovered', 'submitted')).toBe(false);
    expect(canTransitionJob('queued', 'submitted')).toBe(false);
    expect(() => assertJobTransition('discovered', 'submitted')).toThrow(
      /Недопустимый переход вакансии/,
    );
  });

  it('пускает в «отправлено» с любого шага после анализа', () => {
    // Откликаются и прямо на сайте, без черновика заявки в JobPilot.
    expect(canTransitionJob('analyzed', 'submitted')).toBe(true);
    expect(canTransitionJob('saved', 'submitted')).toBe(true);
    expect(canTransitionJob('application_preparing', 'submitted')).toBe(true);
    expect(canTransitionJob('application_ready', 'submitted')).toBe(true);
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

  it('в «отправлено» попадает с любого рабочего шага, но не из отменённой', () => {
    // Человек часто дозаполняет форму руками и жмёт «Откликнуться», не доводя
    // черновик до `ready`; отменённая заявка — обратное решение пользователя.
    for (const state of APPLICATION_STATES) {
      const allowed = canTransitionApplication(state, 'submitted');
      expect(allowed).toBe(state !== 'cancelled');
    }
    expect(() => assertApplicationTransition('cancelled', 'submitted')).toThrow();
  });

  it('из «отправлено» есть только откат ошибочной автоматической отметки', () => {
    expect(APPLICATION_TRANSITIONS.submitted).toEqual(['ready']);
    expect(canTransitionApplication('submitted', 'ready')).toBe(true);
    expect(canTransitionApplication('submitted', 'draft')).toBe(false);
    expect(canTransitionApplication('submitted', 'cancelled')).toBe(false);
  });
});
