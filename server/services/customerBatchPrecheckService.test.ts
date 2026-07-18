import assert from 'node:assert/strict';
import {
  consumeBatchPrecheckToken,
  issueBatchPrecheckToken,
  sha256Json,
} from './customerBatchPrecheckService';

const first = sha256Json({ b: 2, a: 1 });
const second = sha256Json({ a: 1, b: 2 });
assert.equal(first, second, '对象键顺序不得影响预检指纹');
assert.notEqual(sha256Json(['a', 'b']), sha256Json(['b', 'a']), '数组顺序必须保留');
assert.match(first, /^[a-f0-9]{64}$/, '预检指纹必须是小写 64 位 SHA-256');

const now = new Date('2026-07-18T00:00:00.000Z');
const prechecks: any[] = [];
const results: any[] = [];
const commandInputHash = sha256Json({ input: { targetOwnerId: 'u-2' }, reason: '团队调整' });
const store: any = {
  transaction: async (operation: (tx: typeof store) => Promise<unknown>) => operation(store),
  create: async (row: any) => { prechecks.push(structuredClone(row)); },
  lockByToken: async (_tx: unknown, tokenHash: string) => prechecks.find((row) => row.tokenHash === tokenHash) || null,
  update: async (_tx: unknown, id: string, patch: any) => {
    const row = prechecks.find((item) => item.id === id);
    Object.assign(row, structuredClone(patch));
  },
};

const issued = await issueBatchPrecheckToken({
  store,
  actorId: 'actor-a',
  handlerKey: 'customer_mutation',
  operation: 'transfer',
  selectionHash: sha256Json(['c-1']),
  inputHash: commandInputHash,
  selectedCustomerIds: ['c-1'],
  customerVersionManifest: { 'c-1': now.toISOString() },
  guardManifest: {
    version: 1,
    command: { selectionMode: 'ids', input: { targetOwnerId: 'u-2' }, reason: '团队调整' },
  },
  canonicalInput: { input: { targetOwnerId: 'u-2' }, reason: '团队调整' },
  now: () => now,
  createId: () => 'precheck-1',
  createToken: () => 'confirmation-token',
});

const consumer = {
  resultType: 'customer_batch_job' as const,
  loadResult: async (_tx: unknown, resultId: string) => results.find((result) => result.id === resultId) || null,
  findExistingResult: async (_tx: unknown, input: any) => results.find((result) => (
    result.actorId === input.actorId && result.idempotencyKey === input.idempotencyKey
  )) || null,
  lockAndRevalidate: async () => undefined,
  createResult: async (_tx: unknown, _precheck: any, input: any) => {
    const result = {
      type: 'customer_batch_job' as const,
      id: 'job-1',
      idempotencyFingerprint: input.idempotencyFingerprint,
      actorId: 'actor-a',
      idempotencyKey: input.idempotencyKey,
      value: { id: 'job-1' },
    };
    results.push(result);
    return result;
  },
};

const consumption = {
  store,
  token: issued.confirmationToken,
  actorId: 'actor-a',
  handlerKey: 'customer_mutation',
  operation: 'transfer',
  selectionHash: sha256Json(['c-1']),
  inputHash: commandInputHash,
  idempotencyKey: 'click-1',
  now: () => now,
};
const created = await consumeBatchPrecheckToken(consumption, consumer);
assert.deepEqual(created, { id: 'job-1' });
assert.deepEqual(await consumeBatchPrecheckToken(consumption, consumer), { id: 'job-1' }, '同一确认键重放必须返回同一已提交结果');
await assert.rejects(
  () => consumeBatchPrecheckToken({ ...consumption, idempotencyKey: 'click-2' }, consumer),
  /预检确认已使用/,
);

