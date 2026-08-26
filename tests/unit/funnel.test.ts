import { beforeEach, describe, expect, it } from 'vitest';
import { JobPilotDatabase, setDb } from '@/database/db';
import { applicationSchema, type Application } from '@/types/application';
import { buildFunnel, dueFollowUps, reachedStage, stampsFor } from '@/core/pipeline/funnel';
import {
  createApplication,
  getApplication,
  markSubmitted,
  setApplicationOutcome,
  setFollowUp,
  updateApplication,
} from '@/database/repositories/applicationRepository';
import { DAY_MS, formatUntil } from '@/utils/time';
import { runDueFollowUps, scheduleFollowUpChecks } from '@/background/followUps';

function app(overrides: Partial<Application> = {}): Application {
  return applicationSchema.parse({
    id: `app_${Math.random().toString(36).slice(2)}`,
    jobId: 'job1',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });
}

describe('отметки ступеней', () => {
  it('интервью и оффер подразумевают, что ответ был', () => {
    expect(Object.keys(stampsFor('interview', {}, 100))).toEqual(['replied', 'interview']);
    expect(Object.keys(stampsFor('offer', {}, 100))).toEqual(['replied', 'offer']);
  });

  it('отказ ничего не подразумевает: молчание тоже заканчивается отказом', () => {
    expect(stampsFor('rejected', {}, 100)).toEqual({ rejected: 100 });
  });

  it('дата первого достижения ступени не перезаписывается', () => {
    const first = stampsFor('replied', {}, 100);
    const second = stampsFor('interview', first, 500);
    expect(second.replied).toBe(100);
    expect(second.interview).toBe(500);
  });

  it('ожидание ничего не отмечает', () => {
    expect(stampsFor('awaiting', {}, 100)).toEqual({});
  });
});

describe('воронка', () => {
  it('считает только отправленные заявки', () => {
    const funnel = buildFunnel([
      app({ state: 'draft' }),
      app({ state: 'submitted', submittedAt: 10 }),
    ]);
    expect(funnel.submitted).toBe(1);
  });

  it('ступень засчитана, даже если потом пришёл отказ', () => {
    const rejectedAfterInterview = app({
      state: 'submitted',
      submittedAt: 10,
      outcome: 'rejected',
      outcomeAt: { replied: 20, interview: 30, rejected: 40 },
    });
    const funnel = buildFunnel([rejectedAfterInterview]);
    const byStage = Object.fromEntries(funnel.steps.map((step) => [step.stage, step.count]));
    expect(byStage.replied).toBe(1);
    expect(byStage.interview).toBe(1);
    expect(byStage.offer).toBe(0);
    expect(funnel.rejected).toBe(1);
  });

  it('конверсия считается от отправленных', () => {
    const funnel = buildFunnel([
      app({ state: 'submitted', submittedAt: 1, outcomeAt: { replied: 2 } }),
      app({ state: 'submitted', submittedAt: 1, outcomeAt: { replied: 2, interview: 3 } }),
      app({ state: 'submitted', submittedAt: 1 }),
      app({ state: 'submitted', submittedAt: 1 }),
    ]);
    const byStage = Object.fromEntries(funnel.steps.map((step) => [step.stage, step.share]));
    expect(byStage.submitted).toBe(100);
    expect(byStage.replied).toBe(50);
    expect(byStage.interview).toBe(25);
    expect(byStage.offer).toBe(0);
  });

  it('пустая воронка не делит на ноль', () => {
    const funnel = buildFunnel([]);
    expect(funnel.submitted).toBe(0);
    expect(funnel.steps.every((step) => step.share === 0)).toBe(true);
  });

  it('в ожидании числятся и те, кому просто ответили', () => {
    const funnel = buildFunnel([
      app({ state: 'submitted', submittedAt: 1 }),
      app({ state: 'submitted', submittedAt: 1, outcome: 'replied', outcomeAt: { replied: 2 } }),
      app({ state: 'submitted', submittedAt: 1, outcome: 'rejected', outcomeAt: { rejected: 2 } }),
    ]);
    expect(funnel.awaiting).toBe(2);
  });

  it('reachedStage смотрит на отметку, а не на текущий ответ', () => {
    const application = app({ outcome: 'rejected', outcomeAt: { replied: 5, rejected: 9 } });
    expect(reachedStage(application, 'replied')).toBe(true);
    expect(reachedStage(application, 'interview')).toBe(false);
  });
});

describe('напоминания', () => {
  const now = 1_000_000;

  it('срок подошёл и ответа нет', () => {
    const due = app({ submittedAt: 1, followUpAt: now - 1 });
    const later = app({ submittedAt: 1, followUpAt: now + DAY_MS });
    const none = app({ submittedAt: 1, followUpAt: null });
    expect(dueFollowUps([due, later, none], now).map((row) => row.id)).toEqual([due.id]);
  });

  it('ответившего догонять не нужно', () => {
    const answered = app({
      submittedAt: 1,
      followUpAt: now - 1,
      outcome: 'replied',
      outcomeAt: { replied: 2 },
    });
    expect(dueFollowUps([answered], now)).toEqual([]);
  });

  it('первым идёт самый просроченный', () => {
    const old = app({ submittedAt: 1, followUpAt: now - 10 * DAY_MS });
    const fresh = app({ submittedAt: 1, followUpAt: now - 1 });
    expect(dueFollowUps([fresh, old], now).map((row) => row.id)).toEqual([old.id, fresh.id]);
  });
});

