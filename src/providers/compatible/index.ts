import type { AIProviderId } from '@/types/ai';
import { OpenAIProvider } from '../openai';

/**
 * Провайдеры, говорящие на диалекте OpenAI Chat Completions. От оригинала их
 * отличают только адрес, список моделей и имя поля с лимитом токенов, поэтому
 * каждому хватает нескольких строк — весь обмен уже описан в `OpenAIProvider`.
 *
 * Списки моделей — подсказка для поля ввода, а не ограничение: идентификатор
 * можно вписать любой, и провайдеры их регулярно обновляют. Актуальный
 * перечень всегда на странице, куда ведёт `apiKeyUrl`.
 */
abstract class OpenAICompatibleProvider extends OpenAIProvider {
  /** Переименованного поля здесь никто не знает — только `max_tokens`. */
  protected override readonly tokenLimitField = 'max_tokens';
}

/** xAI — модели Grok. Ключ заводится в консоли, тариф платный. */
export class XAIProvider extends OpenAICompatibleProvider {
  override readonly id: AIProviderId = 'xai';
  override readonly label = 'xAI (Grok)';
  override readonly defaultBaseUrl = 'https://api.x.ai/v1';
  override readonly suggestedModels = ['grok-4', 'grok-3', 'grok-3-mini'];
  override readonly apiKeyUrl = 'https://console.x.ai/';
  override readonly note = 'Модели Grok. Тариф платный, иногда дают стартовый кредит.';
}

/**
 * Groq — не путать с Grok. Это не своя модель, а очень быстрый хостинг чужих
 * открытых моделей с бесплатным тарифом по лимиту запросов в минуту.
 */
export class GroqProvider extends OpenAICompatibleProvider {
  override readonly id: AIProviderId = 'groq';
  override readonly label = 'Groq';
  override readonly defaultBaseUrl = 'https://api.groq.com/openai/v1';
  override readonly suggestedModels = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'openai/gpt-oss-120b',
  ];
  override readonly apiKeyUrl = 'https://console.groq.com/keys';
  override readonly freeTier = true;
  override readonly note =
    'Бесплатно с ограничением запросов в минуту. Открытые модели, очень быстро.';
}

/** DeepSeek — дешёвые китайские модели, оплата по факту. */
export class DeepSeekProvider extends OpenAICompatibleProvider {
  override readonly id: AIProviderId = 'deepseek';
  override readonly label = 'DeepSeek';
  override readonly defaultBaseUrl = 'https://api.deepseek.com/v1';
  override readonly suggestedModels = ['deepseek-chat', 'deepseek-reasoner'];
  override readonly apiKeyUrl = 'https://platform.deepseek.com/api_keys';
  override readonly note =
    'Одни из самых дешёвых моделей. Бесплатного тарифа нет, но цена копеечная.';
}

/** Zhipu AI (GLM). Модель glm-4-flash отдаётся бесплатно. */
export class ZhipuProvider extends OpenAICompatibleProvider {
  override readonly id: AIProviderId = 'zhipu';
  override readonly label = 'Zhipu AI (GLM)';
  override readonly defaultBaseUrl = 'https://open.bigmodel.cn/api/paas/v4';
  override readonly suggestedModels = ['glm-4-flash', 'glm-4-air', 'glm-4-plus'];
  override readonly apiKeyUrl = 'https://bigmodel.cn/usercenter/apikeys';
  override readonly freeTier = true;
  override readonly note = 'glm-4-flash бесплатна. Вне Китая может понадобиться адрес z.ai.';
}

/** Moonshot AI (Kimi). При регистрации дают пробный баланс. */
export class MoonshotProvider extends OpenAICompatibleProvider {
  override readonly id: AIProviderId = 'moonshot';
  override readonly label = 'Moonshot (Kimi)';
  override readonly defaultBaseUrl = 'https://api.moonshot.cn/v1';
  override readonly suggestedModels = ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'];
  override readonly apiKeyUrl = 'https://platform.moonshot.cn/console/api-keys';
  override readonly note = 'Пробный баланс при регистрации. Международный адрес — api.moonshot.ai.';
}

/** Alibaba Qwen через DashScope в режиме совместимости с OpenAI. */
export class QwenProvider extends OpenAICompatibleProvider {
  override readonly id: AIProviderId = 'qwen';
  override readonly label = 'Qwen (Alibaba)';
  override readonly defaultBaseUrl = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
  override readonly suggestedModels = ['qwen-turbo', 'qwen-plus', 'qwen-max'];
  override readonly apiKeyUrl = 'https://bailian.console.alibabacloud.com/';
  override readonly freeTier = true;
  override readonly note = 'Бесплатная квота токенов на каждую модель. Здесь международный адрес.';
}

export const xaiProvider = new XAIProvider();
export const groqProvider = new GroqProvider();
export const deepseekProvider = new DeepSeekProvider();
export const zhipuProvider = new ZhipuProvider();
export const moonshotProvider = new MoonshotProvider();
export const qwenProvider = new QwenProvider();
