import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendCustomerAuditEvent,
  createOrReloadCustomerDuplicateGroup,
  createPrismaCustomerAuditAppender,
  hashCustomerAuditInput,
  pickAuditFields,
  sanitizeAuditEventForViewer,
} from './customerAuditService';
import { mapPrismaCustomerAuditEvent } from '../db/prismaMappers';
import {
  customerMutationTargetKey,
  deriveCustomerBatchItemIdempotencyKey,
  type CustomerBatchItemStatus,
  type CustomerBatchJobStatus,
  type CustomerBatchOperation,
  type CustomerBatchPrecheckStatus,
} from '../../src/types/customerBatch';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const migrationRoot = path.join(root, 'prisma/migrations');
const migrationDirectory = '20260717090000_customer_batch_foundation';

assert.ok(
  existsSync(path.join(migrationRoot, migrationDirectory)),
  'the first-stage foundation migration must precede the planned 20260717100000 and 20260717110000 migrations',
);
assert.ok(!existsSync(path.join(migrationRoot, '20260718020638_customer_batch_foundation')), 'do not place the foundation after its planned second-stage migrations');

const schema = readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(path.join(migrationRoot, migrationDirectory, 'migration.sql'), 'utf8');
const serverIndex = readFileSync(path.join(root, 'server/index.ts'), 'utf8');
const prismaMappers = readFileSync(path.join(root, 'server/db/prismaMappers.ts'), 'utf8');

for (const model of [
  'CustomerBatchPrecheck',
  'CustomerBatchJob',
  'CustomerBatchJobItem',
  'CustomerAuditEvent',
  'ContactIdentity',
  'ContactIdentityLink',
  'CustomerDuplicateGroup',
]) {
  assert.match(schema, new RegExp(`model ${model} \\{`), `${model} must be present in Prisma schema`);
}

assert.match(schema, /eventSequence\s+BigInt\s+@unique\s+@default\(autoincrement\(\)\)/);
assert.match(schema, /@@unique\(\[actorId, handlerKey, operation, idempotencyKey\]\)/);
assert.match(schema, /@@unique\(\[jobId, targetKey\], map: "customer_batch_job_item_target_unique"\)/);
assert.match(schema, /idempotencyKey\s+String\s+@unique/);
assert.match(schema, /groupKey\s+String\s+@unique/);
assert.match(schema, /retryOf\s+CustomerBatchJob\?\s+@relation\("CustomerBatchJobRetry", fields: \[retryOfJobId\], references: \[id\], onDelete: SetNull\)/);
assert.match(schema, /retryChildren\s+CustomerBatchJob\[\]\s+@relation\("CustomerBatchJobRetry"\)/);
assert.match(schema, /@@index\(\[customerId, eventSequence\]\)/);
assert.match(schema, /@@index\(\[batchJobId, createdAt\]\)/);
assert.match(schema, /@@map\("customer_batch_prechecks"\)/);
assert.match(schema, /@@map\("customer_batch_jobs"\)/);
assert.match(schema, /@@map\("customer_batch_job_items"\)/);
assert.match(schema, /@@map\("customer_audit_events"\)/);
assert.match(schema, /@@map\("contact_identities"\)/);
assert.match(schema, /@@map\("contact_identity_links"\)/);
assert.match(schema, /@@map\("customer_duplicate_groups"\)/);
assert.doesNotMatch(schema, /customerId\s+String[^\n]*@relation/, 'customers remain BusinessRecord JSON, never a Prisma relation');

