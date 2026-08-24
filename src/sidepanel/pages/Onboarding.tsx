import { useState } from 'react';
import type { UserProfile } from '@/types/profile';
import { useStore, withBusy } from '../state/store';
import { ProfileForm } from '../components/ProfileForm';
import { Icon, Logo, type IconName } from '../components/Icon';

const STEPS: {
  key: 'personal' | 'professional' | 'skills' | 'preferences';
  title: string;
  hint: string;
  icon: IconName;
}[] = [
  {
    key: 'personal' as const,
    icon: 'user',
    title: 'Кто вы',
    hint: 'Нужно для заполнения форм отклика. Эти данные не покидают ваше устройство.',
  },
  {
    key: 'professional' as const,
    icon: 'briefcase',
    title: 'Ваша роль',
    hint: 'Влияет на оценку уровня, опыта и зарплаты.',
  },
  {
    key: 'skills' as const,
    icon: 'bolt',
    title: 'Ваш стек',
    hint: 'Сердце подбора — добавьте все технологии, с которыми реально работаете.',
  },
  {
    key: 'preferences' as const,
    icon: 'target',
    title: 'Чего вы хотите',
    hint: 'Формат работы, тип занятости и стоп-факторы.',
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
    void withBusy('Сохраняем профиль', async () => {
      await updateProfile({ ...current, onboardingCompleted: true });
      setDraft(null);
      navigate('dashboard');
    });

  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Logo size={26} />
        <span className="text-[13px] font-semibold">JobPilot AI</span>
        <span className="ml-auto text-[11px] font-medium text-muted">
          Шаг {step + 1} из {STEPS.length}
        </span>
      </div>

      <div
        className="flex gap-1"
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-label={`Шаг ${step + 1} из ${STEPS.length}`}
      >
        {STEPS.map((entry, index) => (
          <span
            key={entry.key}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              index <= step ? 'bg-brand' : 'bg-surface-3'
            }`}
          />
        ))}
      </div>

      <header className="flex items-start gap-2.5">
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand"
          aria-hidden="true"
        >
          <Icon name={active.icon} size={18} />
        </span>
        <div className="min-w-0">
          <h1 className="text-[18px] font-bold leading-tight">{active.title}</h1>
          <p className="mt-0.5 text-[12px] leading-snug text-muted">{active.hint}</p>
        </div>
      </header>

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
          <Icon name="chevronLeft" size={13} />
          Назад
        </button>
        <div className="flex gap-1.5">
          <button type="button" className="jp-button-ghost" onClick={finish}>
            Пропустить
          </button>
          {isLast ? (
            <button type="button" className="jp-button-primary" onClick={finish}>
              <Icon name="check" size={13} />
              Готово
            </button>
          ) : (
            <button
              type="button"
              className="jp-button-primary"
              onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
            >
              Дальше
              <Icon name="chevronRight" size={13} />
            </button>
          )}
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-surface-2 p-2.5 text-[11px] leading-snug text-muted">
        <span className="mt-px flex-shrink-0 text-brand">
          <Icon name="shield" size={13} />
        </span>
        <span>
          JobPilot работает и без AI: извлечение, сопоставление и подсчёт балла выполняются
          локально. Добавьте API-ключ в настройках позже, если захотите объяснения от AI,
          сопроводительные письма и помощь с формами.
        </span>
      </p>
    </div>
  );
}
