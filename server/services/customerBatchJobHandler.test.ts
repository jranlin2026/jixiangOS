import assert from 'node:assert/strict';
import {
  CustomerBatchJobHandlerRegistry,
  buildCustomerMutationCommand,
  createCustomerMutationBatchJobHandler,
} from './customerBatchJobHandler';
import { sha256Json } from './customerBatchPrecheckService';

const at = new Date('2026-07-18T08:00:00.000Z');

assert.throws(
  () => new CustomerBatchJobHandlerRegistry([{ handlerKey: 'bad', executionKind: 'itemized' } as any]),
  /processItem/,
  'itemized handler without processItem must fail closed',
);
assert.throws(
  () => new CustomerBatchJobHandlerRegistry([{ handlerKey: 'bad', executionKind: 'aggregate' } as any]),
  /processAggregate/,
  'aggregate handler without processAggregate must fail closed',
);

const commandCases = [
  ['transfer', { targetOwnerId: 'u-2' }, { action: 'transfer', customerId: 'c-1', targetOwnerId: 'u-2', reason: '团队调整' }],
  ['release_to_pool', {}, { action: 'release_to_pool', customerId: 'c-1', reason: '不再跟进' }],
  ['set_progress', { lifecycleStatusCode: 'following' }, { action: 'set_progress', customerId: 'c-1', lifecycleStatusCode: 'following', reason: '更新进展' }],
  ['update_tags', { mode: 'add', tagIds: ['t-2', 't-1'] }, { action: 'update_tags', customerId: 'c-1', mode: 'add', tagIds: ['t-1', 't-2'], reason: '批量打标' }],
  ['add_todo', { title: '联系客户', content: '确认需求', dueAt: at.toISOString(), executionMethod: 'wechat' }, { action: 'add_todo', customerId: 'c-1', title: '联系客户', content: '确认需求', dueAt: at.toISOString(), executionMethod: 'wechat', reason: '统一跟进' }],
  ['soft_delete', { confirmed: true }, { action: 'soft_delete', customerId: 'c-1', confirmed: true, reason: '重复客户' }],
] as const;

for (const [operation, input, expected] of commandCases) {
  assert.deepEqual(buildCustomerMutationCommand({ operation, input, reason: expected.reason }, 'customer:c-1'), expected);
}
assert.throws(
  () => buildCustomerMutationCommand({ operation: 'transfer', input: {}, reason: '团队调整' }, 'customer:c-1'),
  /批量任务参数已损坏/,
);
assert.throws(
  () => buildCustomerMutationCommand({ operation: 'transfer', input: { targetOwnerId: 'u-2' }, reason: '团队调整' }, 'lead:c-1'),
  /批量任务目标无效/,
);

let captured: any;
let atomicCalls = 0;
const handler = createCustomerMutationBatchJobHandler({
  atomicService: {
    execute: async (command, context) => {
      atomicCalls += 1;
      captured = { command, context };
      return {
        operationId: 'audit-1',
        customer: { id: 'c-1', name: 'after' },
        beforeSnapshot: { id: 'c-1', name: 'before' },
        afterSnapshot: { id: 'c-1', name: 'after' },
        cancelledTodoCount: 0,
        reassignedTodoCount: 0,
      } as any;
    },
  },
});
const registry = new CustomerBatchJobHandlerRegistry([handler]);
assert.equal(registry.get('customer_mutation'), handler);
assert.throws(() => registry.get('missing'), /未注册/);

const lease = {
  jobId: 'job-1', workerId: 'worker-a', leaseEpoch: 1,
  assertActive: async () => undefined,
  heartbeat: async () => undefined,
  cancellationRequested: async () => false,
};
const result = await handler.processItem!({
  tx: { marker: 'same-tx' } as any,
  job: {
    id: 'job-1', actorId: 'u-1', actorName: '员工甲', handlerKey: 'customer_mutation',
    operation: 'transfer', input: JSON.stringify({ targetOwnerId: 'u-2' }), reason: '团队调整',
    inputHash: sha256Json({ input: { targetOwnerId: 'u-2' }, reason: '团队调整' }),
  },
  item: {
    id: 'item-1', jobId: 'job-1', targetKey: 'customer:c-1', idempotencyKey: 'job-1:customer:c-1',
    expectedUpdatedAt: at,
  },
  executionContext: {
    access: { actorId: 'u-1' } as any,
    actor: { id: 'u-1', name: '员工甲' },
    roles: [],
  },
}, lease);

assert.deepEqual(captured.command, { action: 'transfer', customerId: 'c-1', targetOwnerId: 'u-2', reason: '团队调整' });
assert.equal(captured.context.tx.marker, 'same-tx');
assert.equal(captured.context.expectedUpdatedAt, at.toISOString());
assert.equal(captured.context.idempotencyKey, 'job-1:customer:c-1');
assert.equal(captured.context.batchJobId, 'job-1');
assert.equal(result.beforeSnapshot?.name, 'before');
assert.equal(result.afterSnapshot?.name, 'after');
assert.match(result.beforeHash || '', /^[a-f0-9]{64}$/);
assert.match(result.afterHash || '', /^[a-f0-9]{64}$/);
assert.notEqual(result.beforeHash, result.afterHash);

await assert.rejects(
  () => handler.processItem!({
    tx: {} as any,
    job: {
      id: 'job-tampered', actorId: 'u-1', actorName: '员工甲', handlerKey: 'customer_mutation',
      operation: 'transfer', input: { targetOwnerId: 'u-9' }, reason: '团队调整',
      inputHash: sha256Json({ input: { targetOwnerId: 'u-2' }, reason: '团队调整' }),
    },
    item: {
      id: 'item-tampered', jobId: 'job-tampered', targetKey: 'customer:c-1',
      idempotencyKey: 'job-tampered:customer:c-1', expectedUpdatedAt: at,
    },
    executionContext: { access: { actorId: 'u-1' } as any, actor: { id: 'u-1', name: '员工甲' }, roles: [] },
  }, lease),
  /批量任务参数已损坏/,
);
assert.equal(atomicCalls, 1, 'tampered persisted command must fail before the atomic customer mutation');

console.log('customer batch job handler tests passed');
