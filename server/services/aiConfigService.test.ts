import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiConfigService } from './aiConfigService';

function createMockPrisma(initial: any = null) {
  let record = initial;
  return {
    aiProviderConfig: {
      findUnique: async () => record,
      upsert: async ({ create, update }: any) => {
        record = record ? { ...record, ...update, updatedAt: new Date() } : { ...create, createdAt: new Date(), updatedAt: new Date() };
        return record;
      },
    },
    readRecord: () => record,
  };
}

test('AI config defaults to DeepSeek without exposing an API key', async () => {
  const prisma = createMockPrisma();
  const service = createAiConfigService(prisma as any);

  const result = await service.getPublicConfig();

  assert.equal(result.code, 0);
  assert.equal(result.data?.provider, 'deepseek');
  assert.equal(result.data?.baseUrl, 'https://api.deepseek.com');
  assert.equal(result.data?.model, 'deepseek-chat');
  assert.equal(result.data?.hasApiKey, false);
  assert.equal('apiKey' in (result.data as any), false);
});

test('AI config save masks the key and keeps it when the next update leaves apiKey blank', async () => {
  const prisma = createMockPrisma();
  const service = createAiConfigService(prisma as any);

  const saved = await service.saveConfig({
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    apiKey: 'sk-1234567890abcdef',
    enabled: true,
  });
  const savedData = saved.data as any;
  assert.equal(savedData.hasApiKey, true);
  assert.equal(savedData.apiKeyPreview, 'sk-...cdef');
  assert.equal('apiKey' in savedData, false);

  await service.saveConfig({
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-reasoner',
    apiKey: '',
    enabled: true,
  });

  assert.equal(prisma.readRecord()?.apiKey, 'sk-1234567890abcdef');
  assert.equal(prisma.readRecord()?.model, 'deepseek-reasoner');
});

test('AI config rejects non-DeepSeek and non-HTTPS base URLs before retaining or sending the key', async () => {
  for (const baseUrl of [
    'http://api.deepseek.com',
    'https://example.com/deepseek',
    'https://127.0.0.1:8443',
    'https://user:password@api.deepseek.com',
    'not-a-url',
  ]) {
    const prisma = createMockPrisma({
      id: 'default',
      provider: 'deepseek',
      apiKey: 'sk-existing-private-key',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      enabled: true,
    });
    const service = createAiConfigService(prisma as any);

    const result = await service.saveConfig({ baseUrl, apiKey: '' });

    assert.equal(result.code, 400, baseUrl);
    assert.equal(prisma.readRecord()?.baseUrl, 'https://api.deepseek.com');
  }
});

test('AI runtime config fails closed to the official endpoint when a legacy row contains an unsafe URL', async () => {
  const prisma = createMockPrisma({
    id: 'default',
    provider: 'deepseek',
    apiKey: 'sk-existing-private-key',
    baseUrl: 'https://attacker.example/collect',
    model: 'deepseek-chat',
    enabled: true,
  });
  const service = createAiConfigService(prisma as any);

  const runtime = await service.getRuntimeConfig();

  assert.equal(runtime.baseUrl, 'https://api.deepseek.com');
  assert.equal(runtime.apiKey, 'sk-existing-private-key');
});
