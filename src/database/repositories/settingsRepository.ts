import { getDb } from '../db';
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from '@/types/settings';

export const SETTINGS_ID = 'primary';

/**
 * Confirmation before submit can never be disabled, and contact details are
 * never shared with an AI provider. Both are re-applied before validation so a
 * corrupted or hand-edited record is corrected rather than rejected.
 */
function coerceInvariants(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const record = raw as Record<string, unknown>;
  const automation = (record.automation ?? {}) as Record<string, unknown>;
  const privacy = (record.privacy ?? {}) as Record<string, unknown>;
  return {
    ...record,
    automation: { ...automation, requireConfirmationBeforeSubmit: true },
    privacy: { ...privacy, shareContactDetailsWithAI: false },
  };
}

function enforceInvariants(settings: Settings): Settings {
  return {
    ...settings,
    automation: { ...settings.automation, requireConfirmationBeforeSubmit: true },
    privacy: { ...settings.privacy, shareContactDetailsWithAI: false },
  };
}

export async function getSettings(): Promise<Settings> {
  const stored = await getDb().settings.get(SETTINGS_ID);
  if (!stored) {
    const fresh = enforceInvariants({ ...DEFAULT_SETTINGS, updatedAt: Date.now() });
    await getDb().settings.put(fresh);
    return fresh;
  }
  // Older records are re-parsed so newly added fields get their defaults.
  return enforceInvariants(settingsSchema.parse(coerceInvariants(stored)));
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = enforceInvariants(
    settingsSchema.parse(
      coerceInvariants({
        ...current,
        ...patch,
        automation: { ...current.automation, ...(patch.automation ?? {}) },
        notifications: { ...current.notifications, ...(patch.notifications ?? {}) },
        privacy: { ...current.privacy, ...(patch.privacy ?? {}) },
        costControl: { ...current.costControl, ...(patch.costControl ?? {}) },
        providers: { ...current.providers, ...(patch.providers ?? {}) },
        id: SETTINGS_ID,
        updatedAt: Date.now(),
      }),
    ),
  );
  await getDb().settings.put(next);
  return next;
}

export async function replaceSettings(settings: Settings): Promise<Settings> {
  const parsed = enforceInvariants(
    settingsSchema.parse(coerceInvariants({ ...settings, id: SETTINGS_ID })),
  );
  await getDb().settings.put(parsed);
  return parsed;
}
