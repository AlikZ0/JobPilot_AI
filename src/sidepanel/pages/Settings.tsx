import { useEffect, useState } from 'react';
import { AI_PROVIDER_IDS, type AIProviderId } from '@/types/ai';
import { MESSAGE_TYPES } from '@/types/messages';
import { sendToBackground } from '@/utils/messaging';
import { listProviders, getProvider } from '@/providers/registry';
import {
  clearApiKeys,
  getKeyStorageMode,
  setApiKey,
  listConfiguredProviders,
  setKeyStorageMode,
  type KeyStorageMode,
} from '@/core/ai/keyStore';
import {
  PERMISSION_EXPLANATIONS,
  listGrantedOrigins,
  removeHostPermission,
} from '@/utils/permissions';
import { clearAllData } from '@/database/db';
import {
  bundleToBlob,
  exportAllData,
  importData,
  suggestedExportFilename,
} from '@/database/transfer';
import { summarizeUsage } from '@/database/repositories/usageRepository';
import { DAY_MS } from '@/utils/time';
import { useStore, withBusy } from '../state/store';

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-[12px] font-medium">{label}</p>
        {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const pushToast = useStore((state) => state.pushToast);
  const refreshData = useStore((state) => state.refreshData);

  const [keyDraft, setKeyDraft] = useState('');
  const [configured, setConfigured] = useState<AIProviderId[]>([]);
  const [keyMode, setKeyMode] = useState<KeyStorageMode>('local');
  const [origins, setOrigins] = useState<string[]>([]);
  const [usage, setUsage] = useState<{ requests: number; cost: number } | null>(null);

  useEffect(() => {
    void listConfiguredProviders().then(setConfigured);
    void getKeyStorageMode().then(setKeyMode);
    void listGrantedOrigins().then(setOrigins);
    void summarizeUsage(Date.now() - 30 * DAY_MS).then((summary) =>
      setUsage({ requests: summary.requests, cost: summary.estimatedCostUsd }),
    );
  }, []);

  if (!settings) return null;
  const activeProvider = settings.aiMode === 'cloud' ? 'cloud' : settings.activeProvider;
  const provider = getProvider(activeProvider);
  const providerConfig = settings.providers[activeProvider] ?? {
    model: '',
    baseUrl: '',
    temperature: 0.2,
    maxTokens: 2048,
    timeoutMs: 60_000,
  };

  const patchProvider = (patch: Partial<typeof providerConfig>) =>
    void updateSettings({
      providers: { ...settings.providers, [activeProvider]: { ...providerConfig, ...patch } },
    });

  const saveKey = () =>
    void withBusy('Saving key', async () => {
      await setApiKey(activeProvider, keyDraft.trim());
      setKeyDraft('');
      setConfigured(await listConfiguredProviders());
      pushToast({ level: 'success', message: `Key stored for ${provider.label}.` });
    });

  const testConnection = () =>
    void withBusy('Testing provider', async () => {
      const result = await sendToBackground(MESSAGE_TYPES.TEST_AI_PROVIDER, undefined);
      pushToast({ level: result.ok ? 'success' : 'error', message: result.message });
    });

  const exportData = () =>
    void withBusy('Exporting', async () => {
      const bundle = await exportAllData();
      const url = URL.createObjectURL(bundleToBlob(bundle));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = suggestedExportFilename();
      anchor.click();
      URL.revokeObjectURL(url);
      pushToast({ level: 'success', message: 'Export downloaded.' });
    });

  const importFile = (file: File) =>
    void withBusy('Importing', async () => {
      const text = await file.text();
      const summary = await importData(JSON.parse(text), { mode: 'merge' });
      await refreshData();
      pushToast({
        level: 'success',
        message: `Imported ${summary.jobs} jobs, ${summary.applications} applications.${
          summary.warnings.length ? ` ${summary.warnings.join(' ')}` : ''
        }`,
      });
    });

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1">
        <h2 className="jp-section-title">Appearance</h2>
        <Row label="Theme">
          <select
            className="jp-input w-auto py-1"
            value={settings.theme}
            onChange={(event) => void updateSettings({ theme: event.target.value as 'system' })}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </Row>
        <Row label="AI output language" hint="Language used for letters and answers.">
          <input
            className="jp-input w-32 py-1"
            value={settings.generationLanguage}
            onChange={(event) => void updateSettings({ generationLanguage: event.target.value })}
          />
        </Row>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="jp-section-title">AI provider</h2>
        <Row label="Mode" hint="Local uses your own key. Cloud calls your own gateway.">
          <select
            className="jp-input w-auto py-1"
            value={settings.aiMode}
            onChange={(event) => void updateSettings({ aiMode: event.target.value as 'local' })}
          >
            <option value="local">Local (your API key)</option>
            <option value="cloud">Cloud gateway</option>
          </select>
        </Row>
        {settings.aiMode === 'local' ? (
          <Row label="Provider">
            <select
              className="jp-input w-auto py-1"
              value={settings.activeProvider}
              onChange={(event) =>
                void updateSettings({ activeProvider: event.target.value as AIProviderId })
              }
            >
              {AI_PROVIDER_IDS.filter((id) => id !== 'cloud').map((id) => (
                <option key={id} value={id}>
                  {getProvider(id).label}
                  {configured.includes(id) ? ' ✓' : ''}
                </option>
              ))}
            </select>
          </Row>
        ) : (
          <Row label="Gateway endpoint">
            <input
              className="jp-input w-52 py-1"
              placeholder="https://your-gateway.example"
              value={settings.cloudEndpoint}
              onChange={(event) => void updateSettings({ cloudEndpoint: event.target.value })}
            />
          </Row>
        )}
        <Row
          label="API key"
          hint={
            configured.includes(activeProvider)
              ? 'A key is stored for this provider. Entering a new one replaces it; it can never be read back.'
              : 'Stored in extension storage only. Never sent to job sites, never exported.'
          }
        >
          <div className="flex gap-1">
            <input
              className="jp-input w-40 py-1"
              type="password"
              autoComplete="off"
              placeholder="Paste key"
              value={keyDraft}
              onChange={(event) => setKeyDraft(event.target.value)}
            />
            <button
              type="button"
              className="jp-button"
              onClick={saveKey}
              disabled={!keyDraft.trim()}
            >
              Save
            </button>
          </div>
        </Row>
        <Row label="Key storage" hint="Session mode forgets keys when Chrome closes.">
          <select
            className="jp-input w-auto py-1"
            value={keyMode}
            onChange={(event) =>
              void setKeyStorageMode(event.target.value as KeyStorageMode).then(() =>
                setKeyMode(event.target.value as KeyStorageMode),
              )
            }
          >
            <option value="local">Persistent</option>
            <option value="session">Session only</option>
          </select>
        </Row>
        <Row label="Model" hint={provider.suggestedModels.join(', ') || 'Enter the model id.'}>
          <input
            className="jp-input w-44 py-1"
            list="jp-models"
            value={providerConfig.model}
            placeholder={provider.suggestedModels[0] ?? 'model-id'}
            onChange={(event) => patchProvider({ model: event.target.value })}
          />
        </Row>
        <datalist id="jp-models">
          {listProviders()
            .flatMap((entry) => entry.suggestedModels)
            .map((model) => (
              <option key={model} value={model} />
            ))}
        </datalist>
        <Row label="Base URL" hint="Override for proxies or self-hosted endpoints.">
          <input
            className="jp-input w-44 py-1"
            placeholder={provider.defaultBaseUrl || 'https://…'}
            value={providerConfig.baseUrl}
            onChange={(event) => patchProvider({ baseUrl: event.target.value })}
          />
        </Row>
        <Row label="Temperature">
          <input
            className="jp-input w-20 py-1"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={providerConfig.temperature}
            onChange={(event) => patchProvider({ temperature: Number(event.target.value) })}
          />
        </Row>
        <Row label="Max tokens">
          <input
            className="jp-input w-24 py-1"
            type="number"
            min={256}
            max={32_000}
            step={256}
            value={providerConfig.maxTokens}
            onChange={(event) => patchProvider({ maxTokens: Number(event.target.value) })}
          />
        </Row>
        <Row label="Timeout (s)">
          <input
            className="jp-input w-20 py-1"
            type="number"
            min={3}
            max={180}
            value={Math.round(providerConfig.timeoutMs / 1000)}
            onChange={(event) => patchProvider({ timeoutMs: Number(event.target.value) * 1000 })}
          />
        </Row>
        <button type="button" className="jp-button self-start" onClick={testConnection}>
          Test connection
        </button>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="jp-section-title">Automation</h2>
        {(
          [
            ['autoAnalyzeJobs', 'Auto analyze jobs', 'Analyze automatically during a scan.'],
            ['autoOpenJobs', 'Auto open jobs', 'Open postings from a listing in background tabs.'],
            ['autoFillForms', 'Auto fill forms', 'Fill high-confidence fields without asking.'],
            [
              'autoGenerateCoverLetter',
              'Auto generate cover letter',
              'Draft a letter when an application starts.',
            ],
            [
              'requireConfirmationBeforeFill',
              'Confirm before filling',
              'Review every field before it is written.',
            ],
          ] as const
        ).map(([key, label, hint]) => (
          <Row key={key} label={label} hint={hint}>
            <input
              type="checkbox"
              checked={settings.automation[key]}
              onChange={(event) =>
                void updateSettings({
                  automation: { ...settings.automation, [key]: event.target.checked },
                })
              }
            />
          </Row>
        ))}
        <Row
          label="Confirm before submit"
          hint="Always on. JobPilot never submits an application by itself."
        >
          <input type="checkbox" checked readOnly disabled aria-label="Always required" />
        </Row>
        <Row label="Max jobs per session">
          <input
            className="jp-input w-20 py-1"
            type="number"
            min={1}
            max={500}
            value={settings.automation.maxJobsPerSession}
            onChange={(event) =>
              void updateSettings({
                automation: {
                  ...settings.automation,
                  maxJobsPerSession: Number(event.target.value),
                },
              })
            }
          />
        </Row>
        <Row label="Max concurrent tabs" hint="1–3. Higher values risk rate limiting.">
          <input
            className="jp-input w-20 py-1"
            type="number"
            min={1}
            max={3}
            value={settings.automation.maxConcurrentTabs}
            onChange={(event) =>
              void updateSettings({
                automation: {
                  ...settings.automation,
                  maxConcurrentTabs: Number(event.target.value),
                },
              })
            }
          />
        </Row>
        <Row label="Delay between jobs (ms)">
          <input
            className="jp-input w-24 py-1"
            type="number"
            min={500}
            max={60_000}
            step={250}
            value={settings.automation.delayBetweenJobsMs}
            onChange={(event) =>
              void updateSettings({
                automation: {
                  ...settings.automation,
                  delayBetweenJobsMs: Number(event.target.value),
                },
              })
            }
          />
        </Row>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="jp-section-title">Notifications</h2>
        <Row label="Enabled">
          <input
            type="checkbox"
            checked={settings.notifications.enabled}
            onChange={(event) =>
              void updateSettings({
                notifications: { ...settings.notifications, enabled: event.target.checked },
              })
            }
          />
        </Row>
        <Row label="Minimum score to notify">
          <input
            className="jp-input w-20 py-1"
            type="number"
            min={0}
            max={100}
            value={settings.notifications.minScore}
            onChange={(event) =>
              void updateSettings({
                notifications: { ...settings.notifications, minScore: Number(event.target.value) },
              })
            }
          />
        </Row>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="jp-section-title">Privacy</h2>
        <Row
          label="Allow AI requests"
          hint="Off by default. When off, everything still works deterministically."
        >
          <input
            type="checkbox"
            checked={settings.privacy.allowAIRequests}
            onChange={(event) =>
              void updateSettings({
                privacy: { ...settings.privacy, allowAIRequests: event.target.checked },
              })
            }
          />
        </Row>
        <Row label="Share work history with AI" hint="Needed for grounded cover letters.">
          <input
            type="checkbox"
            checked={settings.privacy.shareExperienceWithAI}
            onChange={(event) =>
              void updateSettings({
                privacy: { ...settings.privacy, shareExperienceWithAI: event.target.checked },
              })
            }
          />
        </Row>
        <Row label="Share contact details with AI" hint="Never. Name, email and phone stay local.">
          <input type="checkbox" checked={false} readOnly disabled />
        </Row>
        <Row label="Store AI reasoning" hint="Keeps explanations in the local database.">
          <input
            type="checkbox"
            checked={settings.privacy.storeAIResponses}
            onChange={(event) =>
              void updateSettings({
                privacy: { ...settings.privacy, storeAIResponses: event.target.checked },
              })
            }
          />
        </Row>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="jp-section-title">Cost control</h2>
        <Row
          label="Max description characters"
          hint="Longer descriptions are truncated before sending."
        >
          <input
            className="jp-input w-24 py-1"
            type="number"
            min={500}
            max={20_000}
            step={500}
            value={settings.costControl.maxDescriptionChars}
            onChange={(event) =>
              void updateSettings({
                costControl: {
                  ...settings.costControl,
                  maxDescriptionChars: Number(event.target.value),
                },
              })
            }
          />
        </Row>
        <Row
          label="Cache analyses"
          hint="Never analyze the same posting for the same profile twice."
        >
          <input
            type="checkbox"
            checked={settings.costControl.cacheAnalyses}
            onChange={(event) =>
              void updateSettings({
                costControl: { ...settings.costControl, cacheAnalyses: event.target.checked },
              })
            }
          />
        </Row>
        <Row label="Daily request limit" hint="0 disables the limit.">
          <input
            className="jp-input w-20 py-1"
            type="number"
            min={0}
            max={10_000}
            value={settings.costControl.dailyRequestLimit}
            onChange={(event) =>
              void updateSettings({
                costControl: {
                  ...settings.costControl,
                  dailyRequestLimit: Number(event.target.value),
                },
              })
            }
          />
        </Row>
        <Row label="Price per 1K input tokens (USD)">
          <input
            className="jp-input w-24 py-1"
            type="number"
            min={0}
            step={0.0001}
            value={settings.costControl.estimatedInputCostPer1k}
            onChange={(event) =>
              void updateSettings({
                costControl: {
                  ...settings.costControl,
                  estimatedInputCostPer1k: Number(event.target.value),
                },
              })
            }
          />
        </Row>
        <Row label="Price per 1K output tokens (USD)">
          <input
            className="jp-input w-24 py-1"
            type="number"
            min={0}
            step={0.0001}
            value={settings.costControl.estimatedOutputCostPer1k}
            onChange={(event) =>
              void updateSettings({
                costControl: {
                  ...settings.costControl,
                  estimatedOutputCostPer1k: Number(event.target.value),
                },
              })
            }
          />
        </Row>
        {usage ? (
          <p className="text-[11px] text-muted">
            Last 30 days: {usage.requests} AI requests · estimated ${usage.cost.toFixed(4)}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="jp-section-title">Permissions</h2>
        <ul className="flex flex-col gap-1">
          {PERMISSION_EXPLANATIONS.map((permission) => (
            <li key={permission.id} className="text-[11px]">
              <span className="font-medium">{permission.title}</span>
              <span className="text-muted"> — {permission.why}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] font-medium">Sites you granted access to</p>
        {origins.length === 0 ? (
          <p className="text-[11px] text-muted">None yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {origins.map((origin) => (
              <li key={origin} className="jp-badge gap-1.5">
                {origin}
                <button
                  type="button"
                  aria-label={`Revoke ${origin}`}
                  className="text-muted hover:text-poor"
                  onClick={() =>
                    void removeHostPermission(origin.replace('/*', '')).then(async () =>
                      setOrigins(await listGrantedOrigins()),
                    )
                  }
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="jp-section-title">Your data</h2>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="jp-button" onClick={exportData}>
            Export JSON
          </button>
          <label className="jp-button cursor-pointer">
            Import JSON
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importFile(file);
                event.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            className="jp-button border-poor/40 text-poor"
            onClick={() => {
              const confirmed = window.confirm(
                'Delete every job, analysis, application, setting and API key stored by JobPilot? This cannot be undone.',
              );
              if (!confirmed) return;
              void withBusy('Clearing data', async () => {
                await clearAllData();
                await clearApiKeys();
                await refreshData();
                pushToast({ level: 'success', message: 'All local data deleted.' });
                window.location.reload();
              });
            }}
          >
            Clear all data
          </button>
        </div>
        <p className="text-[11px] text-muted">
          Exports contain your profile, jobs, analyses and applications — never API keys.
        </p>
      </section>
    </div>
  );
}
