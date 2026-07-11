import assert from 'node:assert/strict';
import test from 'node:test';
import { createCoCreationService } from './coCreationService';

const actor = {
  id: 'user-1', name: '员工甲', account: 'u1', email: 'u1@example.com', phone: '', role: '员工',
  departmentId: 'dept-1', permissions: [{ module: 'AI共创中心/提交需求', actions: ['read', 'write'] }], isActive: true,
};

test('creates an employee-owned request with the opening AI question already visible', async () => {
  const records: any[] = [];
  const messages: any[] = [];
  const prisma = {
    coCreationRequest: {
      create: async ({ data }: any) => { const row = { ...data, createdAt: new Date(), updatedAt: new Date(), messages: [], brief: null, validation: null, events: [] }; records.push(row); return row; },
      findUnique: async ({ where }: any) => records.find((row) => row.id === where.id) || null,
      update: async ({ where, data }: any) => Object.assign(records.find((row) => row.id === where.id), data),
    },
    coCreationMessage: {
      create: async ({ data }: any) => { messages.push(data); return data; },
      findMany: async () => messages,
    },
    coCreationEvent: { create: async ({ data }: any) => data },
    coCreationBrief: { upsert: async ({ create }: any) => create },
  };
  const service = createCoCreationService({
    prisma: prisma as any,
    aiClient: { complete: async () => JSON.stringify({ reply: '这个问题最近一次发生在什么时候？', phase: 'ROLE_SCENARIO', completeness: 20, extractedFacts: [], hypotheses: [], briefReady: false }) } as any,
  });

  const created = await service.createRequest(actor as any, { title: '日报重复整理' });
  assert.equal(created.code, 0);
  assert.equal(created.data?.requesterId, actor.id);
  assert.equal(created.data?.status, 'INTERVIEWING');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, 'ASSISTANT');
  assert.match(messages[0].content, /真实工作场景/);

  const turn = await service.continueInterview(actor as any, created.data!.id, '我每天都要整理日报');
  assert.equal(turn.code, 0);
  assert.equal((turn.data as any)?.reply, '这个问题最近一次发生在什么时候？');
  assert.equal(messages.length, 3);
  assert.equal(messages.filter((message) => message.role === 'ASSISTANT').length, 2);
});

test('first management approval advances only into requirement validation', async () => {
  const row: any = { id: 'req-1', title: '日报', status: 'MANAGEMENT_REVIEW', requesterId: 'u', requesterName: 'u', events: [] };
  const prisma = {
    coCreationRequest: {
      findUnique: async () => row,
      update: async ({ data }: any) => Object.assign(row, data),
    },
    coCreationValidation: { upsert: async ({ create }: any) => create },
    coCreationEvent: { create: async ({ data }: any) => data },
  };
  const manager = { ...actor, id: 'manager', permissions: [{ module: 'AI共创中心/管理决策', actions: ['read', 'write'] }] };
  const service = createCoCreationService({ prisma: prisma as any, aiClient: {} as any });
  const result = await service.decideValidation(manager as any, 'req-1', { decision: 'APPROVE_VALIDATION', reason: '值得验证' });
  assert.equal(result.code, 0);
  assert.equal(row.status, 'VALIDATION_APPROVED');
  assert.doesNotMatch(result.message, /批准开发/);
});
