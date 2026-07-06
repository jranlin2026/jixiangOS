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
