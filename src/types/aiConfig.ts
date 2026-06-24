export type AiProvider = 'deepseek';

export interface AiProviderConfig {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  enabled: boolean;
  hasApiKey: boolean;
  apiKeyPreview: string;
  updatedAt?: string;
}

export interface AiProviderConfigInput {
  provider?: AiProvider;
  baseUrl?: string;
  model?: string;
  enabled?: boolean;
  apiKey?: string;
}

export interface AiConnectionTestResult {
  ok: boolean;
  response: string;
}