function createHarness() {
  const rows: any[] = [];
  const results: any[] = [];
  let transactionCount = 0;
  let sequence = 0;
  const store: any = {
    transaction: async (operation: (tx: { transaction: number }) => Promise<unknown>) => {
      transactionCount += 1;
      return operation({ transaction: transactionCount });
    },
    create: async (row: any) => { rows.push(structuredClone(row)); },
    lockByToken: async (_tx: unknown, tokenHash: string) => rows.find((row) => row.tokenHash === tokenHash) || null,
    update: async (_tx: unknown, id: string, patch: any) => Object.assign(rows.find((row) => row.id === id), structuredClone(patch)),
  };
  const makeIssue = async (overrides: Record<string, unknown> = {}) => {
    const ids = (overrides.ids as string[] | undefined) || ['c-1'];
    const input = (overrides.input as Record<string, unknown> | undefined) || { targetOwnerId: 'u-2' };
    const reason = (overrides.reason as string | undefined) || '团队调整';
    const current = (overrides.now as Date | undefined) || now;
    sequence += 1;
    return issueBatchPrecheckToken({
      store,
      actorId: String(overrides.actorId || 'actor-a'),
      handlerKey: String(overrides.handlerKey || 'customer_mutation'),
      operation: String(overrides.operation || 'transfer'),
      selectionHash: sha256Json([...ids].sort()),
      inputHash: sha256Json({ input, reason }),
      selectedCustomerIds: ids,
      customerVersionManifest: Object.fromEntries(ids.map((id) => [id, now.toISOString()])),
      guardManifest: { version: 1, command: { selectionMode: 'ids', input, reason } },
      canonicalInput: { input, reason },
      now: () => current,
      createId: () => `precheck-h-${sequence}`,
      createToken: () => `confirmation-h-${sequence}`,
    });
  };
  const consumer = {
    resultType: 'customer_batch_job' as const,
    loadResult: async (_tx: unknown, resultId: string) => results.find((result) => result.id === resultId) || null,
    findExistingResult: async (_tx: unknown, input: any) => results.find((result) => (
      result.actorId === input.actorId && result.handlerKey === input.handlerKey
      && result.operation === input.operation && result.idempotencyKey === input.idempotencyKey
    )) || null,
    lockAndRevalidate: async () => undefined,
    createResult: async (_tx: unknown, precheck: any, input: any) => {
      const result = {
        type: 'customer_batch_job' as const,
        id: `job-h-${results.length + 1}`,
        idempotencyFingerprint: input.idempotencyFingerprint,
        actorId: precheck.actorId,
        handlerKey: precheck.handlerKey,
        operation: precheck.operation,
        idempotencyKey: input.idempotencyKey,
        value: { id: `job-h-${results.length + 1}` },
      };
      results.push(result);
      return result;
    },
  };
  const consume = (issued: { id: string; confirmationToken: string }, overrides: Record<string, unknown> = {}) => {
    const row = rows.find((item) => item.id === issued.id);
    const command = row?.guardManifest?.command || {};
    const ids = row?.selectedCustomerIds || [];
    return consumeBatchPrecheckToken({
      store,
      token: issued.confirmationToken,
      actorId: String(overrides.actorId || 'actor-a'),
      handlerKey: String(overrides.handlerKey || 'customer_mutation'),
      operation: overrides.operation === undefined ? 'transfer' : String(overrides.operation),
      selectionHash: overrides.selectionHash === undefined ? sha256Json([...ids].sort()) : String(overrides.selectionHash),
      inputHash: overrides.inputHash === undefined
        ? sha256Json({ input: command.input, reason: command.reason })
        : String(overrides.inputHash),
      idempotencyKey: String(overrides.idempotencyKey || `click-${results.length + 1}`),
      now: () => (overrides.now as Date | undefined) || now,
    }, consumer);
  };
  return { rows, results, store, makeIssue, consume, consumer, get transactionCount() { return transactionCount; } };
}

{
  const harness = createHarness();
  const token = await harness.makeIssue();
  await assert.rejects(() => harness.consume(token, { actorId: 'actor-b' }), /当前请求不匹配/);
  await assert.rejects(() => harness.consume(token, { handlerKey: 'customer_import' }), /当前请求不匹配/);
  await assert.rejects(() => harness.consume(token, { inputHash: sha256Json({ input: { targetOwnerId: 'u-3' }, reason: '团队调整' }) }), /当前请求不匹配/);
  await assert.rejects(() => harness.consume(token, { selectionHash: sha256Json(['c-other']) }), /当前请求不匹配/);
}

{
  const harness = createHarness();
  const token = await harness.makeIssue();
  harness.rows[0].selectedCustomerIds = ['c-tampered'];
  await assert.rejects(() => harness.consume(token), /冻结选择已损坏/);
}

{
  const harness = createHarness();
  const token = await harness.makeIssue();
  harness.rows[0].guardManifest.command.reason = '被篡改的原因';
  await assert.rejects(() => harness.consume(token), /操作参数已损坏/);
}

