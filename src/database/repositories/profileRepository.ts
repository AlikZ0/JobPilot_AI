import { getDb } from '../db';
import { userProfileSchema, type UserProfile } from '@/types/profile';
import { createId } from '@/utils/id';

export const PROFILE_ID = 'primary';

export function createEmptyProfile(now = Date.now()): UserProfile {
  return userProfileSchema.parse({
    id: PROFILE_ID,
    version: 1,
    createdAt: now,
    updatedAt: now,
    onboardingCompleted: false,
  });
}

export async function getProfile(): Promise<UserProfile> {
  const stored = await getDb().profiles.get(PROFILE_ID);
  if (stored) return userProfileSchema.parse(stored);
  const fresh = createEmptyProfile();
  await getDb().profiles.put(fresh);
  return fresh;
}

export async function getProfileOrNull(): Promise<UserProfile | null> {
  const stored = await getDb().profiles.get(PROFILE_ID);
  return stored ? userProfileSchema.parse(stored) : null;
}

/**
 * Persists a profile change and bumps `version`, which invalidates every
 * cached analysis (analyses are stored with the version they were made for).
 */
export async function saveProfile(
  patch: Partial<UserProfile>,
  options: { bumpVersion?: boolean } = {},
): Promise<UserProfile> {
  const current = await getProfile();
  const bump = options.bumpVersion ?? true;
  const next = userProfileSchema.parse({
    ...current,
    ...patch,
    id: PROFILE_ID,
    createdAt: current.createdAt,
    version: bump ? current.version + 1 : current.version,
    updatedAt: Date.now(),
  });
  await getDb().profiles.put(next);
  return next;
}

export async function replaceProfile(profile: UserProfile): Promise<UserProfile> {
  const parsed = userProfileSchema.parse({ ...profile, id: PROFILE_ID });
  await getDb().profiles.put(parsed);
  return parsed;
}

/** True once the minimum data needed for meaningful scoring is present. */
export function isProfileUsable(profile: UserProfile): boolean {
  return (
    profile.onboardingCompleted &&
    profile.skills.length > 0 &&
    (profile.professional.desiredPosition.length > 0 ||
      profile.professional.currentPosition.length > 0)
  );
}

export function newAttachmentId(): string {
  return createId('att');
}
