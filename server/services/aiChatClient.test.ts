import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiChatClient } from './aiChatClient';

test('uses the saved DeepSeek runtime configuration without exposing the API key', async () => {
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  const client = createAiChatClient({
    configReader: {
      getRuntimeConfig: async () => ({
        provider: 'deepseek',
        apiKey: 'secret-key',
        baseUrl: 'https://deepseek.example/v1/',
        model: 'deepseek-reasoner',
        enabled: true,
      }),
    },
    fetchImpl: async (url, init) => {
      requestedUrl = String(url);
      requestedInit = init;
      return new Response(JSON.stringify({ choices: [{ message: { content: '下一问' } }] }), { status: 200 });
    },
  });

  const result = await client.complete([{ role: 'user', content: '我的工作很重复' }], { temperature: 0 });

  assert.equal(result, '下一问');
  assert.equal(requestedUrl, 'https://deepseek.example/v1/chat/completions');
  assert.equal(new Headers(requestedInit?.headers).get('Authorization'), 'Bearer secret-key');
  assert.match(String(requestedInit?.body), /deepseek-reasoner/);
  assert.doesNotMatch(result, /secret-key/);
});

test('fails clearly when DeepSeek is disabled or missing its API key', async () => {
  const disabled = createAiChatClient({
    configReader: {
      getRuntimeConfig: async () => ({
        provider: 'deepseek', apiKey: 'secret', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', enabled: false,
      }),
    },
  });
  await assert.rejects(() => disabled.complete([{ role: 'user', content: 'test' }]), /DeepSeek AI is disabled/);

  const missingKey = createAiChatClient({
    configReader: {
      getRuntimeConfig: async () => ({
        provider: 'deepseek', apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', enabled: true,
      }),
    },
  });
  await assert.rejects(() => missingKey.complete([{ role: 'user', content: 'test' }]), /DeepSeek API Key is not configured/);
});
