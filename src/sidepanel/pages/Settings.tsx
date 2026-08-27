import { useEffect, useState } from 'react';
import { AI_PROVIDER_IDS, type AIProviderId } from '@/types/ai';
import { MESSAGE_TYPES } from '@/types/messages';
import { sendToBackground } from '@/utils/messaging';
import { getProvider } from '@/providers/registry';
import {
  addApiKey,
  clearApiKeys,
  deleteApiKey,
  getKeyStorageMode,
  listApiKeys,
  setKeyStorageMode,
  selectApiKey,
  type ApiKeyInfo,
  type KeyStorageMode,
} from '@/core/ai/keyStore';
import { PERMISSION_EXPLANATIONS } from '@/utils/permissions';
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
import { Icon } from '../components/Icon';
import { SiteAccess } from '../components/SiteAccess';
import { ScoringWeights } from '../components/ScoringWeights';
import { hideCompanies, showCompany } from '@/core/pipeline/triage';
import { GENERATION_LANGUAGES } from '../labels';

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
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0 last:pb-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium leading-tight">{label}</p>
        {hint ? <p className="mt-1 text-[11px] leading-relaxed text-muted">{hint}</p> : null}
      </div>
      <div className="flex flex-shrink-0 items-center">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const pushToast = useStore((state) => state.pushToast);
  const refreshData = useStore((state) => state.refreshData);

  const [companyDraft, setCompanyDraft] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [keyLabelDraft, setKeyLabelDraft] = useState('');
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [keyMode, setKeyMode] = useState<KeyStorageMode>('local');
  const [usage, setUsage] = useState<{ requests: number; cost: number } | null>(null);

  const reloadKeys = async () => setKeys(await listApiKeys());

  useEffect(() => {
    void reloadKeys();
    void getKeyStorageMode().then(setKeyMode);
    void summarizeUsage(Date.now() - 30 * DAY_MS).then((summary) =>
      setUsage({ requests: summary.requests, cost: summary.estimatedCostUsd }),
    );
  }, []);

  if (!settings) return null;
  const activeProvider = settings.aiMode === 'cloud' ? 'cloud' : settings.activeProvider;
  const provider = getProvider(activeProvider);
  const modelListId = `jp-models-${activeProvider}`;
  const providerConfig = settings.providers[activeProvider] ?? {
    model: '',
    baseUrl: '',
    temperature: 0.2,
    maxTokens: 2048,
    timeoutMs: 60_000,
  };

  const providerKeys = keys.filter((key) => key.providerId === activeProvider);
  // Язык мог быть задан вручную в старой версии — не теряем его из списка.
  const knownLanguage = GENERATION_LANGUAGES.some(
    (language) => language.value === settings.generationLanguage,
  );

  const patchProvider = (patch: Partial<typeof providerConfig>) =>
    void updateSettings({
      providers: { ...settings.providers, [activeProvider]: { ...providerConfig, ...patch } },
    });

  const saveKey = () =>
    void withBusy('Сохраняем ключ', async () => {
      const added = await addApiKey(activeProvider, keyLabelDraft, keyDraft.trim());
      setKeyDraft('');
      setKeyLabelDraft('');
      await reloadKeys();
      pushToast({
        level: 'success',
        message: `«${added.label}» сохранён для «${provider.label}».`,
      });
    });

  const hideCompany = () => {
    const value = companyDraft.trim();
    if (!value || !settings) return;
    setCompanyDraft('');
    void updateSettings({ hiddenCompanies: hideCompanies(settings.hiddenCompanies, value) });
  };

  const switchKey = (id: string) =>
    void withBusy('Переключаем ключ', async () => {
      await selectApiKey(id);
      await reloadKeys();
    });

  const removeKey = (key: ApiKeyInfo) =>
    void withBusy('Удаляем ключ', async () => {
      await deleteApiKey(key.id);
      await reloadKeys();
      pushToast({ level: 'success', message: `Ключ «${key.label}» удалён.` });
    });

  /**
   * Пассивные функции живут в content-скрипте, который регистрируется
   * динамически, — после переключения просим воркер пересобрать регистрацию.
   */
  const toggleTracking = (key: 'trackSubmissions' | 'showPageBadges', value: boolean) =>
    void withBusy('Сохраняем настройку', async () => {
      await updateSettings({ automation: { ...settings.automation, [key]: value } });
      await sendToBackground(MESSAGE_TYPES.SYNC_TRACKING, undefined);
    });

  const testConnection = () =>
    void withBusy('Проверяем провайдера', async () => {
      const result = await sendToBackground(MESSAGE_TYPES.TEST_AI_PROVIDER, undefined);
      pushToast({ level: result.ok ? 'success' : 'error', message: result.message });
    });

  const exportData = () =>
    void withBusy('Экспортируем', async () => {
      const bundle = await exportAllData();
      const url = URL.createObjectURL(bundleToBlob(bundle));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = suggestedExportFilename();
      anchor.click();
      URL.revokeObjectURL(url);
      pushToast({ level: 'success', message: 'Файл экспорта скачан.' });
    });

  const importFile = (file: File) =>
    void withBusy('Импортируем', async () => {
      const text = await file.text();
      const summary = await importData(JSON.parse(text), { mode: 'merge' });
      await refreshData();
      pushToast({
        level: 'success',
        message: `Импортировано вакансий: ${summary.jobs}, заявок: ${summary.applications}.${
          summary.warnings.length ? ` ${summary.warnings.join(' ')}` : ''
        }`,
      });
    });

  return (
    <div className="flex flex-col gap-4">
      <section className="jp-card flex flex-col gap-1">
        <h2 className="jp-section-title mb-1">
          <Icon name="palette" size={12} />
          Внешний вид
        </h2>
        <Row label="Тема">
          <select
            className="jp-input w-auto py-1"
            value={settings.theme}
            onChange={(event) => void updateSettings({ theme: event.target.value as 'system' })}
          >
            <option value="system">Как в системе</option>
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </select>
        </Row>
        <Row label="Язык ответов AI" hint="На нём пишутся письма и ответы на вопросы.">
          <select
            className="jp-input w-auto py-1"
            value={settings.generationLanguage}
            onChange={(event) => void updateSettings({ generationLanguage: event.target.value })}
          >
            {knownLanguage ? null : (
              <option value={settings.generationLanguage}>{settings.generationLanguage}</option>
            )}
            {GENERATION_LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
        </Row>
      </section>

      <section className="jp-card flex flex-col gap-1">
        <h2 className="jp-section-title mb-1">
          <Icon name="sparkles" size={12} />
          AI-провайдер
        </h2>
        <Row label="Режим" hint="Локальный использует ваш ключ, облачный — ваш собственный шлюз.">
          <select
            className="jp-input w-auto py-1"
            value={settings.aiMode}
            onChange={(event) => void updateSettings({ aiMode: event.target.value as 'local' })}
          >
            <option value="local">Локальный (ваш API-ключ)</option>
            <option value="cloud">Облачный шлюз</option>
          </select>
        </Row>
        {settings.aiMode === 'local' ? (
          <Row label="Провайдер">
            <select
              className="jp-input w-auto py-1"
              value={settings.activeProvider}
              onChange={(event) =>
                void updateSettings({ activeProvider: event.target.value as AIProviderId })
              }
            >
              {AI_PROVIDER_IDS.filter((id) => id !== 'cloud').map((id) => {
                const entry = getProvider(id);
                const count = keys.filter((key) => key.providerId === id).length;
                return (
                  <option key={id} value={id}>
                    {entry.label}
                    {entry.freeTier ? ' · бесплатный тариф' : ''}
                    {count > 1 ? ` ✓ ${count}` : count === 1 ? ' ✓' : ''}
                  </option>
                );
              })}
            </select>
          </Row>
        ) : (
          <Row label="Адрес шлюза">
            <input
              className="jp-input w-52 py-1"
              placeholder="https://your-gateway.example"
              value={settings.cloudEndpoint}
              onChange={(event) => void updateSettings({ cloudEndpoint: event.target.value })}
            />
          </Row>
        )}
        <div className="border-b border-border py-2">
          <p className="text-[12px] font-medium">Ключи «{provider.label}»</p>
          {provider.note ? (
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{provider.note}</p>
          ) : null}
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Ключей может быть несколько — запросы идут через выбранный. Хранятся только в памяти
            расширения: не уходят на сайты вакансий и не попадают в экспорт.
          </p>
          {provider.apiKeyUrl ? (
            <a
              href={provider.apiKeyUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-brand transition-opacity hover:opacity-80"
            >
              <Icon name="key" size={12} />
              Получить ключ — {provider.label}
              <Icon name="external" size={11} className="opacity-70" />
            </a>
          ) : null}
          {providerKeys.length > 0 ? (
            <ul className="mt-1.5 flex flex-col gap-1">
              {providerKeys.map((key) => (
                <li key={key.id} className="flex items-center gap-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      type="radio"
                      name="jp-active-key"
                      checked={key.active}
                      onChange={() => switchKey(key.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px]">{key.label}</span>
                    <span className="flex-shrink-0 font-mono text-[11px] text-muted">
                      {key.masked}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="jp-button-ghost jp-button-sm"
                    onClick={() => removeKey(key)}
                    title="Удалить ключ"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[11px] text-muted">Ключей пока нет.</p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            <input
              className="jp-input w-28 py-1"
              placeholder="Название"
              value={keyLabelDraft}
              onChange={(event) => setKeyLabelDraft(event.target.value)}
            />
            <input
              className="jp-input w-40 flex-1 py-1"
              type="password"
              autoComplete="off"
              placeholder="Вставьте ключ"
              value={keyDraft}
              onChange={(event) => setKeyDraft(event.target.value)}
            />
            <button
              type="button"
              className="jp-button"
              onClick={saveKey}
              disabled={!keyDraft.trim()}
            >
              Добавить
            </button>
          </div>
        </div>
        <Row label="Хранение ключа" hint="В режиме сессии ключ стирается при закрытии Chrome.">
          <select
            className="jp-input w-auto py-1"
            value={keyMode}
            onChange={(event) =>
              void setKeyStorageMode(event.target.value as KeyStorageMode).then(() =>
                setKeyMode(event.target.value as KeyStorageMode),
              )
            }
          >
            <option value="local">Постоянно</option>
            <option value="session">Только на сессию</option>
          </select>
        </Row>
        <Row
          label="Модель"
          hint={provider.suggestedModels.join(', ') || 'Укажите идентификатор модели.'}
        >
          <input
            className="jp-input w-44 py-1"
            list={modelListId}
            value={providerConfig.model}
            placeholder={provider.suggestedModels[0] ?? 'model-id'}
            onChange={(event) => patchProvider({ model: event.target.value })}
          />
        </Row>
        {/*
          Только модели выбранного провайдера: чужие идентификаторы он всё
          равно не примет, а вместе они превращали список в свалку из сорока
          строк. id меняется вместе с провайдером — иначе Chrome оставляет в
          подсказках прежний набор.
        */}
        <datalist id={modelListId}>
          {provider.suggestedModels.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
        <Row label="Базовый URL" hint="Переопределение для прокси или собственного сервера.">
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
        <Row label="Максимум токенов">
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
        <Row label="Таймаут (с)">
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
          Проверить подключение
        </button>
      </section>

      <section className="jp-card flex flex-col gap-1">
        <h2 className="jp-section-title mb-1">
          <Icon name="bolt" size={12} />
          Автоматизация
        </h2>
        {(
          [
            [
              'autoAnalyzeJobs',
              'Анализировать автоматически',
              'Анализировать вакансии во время массового прохода.',
            ],
            [
              'autoOpenJobs',
              'Открывать вакансии автоматически',
              'Открывать вакансии из списка в фоновых вкладках.',
            ],
            [
              'autoFillForms',
              'Заполнять формы автоматически',
              'Заполнять поля с высокой уверенностью без вопросов.',
            ],
            [
              'autoGenerateCoverLetter',
              'Генерировать письмо автоматически',
              'Готовить письмо сразу при создании заявки.',
            ],
            [
              'requireConfirmationBeforeFill',
              'Подтверждать перед заполнением',
              'Показывать каждое поле до того, как оно будет записано.',
            ],
          ] as const
        ).map(([key, label, hint]) => (
          <Row key={key} label={label} hint={hint}>
            <input
              type="checkbox"
              className="jp-switch"
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
          label="Подтверждение перед отправкой"
          hint="Всегда включено. JobPilot никогда не отправляет заявку сам."
        >
          <input
            type="checkbox"
            className="jp-switch"
            checked
            readOnly
            disabled
            aria-label="Всегда обязательно"
          />
        </Row>
        <Row
          label="Вести журнал откликов"
          hint="Замечать, что вы отправили отклик на сайте, и записывать его в историю. Работает только на сайтах с выданным доступом."
        >
          <input
            type="checkbox"
            className="jp-switch"
            checked={settings.automation.trackSubmissions}
            onChange={(event) => void toggleTracking('trackSubmissions', event.target.checked)}
          />
        </Row>
        <Row
          label="Сам отмечать заявку отправленной"
          hint="Заметив отправку на сайте, переводить заявку в «Отправлена». Отметку видно как автоматическую, её можно откатить."
        >
          <input
            type="checkbox"
            className="jp-switch"
            checked={settings.automation.autoMarkSubmitted}
            disabled={!settings.automation.trackSubmissions}
            onChange={(event) =>
              void updateSettings({
                automation: { ...settings.automation, autoMarkSubmitted: event.target.checked },
              })
            }
          />
        </Row>
        <Row
          label="Метки прямо на сайте"
          hint="Показывать на страницах вакансий, куда вы уже откликались и какой у вакансии балл."
        >
          <input
            type="checkbox"
            className="jp-switch"
            checked={settings.automation.showPageBadges}
            onChange={(event) => void toggleTracking('showPageBadges', event.target.checked)}
          />
        </Row>
        <Row label="Максимум вакансий за проход">
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
        <Row label="Параллельных вкладок" hint="1–3. Больше — риск блокировки за частые запросы.">
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
        <Row label="Пауза между вакансиями (мс)">
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

      <ScoringWeights />

      <section className="jp-card flex flex-col gap-1">
        <h2 className="jp-section-title mb-1">
          <Icon name="bell" size={12} />
          Уведомления
        </h2>
        <Row label="Включены">
          <input
            type="checkbox"
            className="jp-switch"
            checked={settings.notifications.enabled}
            onChange={(event) =>
              void updateSettings({
                notifications: { ...settings.notifications, enabled: event.target.checked },
              })
            }
          />
        </Row>
        <Row label="Порог балла для уведомления">
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

      <section className="jp-card flex flex-col gap-1">
        <h2 className="jp-section-title mb-1">
          <Icon name="lock" size={12} />
          Приватность
        </h2>
        <Row
          label="Разрешить запросы к AI"
          hint="По умолчанию выключено. Без AI всё продолжает работать детерминированно."
        >
          <input
            type="checkbox"
            className="jp-switch"
            checked={settings.privacy.allowAIRequests}
            onChange={(event) =>
              void updateSettings({
                privacy: { ...settings.privacy, allowAIRequests: event.target.checked },
              })
            }
          />
        </Row>
        <Row
          label="Передавать опыт работы в AI"
          hint="Нужно, чтобы письма опирались на реальные факты."
        >
          <input
            type="checkbox"
            className="jp-switch"
            checked={settings.privacy.shareExperienceWithAI}
            onChange={(event) =>
              void updateSettings({
                privacy: { ...settings.privacy, shareExperienceWithAI: event.target.checked },
              })
            }
          />
        </Row>
        <Row
          label="Передавать контакты в AI"
          hint="Никогда. Имя, почта и телефон остаются локально."
        >
          <input type="checkbox" className="jp-switch" checked={false} readOnly disabled />
        </Row>
        <Row label="Хранить обоснования AI" hint="Сохраняет объяснения в локальной базе.">
          <input
            type="checkbox"
            className="jp-switch"
            checked={settings.privacy.storeAIResponses}
            onChange={(event) =>
              void updateSettings({
                privacy: { ...settings.privacy, storeAIResponses: event.target.checked },
              })
            }
          />
        </Row>
      </section>

      <section className="jp-card flex flex-col gap-1">
        <h2 className="jp-section-title mb-1">
          <Icon name="wallet" size={12} />
          Контроль расходов
        </h2>
        <Row
          label="Максимум символов описания"
          hint="Более длинные описания обрезаются перед отправкой."
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
          label="Кешировать анализы"
          hint="Не анализировать одну вакансию дважды для одного профиля."
        >
          <input
            type="checkbox"
            className="jp-switch"
            checked={settings.costControl.cacheAnalyses}
            onChange={(event) =>
              void updateSettings({
                costControl: { ...settings.costControl, cacheAnalyses: event.target.checked },
              })
            }
          />
        </Row>
        <Row label="Дневной лимит запросов" hint="0 — без ограничения.">
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
        <Row label="Цена за 1К входных токенов (USD)">
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
        <Row label="Цена за 1К выходных токенов (USD)">
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
            За 30 дней: запросов к AI — {usage.requests} · примерно ${usage.cost.toFixed(4)}
          </p>
        ) : null}
      </section>

      <section className="jp-card flex flex-col gap-2">
        <h2 className="jp-section-title mb-1">
          <Icon name="eraser" size={12} />
          Скрытые компании
        </h2>
        <p className="text-[11px] leading-relaxed text-muted">
          Их вакансии не попадают ни в список, ни в счётчики обзора. Название сверяется без правовых
          форм, поэтому «Acme» скроет и «Acme Inc.». Сами записи остаются в базе — уберите компанию
          отсюда, и они вернутся.
        </p>
        {settings.hiddenCompanies.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {settings.hiddenCompanies.map((company) => (
              <li key={company} className="jp-badge gap-1.5">
                {company}
                <button
                  type="button"
                  aria-label={`Показывать вакансии ${company}`}
                  className="rounded-full text-muted transition hover:text-poor"
                  onClick={() =>
                    void updateSettings({
                      hiddenCompanies: showCompany(settings.hiddenCompanies, company),
                    })
                  }
                >
                  <Icon name="x" size={11} strokeWidth={2.4} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-muted">Список пуст — показываются все компании.</p>
        )}
        <div className="flex gap-1.5">
          <input
            className="jp-input"
            placeholder="Название компании"
            aria-label="Компания, которую не показывать"
            value={companyDraft}
            onChange={(event) => setCompanyDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              hideCompany();
            }}
          />
          <button
            type="button"
            className="jp-button flex-shrink-0"
            onClick={hideCompany}
            disabled={!companyDraft.trim()}
          >
            <Icon name="plus" size={13} />
            Скрыть
          </button>
        </div>
      </section>

      <section id="sites" className="jp-card flex flex-col gap-2">
        <h2 className="jp-section-title mb-1">
          <Icon name="link" size={12} />
          Сайты с вакансиями
        </h2>
        <SiteAccess />
      </section>

      <section className="jp-card flex flex-col gap-1">
        <h2 className="jp-section-title mb-1">
          <Icon name="shield" size={12} />
          Разрешения
        </h2>
        <ul className="flex flex-col gap-1.5">
          {PERMISSION_EXPLANATIONS.map((permission) => (
            <li key={permission.id} className="text-[11px] leading-snug">
              <span className="font-medium">{permission.title}</span>
              <span className="text-muted"> — {permission.why}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="jp-card flex flex-col gap-2">
        <h2 className="jp-section-title mb-1">
          <Icon name="database" size={12} />
          Ваши данные
        </h2>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="jp-button" onClick={exportData}>
            <Icon name="download" size={13} />
            Экспорт в JSON
          </button>
          <label className="jp-button cursor-pointer">
            <Icon name="upload" size={13} />
            Импорт из JSON
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
            className="jp-button-danger"
            onClick={() => {
              const confirmed = window.confirm(
                'Удалить все вакансии, анализы, заявки, настройки и API-ключи, сохранённые JobPilot? Отменить это будет нельзя.',
              );
              if (!confirmed) return;
              void withBusy('Удаляем данные', async () => {
                await clearAllData();
                await clearApiKeys();
                await refreshData();
                pushToast({ level: 'success', message: 'Все локальные данные удалены.' });
                window.location.reload();
              });
            }}
          >
            <Icon name="trash" size={13} />
            Удалить все данные
          </button>
        </div>
        <p className="text-[11px] leading-snug text-muted">
          В экспорт попадают профиль, вакансии, анализы и заявки — API-ключи туда не входят.
        </p>
      </section>
    </div>
  );
}
