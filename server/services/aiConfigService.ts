import { failure, success } from '../api/response';

const CONFIG_ID = 'default';
const DEFAULT_PROVIDER = 'deepseek';
const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';

type AiProviderRow = {
  id: string;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

type AiConfigPrisma = {
  aiProviderConfig: {
    findUnique: (args: { where: { id: string } }) => Promise<AiProviderRow | null>;
    upsert: (args: {
      where: { id: string };
      update: Partial<Omit<AiProviderRow, 'id'>>;
      create: AiProviderRow;
    }) => Promise<AiProviderRow>;
  };
};

export type AiPublicConfig = {
  provider: 'deepseek';
  baseUrl: string;
  model: string;
  enabled: boolean;
  hasApiKey: boolean;
  apiKeyPreview: string;
  updatedAt?: string;
};

export type AiConfigInput = {
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  enabled?: boolean;
};

export type AiRuntimeConfig = AiPublicConfig & {
  apiKey: string;
};

function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  return trimmed || DEFAULT_BASE_URL;
}

function normalizeModel(value: string | undefined): string {
  return String(value || '').trim() || DEFAULT_MODEL;
}

function maskApiKey(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return `...${value.slice(-4)}`;
  return `${value.slice(0, 3)}...${value.slice(-4)}`;
}

function toPublicConfig(row: AiProviderRow | null, envApiKey = ''): AiPublicConfig {
  const apiKey = row?.apiKey || envApiKey;
  return {
    provider: 'deepseek',
    baseUrl: normalizeBaseUrl(row?.baseUrl),
    model: normalizeModel(row?.model),
    enabled: row?.enabled ?? true,
    hasApiKey: Boolean(apiKey),
    apiKeyPreview: maskApiKey(apiKey),
    updatedAt: row?.updatedAt?.toISOString?.(),
  };
}

export function createAiConfigService(prisma: AiConfigPrisma) {
  const readRow = () => prisma.aiProviderConfig.findUnique({ where: { id: CONFIG_ID } });

  return {
    async getPublicConfig() {
      const row = await readRow();
      return success(toPublicConfig(row, process.env.DEEPSEEK_API_KEY || ''));
    },

    async getRuntimeConfig(): Promise<AiRuntimeConfig> {
      const row = await readRow();
      const envApiKey = process.env.DEEPSEEK_API_KEY || '';
      const publicConfig = toPublicConfig(row, envApiKey);
      return {
        ...publicConfig,
        apiKey: row?.apiKey || envApiKey,
      };
    },

    async saveConfig(input: AiConfigInput) {
      const provider = String(input.provider || DEFAULT_PROVIDER).trim().toLowerCase();
      if (provider !== DEFAULT_PROVIDER) return failure('only DeepSeek is supported now', 400);

      const existing = await readRow();
      const nextApiKey = typeof input.apiKey === 'string' && input.apiKey.trim()
        ? input.apiKey.trim()
        : existing?.apiKey || '';
      const payload = {
        provider: DEFAULT_PROVIDER,
        apiKey: nextApiKey,
        baseUrl: normalizeBaseUrl(input.baseUrl),
        model: normalizeModel(input.model),
        enabled: input.enabled ?? existing?.enabled ?? true,
      };

      const row = await prisma.aiProviderConfig.upsert({
        where: { id: CONFIG_ID },
        update: payload,
        create: {
          id: CONFIG_ID,
          ...payload,
        },
      });

      return success(toPublicConfig(row));
    },
  };
}
