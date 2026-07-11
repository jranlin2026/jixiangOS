export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type RuntimeAiConfig = {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
};

type AiConfigReader = {
  getRuntimeConfig(): Promise<RuntimeAiConfig>;
};

export function createAiChatClient({
  configReader,
  fetchImpl = fetch,
}: {
  configReader: AiConfigReader;
  fetchImpl?: typeof fetch;
}) {
  return {
    async complete(messages: AiChatMessage[], options: { temperature?: number } = {}): Promise<string> {
      const config = await configReader.getRuntimeConfig();
      if (!config.enabled) throw new Error('DeepSeek AI is disabled');
      if (!config.apiKey) throw new Error('DeepSeek API Key is not configured');

      const baseUrl = config.baseUrl.replace(/\/+$/, '');
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: options.temperature ?? 0.2,
        }),
      });
      const payload = await response.json().catch(() => ({})) as any;
      if (!response.ok) {
        throw new Error(payload?.error?.message || `DeepSeek request failed with HTTP ${response.status}`);
      }
      return String(payload?.choices?.[0]?.message?.content || '');
    },
  };
}

export type AiChatClient = ReturnType<typeof createAiChatClient>;