assert.match(migration, /CREATE TABLE `customer_batch_jobs`/);
assert.match(migration, /CREATE TABLE `customer_batch_job_items`/);
assert.match(migration, /CREATE TABLE `customer_audit_events`/);
assert.match(migration, /UNIQUE INDEX `customer_batch_jobs_actorId_handlerKey_operation_idempotency_key`\(`actorId`, `handlerKey`, `operation`, `idempotencyKey`\)/);
assert.match(migration, /UNIQUE INDEX `customer_batch_job_items_idempotencyKey_key`\(`idempotencyKey`\)/);
assert.match(migration, /UNIQUE INDEX `customer_batch_job_item_target_unique`\(`jobId`, `targetKey`\)/);
assert.match(migration, /UNIQUE INDEX `customer_duplicate_groups_groupKey_key`\(`groupKey`\)/);
assert.match(migration, /`eventSequence` BIGINT NOT NULL AUTO_INCREMENT/);
assert.match(migration, /UNIQUE INDEX `customer_audit_events_eventSequence_key`\(`eventSequence`\)/);
assert.match(migration, /customer_batch_job_items_target_key_nonempty_chk[\s\S]*CHAR_LENGTH\(TRIM\(`targetKey`\)\) > 0/);
assert.match(migration, /FOREIGN KEY \(`jobId`\) REFERENCES `customer_batch_jobs`\(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/);
assert.match(migration, /FOREIGN KEY \(`identityId`\) REFERENCES `contact_identities`\(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/);
assert.match(migration, /FOREIGN KEY \(`retryOfJobId`\) REFERENCES `customer_batch_jobs`\(`id`\) ON DELETE SET NULL ON UPDATE CASCADE/);
for (const sqlIdentifier of migration.matchAll(/(?:CREATE TABLE|INDEX|CONSTRAINT|FOREIGN KEY) `([^`]+)`/g)) {
  assert.ok(sqlIdentifier[1].length <= 64, `MySQL identifier exceeds 64 characters: ${sqlIdentifier[1]}`);
}
assert.match(serverIndex, /createPrismaCustomerAuditAppender/);
assert.match(serverIndex, /createAuditedCustomerAtomicCommandService\(prisma, \{\s*auditAppender: createPrismaCustomerAuditAppender\(\),/s);
assert.match(prismaMappers, /from '\.\/customerAuditProjection'/);
assert.doesNotMatch(prismaMappers, /from '\.\.\/services\/customerAuditService'/);
assert.match(serverIndex, /customerAtomicCommandService\.execute\(\{\s*action: 'release_to_pool'/s);
assert.match(serverIndex, /customerAtomicCommandService\.execute\(\{\s*action: 'transfer'/s);
assert.match(serverIndex, /customerAtomicCommandService\.execute\(\{\s*action: 'soft_delete'/s);
assert.match(serverIndex, /action: 'soft_delete',[\s\S]*reason: String\(req\.body\?\.reason \|\| ''\)\.trim\(\),[\s\S]*confirmed: true/s);
assert.match(serverIndex, /action: 'release_to_pool',[\s\S]*reason: String\(req\.body\?\.reason \|\| ''\)\.trim\(\),/s);
assert.match(serverIndex, /action: 'transfer',[\s\S]*targetOwnerId: String\(req\.body\?\.ownerId \|\| ''\),[\s\S]*reason: String\(req\.body\?\.reason \|\| ''\)\.trim\(\),/s);
assert.doesNotMatch(serverIndex, /\|\| '(?:业务删除|销售放弃跟进，客户进入公海池|分配客户)'/);
assert.match(serverIndex, /atomicResult\.code === 0 \|\| atomicResult\.code === 404 \? success\(true\) : atomicResult/);

const operation: CustomerBatchOperation = 'transfer';
const jobStatus: CustomerBatchJobStatus = 'queued';
const itemStatus: CustomerBatchItemStatus = 'queued';
const precheckStatus: CustomerBatchPrecheckStatus = 'issued';
assert.deepEqual([operation, jobStatus, itemStatus, precheckStatus], ['transfer', 'queued', 'queued', 'issued']);

const targetKey = customerMutationTargetKey('customer-1');
assert.equal(targetKey, 'customer:customer-1');
assert.equal(
  deriveCustomerBatchItemIdempotencyKey('job-1', targetKey),
  'job-1:customer:customer-1',
  'the mutation item idempotency key is deterministically derived from jobId + non-empty targetKey',
);
assert.throws(() => customerMutationTargetKey('  '), /客户 ID 不能为空/);
assert.throws(() => deriveCustomerBatchItemIdempotencyKey('job-1', '  '), /targetKey 不能为空/);

type StoredAuditEvent = {
  id: string;
  eventSequence: bigint;
  customerId: string;
  batchJobId: string | null;
  operation: string;
  actorId: string;
  actorName: string;
  reason: string | null;
  inputHash: string | null;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  result: string;
  requestId: string | null;
  idempotencyKey: string | null;
  ip: string | null;
  createdAt: Date;
};

const stored: StoredAuditEvent[] = [];
let nextEventSequence = 0n;
const tx: any = {
  customerAuditEvent: {
    async create({ data }: { data: Omit<StoredAuditEvent, 'eventSequence' | 'createdAt'> }) {
      const event: StoredAuditEvent = {
        ...data,
        eventSequence: ++nextEventSequence,
        createdAt: new Date('2026-07-18T02:00:00.000Z'),
      };
      stored.push(event);
      return event;
    },
  },
};

// Deliberately includes untrusted legacy JSON fields which are not part of the
// Customer TypeScript model, so this fixture remains intentionally untyped.
function auditInput(customerId: string): any {
  return {
    id: `audit-${customerId}`,
    customerId,
    operation: 'transfer' as const,
    actor: { id: 'user-1', name: '操作人' },
    reason: '团队调整',
    // A caller must never be able to smuggle raw contact text into the
    // persisted inputHash column. The appender hashes canonicalInput instead.
    inputHash: `raw-phone:${customerId}:13800138000`,
    canonicalInput: {
      operation: 'transfer', customerId, targetOwnerId: 'sales-2', reason: '团队调整',
      contactForCommandValidationOnly: '13800138000',
    },
    result: 'succeeded',
    requestId: 'request-1',
    ip: '127.0.0.1',
    beforeSnapshot: {
      id: customerId,
      name: '甲',
      company: '极享',
      phone: '13800138000',
      wechat: 'wx-secret-id',
      email: 'alice@example.com',
      owner: '销售甲',
      ownerId: 'sales-1',
      ownerIdentityStatus: 'resolved',
      lifecycleStatusCode: 'following',
      manualTagIds: ['tag-1'],
      tags: ['重点'],
      totalSpent: 100,
      orderCount: 1,
      activityRecords: [{
        id: 'activity-1',
        type: 'follow',
        title: '跟进',
        content: '不应保留任意活动内容',
        attachments: [{ dataUrl: 'data:application/octet-stream;base64,secret' }],
      }],
      attachments: [{ bytes: 'secret-bytes' }],
      passwordHash: 'password-hash',
      auth: { token: 'auth-token' },
      arbitraryBlob: { nested: { rawContact: '13800138000' } },
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-18T02:00:00.000Z',
    },
    afterSnapshot: {
      id: customerId,
      name: '甲',
      company: '极享',
      phone: '13800138000',
      wechat: 'wx-secret-id',
      email: 'alice@example.com',
      owner: '销售乙',
      ownerId: 'sales-2',
      ownerIdentityStatus: 'resolved',
      lifecycleStatusCode: 'following',
      manualTagIds: ['tag-1'],
      tags: ['重点'],
      totalSpent: 100,
      orderCount: 1,
      deletedAt: undefined,
      updatedAt: '2026-07-18T02:00:00.000Z',
    },
  };
}

const [first, second] = await Promise.all([
  appendCustomerAuditEvent(tx, auditInput('customer-1')),
  appendCustomerAuditEvent(tx, auditInput('customer-2')),
]);
assert.notEqual(first.eventSequence, second.eventSequence, 'database event sequence is monotonic even for concurrent append requests');
assert.equal(first.beforeSnapshot && (first.beforeSnapshot as any).phone, '138****8000');
assert.equal(first.beforeSnapshot && (first.beforeSnapshot as any).wechat, 'wx******id');
assert.equal(first.beforeSnapshot && (first.beforeSnapshot as any).email, 'al***@example.com');
assert.equal(pickAuditFields({ phone: '12345' })?.phone, '***', 'short or malformed phone values must never be stored raw');
assert.equal(pickAuditFields({ phone: '1234567' })?.phone, '***', 'a seven-character malformed phone must not expose all digits around a mask');
for (const shortWechat of ['x', 'ab', 'abcde', '1abcdef', 'abc def']) {
  assert.equal(
    pickAuditFields({ wechat: shortWechat })?.wechat,
    '***',
    `short/malformed WeChat value ${JSON.stringify(shortWechat)} must not reproduce any source character`,
  );
}
for (const malformedEmail of ['a', 'ab', 'a@', '@x', 'a@b', 'ab@cd', 'a@@b.com', 'abc@localhost', 'abc@x..com', 'abc@-x.com']) {
  assert.equal(
    pickAuditFields({ email: malformedEmail })?.email,
    '***',
    `short/malformed email ${JSON.stringify(malformedEmail)} must not reproduce any source character`,
  );
}
assert.equal(first.inputHash, hashCustomerAuditInput({
  operation: 'transfer', customerId: 'customer-1', targetOwnerId: 'sales-2', reason: '团队调整',
  contactForCommandValidationOnly: '13800138000',
}));
assert.notEqual(first.inputHash, 'raw-phone:customer-1:13800138000');
assert.match(first.inputHash || '', /^[a-f0-9]{64}$/);
assert.deepEqual(Object.keys((first.beforeSnapshot || {}) as object).sort(), [
  'company', 'createdAt', 'email', 'id', 'lifecycleStatusCode', 'manualTagIds', 'name', 'orderCount', 'owner', 'ownerId', 'ownerIdentityStatus', 'phone', 'tags', 'totalSpent', 'updatedAt', 'wechat',
]);
const persistedSnapshot = JSON.stringify(first.beforeSnapshot);
const persistedEvent = JSON.stringify(first, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
for (const forbidden of ['13800138000', 'wx-secret-id', 'alice@example.com', 'data:application', 'secret-bytes', 'password-hash', 'auth-token', 'arbitraryBlob', 'rawContact']) {
  assert.doesNotMatch(persistedSnapshot, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(persistedEvent, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

const appender = createPrismaCustomerAuditAppender();
const appended = await appender.append(tx, auditInput('customer-3'));
assert.equal(appended.id, 'audit-customer-3', 'the adapter writes through the caller-owned transaction');
assert.equal(stored.length, 3);

const duplicateGroups = new Map<string, any>();
const duplicateGroupStore = {
  customerDuplicateGroup: {
    async create({ data }: { data: any }) {
      await Promise.resolve();
      if (duplicateGroups.has(data.groupKey)) {
        const error = new Error('Unique constraint failed') as Error & { code?: string };
        error.code = 'P2002';
        throw error;
      }
      const row = { ...data, createdAt: new Date('2026-07-18T02:00:00.000Z') };
      duplicateGroups.set(data.groupKey, row);
      return row;
    },
    async findUnique({ where }: { where: { groupKey: string } }) {
      return duplicateGroups.get(where.groupKey) || null;
    },
  },
};
const [groupA, groupB] = await Promise.all([
  createOrReloadCustomerDuplicateGroup(duplicateGroupStore, {
    id: 'duplicate-a', rule: 'same_phone', confidence: 'high', status: 'open', customerIds: ['customer-2', 'customer-1'],
  }),
  createOrReloadCustomerDuplicateGroup(duplicateGroupStore, {
    id: 'duplicate-b', rule: 'same_phone', confidence: 'high', status: 'open', customerIds: ['customer-1', 'customer-2'],
  }),
]);
assert.equal(groupA.id, groupB.id, 'concurrent discovery reloads the unique group-key winner');
assert.equal(duplicateGroups.size, 1);
assert.deepEqual(groupA.customerIds, ['customer-1', 'customer-2']);

// RED: under MySQL REPEATABLE READ a P2002 loser cannot rely on a second
// snapshot findUnique. It must reload the group winner with a locking current
// read, just like ContactIdentity.
{
  const expectedGroupKey = createHash('sha256').update(JSON.stringify({
    rule: 'same_phone', customerIds: ['customer-1', 'customer-2'],
  })).digest('hex');
  const winner = {
    id: 'duplicate-current-read', groupKey: expectedGroupKey, rule: 'same_phone',
    confidence: 'high', status: 'open', customerIds: ['customer-1', 'customer-2'],
    contactIdentityId: null, sourceJobId: null, createdById: null, mergeLedgerId: null,
    createdAt: new Date('2026-07-18T02:00:00.000Z'), resolvedAt: null,
  };
  let currentReads = 0;
  const staleSnapshotStore: any = {
    customerDuplicateGroup: {
      create: async () => { throw Object.assign(new Error('duplicate group'), { code: 'P2002' }); },
      findUnique: async () => null,
    },
    $queryRaw: async (query: any) => {
      const text = Array.isArray(query?.strings) ? query.strings.join('?') : String(query || '');
      if (text.includes('FROM customer_duplicate_groups')) {
        currentReads += 1;
        assert.match(text, /FOR UPDATE/);
        assert.deepEqual(query.values, [expectedGroupKey]);
        return [winner];
      }
      return [];
    },
  };
  const reloaded = await createOrReloadCustomerDuplicateGroup(staleSnapshotStore, {
    rule: 'same_phone', confidence: 'high', status: 'open', customerIds: ['customer-2', 'customer-1'],
  });
  assert.equal(reloaded.id, winner.id);
  assert.equal(currentReads, 1);
}

const viewerEvent = sanitizeAuditEventForViewer({
  ...first,
  beforeSnapshot: { phone: '13800138000', name: '甲' },
});
assert.deepEqual(viewerEvent.beforeSnapshot, { phone: '138****8000', name: '甲' });
assert.equal(viewerEvent.eventSequence, '1');
assert.doesNotThrow(() => JSON.stringify(viewerEvent), 'audit views cannot leak bigint into JSON serialization');

const mapped = mapPrismaCustomerAuditEvent(first);
assert.equal(mapped.eventSequence, '1');
assert.doesNotThrow(() => JSON.stringify(mapped));

console.log('customer audit service tests passed');