{
  const harness = createHarness();
  const token = await harness.makeIssue();
  // MySQL raw SELECT may surface JSON columns as strings. The token boundary
  // must decode them before validating the same persisted bytes.
  harness.rows[0].guardManifest = JSON.stringify(harness.rows[0].guardManifest);
  harness.rows[0].selectedCustomerIds = JSON.stringify(harness.rows[0].selectedCustomerIds);
  harness.rows[0].customerVersionManifest = JSON.stringify(harness.rows[0].customerVersionManifest);
  assert.deepEqual(await harness.consume(token, {
    selectionHash: harness.rows[0].selectionHash,
    inputHash: harness.rows[0].inputHash,
  }), { id: 'job-h-1' });
}

{
  const harness = createHarness();
  const token = await harness.makeIssue();
  await assert.rejects(
    () => harness.consume(token, { now: new Date(now.getTime() + 10 * 60 * 1_000) }),
    /预检确认已过期/,
  );
  assert.equal(harness.rows[0].status, 'expired');
}

{
  const harness = createHarness();
  const token = await harness.makeIssue();
  await harness.consume(token, { idempotencyKey: 'wrong-envelope' });
  harness.results[0].type = 'customer_import';
  await assert.rejects(() => harness.consume(token, { idempotencyKey: 'wrong-envelope' }), /预检结果类型不匹配/);
}

{
  const harness = createHarness();
  const first = await harness.makeIssue({ input: { targetOwnerId: 'u-2' } });
  await harness.consume(first, { idempotencyKey: 'same-key' });
  const second = await harness.makeIssue({ input: { targetOwnerId: 'u-3' } });
  await assert.rejects(() => harness.consume(second, { idempotencyKey: 'same-key' }), /幂等键已用于不同请求/);
}

{
  const harness = createHarness();
  const token = await harness.makeIssue();
  let createAttempts = 0;
  let winner: any = null;
  const retryConsumer = {
    ...harness.consumer,
    findExistingResult: async (_tx: unknown, input: any) => winner && winner.actorId === input.actorId ? winner : null,
    createResult: async (_tx: unknown, precheck: any, input: any) => {
      createAttempts += 1;
      if (createAttempts === 1) {
        winner = {
          type: 'customer_batch_job' as const,
          id: 'job-concurrent-winner',
          idempotencyFingerprint: input.idempotencyFingerprint,
          actorId: precheck.actorId,
          handlerKey: precheck.handlerKey,
          operation: precheck.operation,
          idempotencyKey: input.idempotencyKey,
          value: { id: 'job-concurrent-winner' },
        };
        throw Object.assign(new Error('Duplicate entry'), { code: 'P2002' });
      }
      throw new Error('fresh transaction should adopt the winner before creating again');
    },
    loadResult: async () => winner,
  };
  const row = harness.rows[0];
  const result = await consumeBatchPrecheckToken({
    store: harness.store, token: token.confirmationToken, actorId: 'actor-a', handlerKey: 'customer_mutation', operation: 'transfer',
    selectionHash: row.selectionHash, inputHash: row.inputHash, idempotencyKey: 'concurrent-key', now: () => now,
  }, retryConsumer);
  assert.deepEqual(result, { id: 'job-concurrent-winner' });
  assert.equal(createAttempts, 1, 'P2002 后不能在旧事务中再次创建');
  assert.equal(harness.transactionCount, 2, 'P2002 必须放弃旧事务并在新事务读取赢家');
}

{
  const harness = createHarness();
  const token = await harness.makeIssue();
  let attempts = 0;
  const retryConsumer = {
    ...harness.consumer,
    createResult: async (tx: unknown, precheck: any, input: any) => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('Transaction write conflict'), { code: 'P2034' });
      return harness.consumer.createResult(tx, precheck, input);
    },
  };
  const row = harness.rows[0];
  assert.deepEqual(await consumeBatchPrecheckToken({
    store: harness.store, token: token.confirmationToken, actorId: 'actor-a', handlerKey: 'customer_mutation', operation: 'transfer',
    selectionHash: row.selectionHash, inputHash: row.inputHash, idempotencyKey: 'p2034-retry', now: () => now,
  }, retryConsumer), { id: 'job-h-1' });
  assert.equal(attempts, 2);
  assert.equal(harness.transactionCount, 2, 'P2034 必须放弃旧事务后在新事务重试');
}

console.log('customer batch precheck canonical hash tests passed');