let counter = 0;
beforeEach(() => {
  counter += 1;
  setDb(new JobPilotDatabase(`jobpilot-funnel-${counter}`));
});

describe('отметка ответа в базе', () => {
  async function submitted(): Promise<Application> {
    const created = await createApplication('job1');
    await updateApplication(created.id, { state: 'review' });
    await updateApplication(created.id, { state: 'ready' });
    return markSubmitted(created.id, true);
  }

  it('у неотправленной заявки ответа быть не может', async () => {
    const draft = await createApplication('job1');
    await expect(setApplicationOutcome(draft.id, 'replied')).rejects.toThrow(/отправленной/);
  });

  it('отметка интервью проставляет и ответ', async () => {
    const application = await submitted();
    const updated = await setApplicationOutcome(application.id, 'interview');
    expect(updated.outcome).toBe('interview');
    expect(updated.outcomeAt.replied).toBeTypeOf('number');
    expect(updated.outcomeAt.interview).toBeTypeOf('number');
  });

  it('любой ответ снимает напоминание', async () => {
    const application = await submitted();
    await setFollowUp(application.id, Date.now() + DAY_MS);
    const updated = await setApplicationOutcome(application.id, 'rejected');
    expect(updated.followUpAt).toBeNull();
  });

  it('сброс в ожидание не стирает уже пройденные ступени', async () => {
    const application = await submitted();
    await setApplicationOutcome(application.id, 'interview');
    const reset = await setApplicationOutcome(application.id, 'awaiting');
    expect(reset.outcome).toBe('awaiting');
    // История ступеней остаётся: интервью действительно было.
    expect(reset.outcomeAt.interview).toBeTypeOf('number');
  });
});

describe('подпись срока напоминания', () => {
  const now = 1_000_000_000;

  it('будущее считается вперёд, а не назад', () => {
    expect(formatUntil(now + 3 * DAY_MS, now)).toBe('через 3 дн');
    expect(formatUntil(now + 5 * 60 * 60 * 1000, now)).toBe('через 5 ч');
    expect(formatUntil(now + 90 * 1000, now)).toBe('через 1 мин');
  });

  it('наступивший срок — это «пора», а не «только что»', () => {
    expect(formatUntil(now, now)).toBe('пора');
    expect(formatUntil(now - DAY_MS, now)).toBe('пора');
  });

  it('неполные сутки округляются вверх: «через 0 дн» бессмысленно', () => {
    expect(formatUntil(now + Math.round(1.2 * DAY_MS), now)).toBe('через 2 дн');
  });
});

describe('планировщик напоминаний', () => {
  const alarms = () => (globalThis.chrome.alarms as unknown as { _all: Map<string, unknown> })._all;

  beforeEach(() => alarms().clear());

  it('заводит один периодический будильник', async () => {
    await scheduleFollowUpChecks();
    expect(alarms().get('jobpilot:follow-ups')).toMatchObject({ periodInMinutes: 60 });
  });

  it('не пересоздаёт уже заведённый: иначе отсчёт сбрасывался бы при каждом пробуждении воркера', async () => {
    await scheduleFollowUpChecks();
    const first = alarms().get('jobpilot:follow-ups');
    await scheduleFollowUpChecks();
    await scheduleFollowUpChecks();
    expect(alarms().get('jobpilot:follow-ups')).toBe(first);
    expect(alarms().size).toBe(1);
  });
});

describe('срабатывание напоминаний', () => {
  async function submittedWithReminder(at: number): Promise<Application> {
    const created = await createApplication('job1');
    await updateApplication(created.id, { state: 'review' });
    await updateApplication(created.id, { state: 'ready' });
    await markSubmitted(created.id, true);
    return setFollowUp(created.id, at);
  }

  it('показывает уведомление и снимает срок, чтобы не повторяться каждый час', async () => {
    const notify = globalThis.chrome.notifications.create as unknown as {
      mock: { calls: unknown[] };
    };
    const before = notify.mock.calls.length;
    const application = await submittedWithReminder(Date.now() - DAY_MS);

    const shown = await runDueFollowUps();

    expect(shown).toBe(1);
    expect(notify.mock.calls.length).toBe(before + 1);
    expect((await getApplication(application.id))?.followUpAt).toBeNull();
    // Второй проход уже ничего не находит.
    expect(await runDueFollowUps()).toBe(0);
  });

  it('не трогает заявку, у которой срок ещё не подошёл', async () => {
    await submittedWithReminder(Date.now() + 3 * DAY_MS);
    expect(await runDueFollowUps()).toBe(0);
  });
});
