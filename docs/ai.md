# Слой AI

## Абстракция провайдера

```ts
interface AIProvider {
  id: AIProviderId;
  label: string;
  /** Куда отправить человека за ключом; пусто, если ключ не нужен. */
  apiKeyUrl: string;
  /** Есть постоянный бесплатный тариф, а не разовый кредит. */
  freeTier?: boolean;
  chat(request: ChatRequest, credentials: ProviderCredentials): Promise<ChatResponse>;
  analyzeJob(input, ctx): Promise<TaskResult<AIJobFindings>>;
  generateCoverLetter(input, ctx): Promise<TaskResult<CoverLetter>>;
  analyzeForm(input, ctx): Promise<TaskResult<AIFormAnalysis>>;
  generateApplicationAnswer(input, ctx): Promise<TaskResult<ApplicationAnswer>>;
  askAssistant(input, ctx): Promise<TaskResult<AssistantReply>>;
  analyzeResume(input, ctx): Promise<TaskResult<ResumeAnalysis>>;
}
```

`BaseAIProvider` (`src/providers/shared/base.ts`) реализует все задачи через
`chat()`, поэтому добавить провайдера — значит написать один HTTP-метод:

```ts
export class MyProvider extends BaseAIProvider {
  readonly id = 'custom';
  readonly label = 'Мой провайдер';
  readonly defaultBaseUrl = 'https://api.example.com/v1';
  readonly suggestedModels = ['my-model'];

  async chat(request, credentials) {
    const data = await postJson<MyResponse>({/* … */});
    return {
      text: data.output,
      promptTokens: null,
      completionTokens: null,
      model: credentials.model,
    };
  }
}
```

Дальше зарегистрируйте его в `src/providers/registry.ts` и добавьте id в
`AI_PROVIDER_IDS`.

## Подключённые провайдеры

| Провайдер       | Адрес                               | Доступ                                |
| --------------- | ----------------------------------- | ------------------------------------- |
| OpenAI          | `api.openai.com`                    | платный                               |
| Anthropic       | `api.anthropic.com`                 | платный                               |
| Google Gemini   | `generativelanguage.googleapis.com` | **бесплатный тариф**                  |
| xAI (Grok)      | `api.x.ai`                          | платный                               |
| Groq            | `api.groq.com`                      | **бесплатный тариф**, открытые модели |
| DeepSeek        | `api.deepseek.com`                  | платный, очень дёшево                 |
| Zhipu AI (GLM)  | `open.bigmodel.cn`                  | **glm-4-flash бесплатна**             |
| Moonshot (Kimi) | `api.moonshot.cn`                   | пробный баланс                        |
| Qwen (Alibaba)  | `dashscope-intl.aliyuncs.com`       | **бесплатная квота**                  |
| OpenRouter      | `openrouter.ai`                     | **есть модели «:free»**               |
| Custom          | задаёт пользователь                 | LM Studio, Ollama, vLLM               |
| Cloud           | свой шлюз                           | ключ хранится на шлюзе                |

Всё, кроме Anthropic, Gemini и облачного шлюза, говорит на диалекте OpenAI Chat
Completions, поэтому шесть провайдеров из `src/providers/compatible/` — это
адрес, список моделей и ссылка на консоль поверх `OpenAIProvider`. Списки
моделей там подсказка для поля ввода, а не ограничение: провайдеры их
регулярно меняют.

`Groq` и `xAI (Grok)` — разные сервисы с похожими названиями. Первый быстро
крутит чужие открытые модели и имеет бесплатный тариф, второй даёт собственные
модели Grok за деньги.

## Промпты

Промпты живут в `src/core/ai/prompts/` и никогда не внутри компонентов:

| Файл                   | Задача                                     |
| ---------------------- | ------------------------------------------ |
| `jobAnalysis.ts`       | структурированные выводы по одной вакансии |
| `coverLetter.ts`       | сопроводительное письмо на фактах профиля  |
| `formAnalysis.ts`      | классификация неизвестных полей формы      |
| `applicationAnswer.ts` | ответ на один вопрос анкеты                |
| `assistant.ts`         | чат ассистента по локальным данным         |
| `resumeAnalysis.ts`    | извлечение фактов из вставленного резюме   |

В каждый промпт подставляются `TRUTHFULNESS_RULES` и `JSON_RULES` из `shared.ts`
плюс блок со схемой. В промпте анализа вакансии дополнительно сказано, что модель
не должна выдавать процент совпадения.

Инструкции написаны по-русски, а **имена ключей и значения перечислений остаются
английскими**: их проверяют Zod-схемы из `src/types`, и перевод сломал бы
валидацию. Язык, на котором модель пишет текст для человека, задаётся в настройках
(`generationLanguage`) и подставляется в промпт отдельной строкой.

## Обработка ответа

1. `extractJsonObject()` находит первый сбалансированный `{...}`, переживая блоки
   кода и лишний текст (учитываются скобки внутри строк).
2. `parseAIJson()` вызывает `JSON.parse`, затем Zod-схему задачи.
3. Несовпадение со схемой поднимает `AI_INVALID_RESPONSE` с первыми ошибками и
   подсказкой. Там, где можно деградировать (анализ вакансии), приложение
   откатывается к детерминированному скорингу вместо падения.

Вывод модели никогда не выполняется, не вставляется как HTML и не используется
для построения селектора.

## Достоверность

- В письмах и ответах можно использовать только факты из проекции профиля.
- Всё, что модель не может подтвердить, возвращается в `unverifiedClaims` и
  `missingInformation` со статусом `needs_user_confirmation`, а экран проверки
  показывает это отдельным предупреждением.
- В скоринге `mergeSkillFindings()` отбрасывает «совпавший» навык, которого нет в
  профиле, поэтому чрезмерно услужливая модель не может завысить балл.

## Контроль расходов

- Сначала работает детерминированное извлечение; AI получает компактный JSON.
- `maxDescriptionChars` (по умолчанию 6000) обрезает описание перед отправкой.
- Анализы кешируются по `(fingerprint, profileVersion, analysisVersion)`.
- `dailyRequestLimit` проверяется перед каждым вызовом.
- Каждый вызов — успешный или нет — попадает в хранилище `aiUsage` с числом
  токенов и оценкой стоимости по ценам, которые задал пользователь.

## Локальный и облачный режимы

**LOCAL** хранит ваш ключ в `chrome.storage` (постоянно или только на сессию) и
обращается к провайдеру напрямую из service worker.

**CLOUD** шлёт `POST {endpoint}/v1/chat` на ваш шлюз:

```jsonc
// запрос
{ "model": "…", "messages": [...], "temperature": 0.2, "maxTokens": 2048, "json": true }
// ответ
{ "text": "{…}", "model": "…", "usage": { "promptTokens": 0, "completionTokens": 0 } }
```

В облачном режиме расширение не хранит ключей провайдера вовсе.
