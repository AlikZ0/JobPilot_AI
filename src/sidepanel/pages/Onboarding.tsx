import { useState } from 'react';
import type { UserProfile } from '@/types/profile';
import { useStore, withBusy } from '../state/store';
import { ProfileForm } from '../components/ProfileForm';

const STEPS = [
  {
    key: 'personal' as const,
    title: 'Who you are',
    hint: 'Used to fill application forms. This never leaves your device.',
  },
  {
    key: 'professional' as const,
    title: 'Your role',
    hint: 'Drives seniority, experience and salary scoring.',
  },
  {
    key: 'skills' as const,
    title: 'Your stack',
    hint: 'The heart of matching — add every technology you actually use.',
  },
  {
    key: 'preferences' as const,
    title: 'What you want',
    hint: 'Work mode, employment type and dealbreakers.',
  },
];

export function Onboarding() {
  const profile = useStore((state) => state.profile);
  const updateProfile = useStore((state) => state.updateProfile);
  const navigate = useStore((state) => state.navigate);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<UserProfile | null>(null);

  if (!profile) return null;
  const current = draft ?? profile;
  const active = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  const finish = () =>
    void withBusy('Saving profile', async () => {
      await updateProfile({ ...current, onboardingCompleted: true });
      setDraft(null);
      navigate('dashboard');
    });

  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="text-[18px] font-bold">{active.title}</h1>
        <p className="text-[12px] text-muted">{active.hint}</p>
      </header>

      <div
        className="h-1 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
      >
        <div
          className="h-full bg-brand transition-all"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <ProfileForm
        profile={current}
        onChange={(patch) => setDraft({ ...current, ...patch })}
        sections={[active.key]}
      />

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <button
          type="button"
          className="jp-button"
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          disabled={step === 0}
        >
          Back
        </button>
        <div className="flex gap-1.5">
          <button type="button" className="jp-button-ghost" onClick={finish}>
            Skip for now
          </button>
          {isLast ? (
            <button type="button" className="jp-button-primary" onClick={finish}>
              Finish
            </button>
          ) : (
            <button
              type="button"
              className="jp-button-primary"
              onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
            >
              Continue
            </button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted">
        JobPilot works without AI: matching, extraction and scoring all run locally. Add an API key
        in Settings later if you want AI reasoning, cover letters and form help.
      </p>
    </div>
  );
}
