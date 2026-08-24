import { JobPilotError, ERROR_CODES } from './errors';
import { isRestrictedUrl, originPattern } from './url';

/**
 * Host permissions are requested on demand rather than at install time
 * (docs/privacy.md). chrome.permissions.request must run in a user gesture, so
 * the side panel calls this directly; the background worker can only check.
 */
export async function hasHostPermission(url: string): Promise<boolean> {
  const origin = originPattern(url);
  if (!origin) return false;
  try {
    return await chrome.permissions.contains({ origins: [origin] });
  } catch {
    return false;
  }
}

export async function requestHostPermission(url: string): Promise<boolean> {
  if (isRestrictedUrl(url)) {
    throw new JobPilotError(
      ERROR_CODES.RESTRICTED_PAGE,
      'Chrome does not allow extensions to access this page.',
      { recoverable: false },
    );
  }
  const origin = originPattern(url);
  if (!origin) {
    throw new JobPilotError(ERROR_CODES.PERMISSION_DENIED, `Unsupported URL: ${url}`);
  }
  if (await hasHostPermission(url)) return true;
  return chrome.permissions.request({ origins: [origin] });
}

export async function removeHostPermission(url: string): Promise<boolean> {
  const origin = originPattern(url);
  if (!origin) return false;
  return chrome.permissions.remove({ origins: [origin] });
}

export async function listGrantedOrigins(): Promise<string[]> {
  const permissions = await chrome.permissions.getAll();
  return permissions.origins ?? [];
}

/** Human-readable explanation shown next to each permission in Settings. */
export const PERMISSION_EXPLANATIONS: { id: string; title: string; why: string }[] = [
  {
    id: 'storage',
    title: 'Storage',
    why: 'Keeps your profile, jobs and settings on this device. Nothing is uploaded.',
  },
  {
    id: 'sidePanel',
    title: 'Side panel',
    why: 'Renders the JobPilot interface next to the page you are viewing.',
  },
  {
    id: 'activeTab',
    title: 'Active tab',
    why: 'Reads the job posting in the tab you are on, only when you press a JobPilot button.',
  },
  {
    id: 'scripting',
    title: 'Scripting',
    why: 'Injects the extraction script into a page on demand instead of running everywhere.',
  },
  {
    id: 'tabs',
    title: 'Tabs',
    why: 'Opens and closes background tabs during a bulk scan, and closes them afterwards.',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    why: 'Tells you when a high-scoring match is found. Can be turned off in Settings.',
  },
  {
    id: 'host_permissions',
    title: 'Site access (optional)',
    why: 'Granted per site, only when you scan or analyze there. Revoke any time below.',
  },
];
