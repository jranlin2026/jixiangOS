import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { createPrismaBusinessRecycleBinRepository } from './businessRecycleBinRepository';

if (process.env.JIXIANG_SKIP_BUSINESS_RECYCLE_PURGE_INTEGRATION === 'YES') {
  console.log('business recycle bin purge integration skipped by explicit production deployment gate');
} else if (!process.env.DATABASE_URL) {
  console.log('business recycle bin purge integration skipped: DATABASE_URL is not set');
} else {
  const databaseUrl = new URL(process.env.DATABASE_URL);
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ''));
  if (!['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)) {
    throw new Error('business recycle bin purge integration requires a loopback MySQL host');
  }
  if (!/(?:_qa|_test)(?:_|$)/i.test(databaseName)) {
    throw new Error('business recycle bin purge integration requires an isolated _qa or _test database');
  }
  if (process.env.QA_ALLOW_DESTRUCTIVE_DB !== 'true') {
    throw new Error('business recycle bin purge integration requires QA_ALLOW_DESTRUCTIVE_DB=true');
  }
  if (!process.env.QA_DATABASE_NAME || process.env.QA_DATABASE_NAME !== databaseName) {
    throw new Error('QA_DATABASE_NAME must exactly match the DATABASE_URL database name');
  }
  const prisma = new PrismaClient();
  const runId = randomUUID();
  const deletedCustomerId = `purge-customer-${runId}`;
  const otherCustomerId = `purge-customer-other-${runId}`;
  const deletedLeadId = `purge-lead-${runId}`;
  const sharedIdentityId = `purge-identity-${runId}`;
  const rollbackCustomerId = `purge-rollback-customer-${runId}`;
  const rollbackLeadId = `purge-rollback-lead-${runId}`;
  const rollbackIdentityId = `purge-rollback-identity-${runId}`;
  const customerIds = [deletedCustomerId, otherCustomerId, rollbackCustomerId];
  const leadIds = [deletedLeadId, rollbackLeadId];
  const identityIds = [sharedIdentityId, rollbackIdentityId];
  const now = new Date().toISOString();
  const deletedCustomer = (id: string, name: string) => ({
    id,
    name,
    company: name,
    phone: '13900000000',
    customerLevel: 'L1',
    owner: '集成测试',
    totalSpent: 0,
    orderCount: 0,
    growthPath: [],
    growthRecords: [],
    activityRecords: [],
    deletedAt: now,
    deletedBy: '集成测试',
    deleteReason: '验证永久删除事务',
    createdAt: now,
    updatedAt: now,
  });
  const activeCustomer = {
    ...deletedCustomer(otherCustomerId, '保留客户'),
    deletedAt: undefined,
    deletedBy: undefined,
    deleteReason: undefined,
  };
  const deletedLead = (id: string, customerId: string) => ({
    id,
    name: '待永久删除线索',
    customerId,
    owner: '集成测试',
    deletedAt: now,
    deletedBy: '集成测试',
    deleteReason: '验证永久删除事务',
    createdAt: now,
    updatedAt: now,
  });
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');

  try {
    await prisma.businessRecord.createMany({
      data: [
        {
          id: `customer:${deletedCustomerId}`,
          domain: STORAGE_KEYS.CUSTOMERS,
          recordId: deletedCustomerId,
          customerId: deletedCustomerId,
          title: '待永久删除客户',
          data: deletedCustomer(deletedCustomerId, '待永久删除客户'),
        },
        {
          id: `customer:${otherCustomerId}`,
          domain: STORAGE_KEYS.CUSTOMERS,
          recordId: otherCustomerId,
          customerId: otherCustomerId,
          title: '保留客户',
          data: activeCustomer,
        },
        {
          id: `customer:${rollbackCustomerId}`,
          domain: STORAGE_KEYS.CUSTOMERS,
          recordId: rollbackCustomerId,
          customerId: rollbackCustomerId,
          title: '回滚客户',
          data: deletedCustomer(rollbackCustomerId, '回滚客户'),
        },
      ],
    });
    await prisma.leadRecord.createMany({
      data: [
        {
          id: deletedLeadId,
          name: '待永久删除线索',
          data: deletedLead(deletedLeadId, deletedCustomerId),
        },
        {
          id: rollbackLeadId,
          name: '回滚线索',
          data: deletedLead(rollbackLeadId, rollbackCustomerId),
        },
      ],
    });
    await prisma.contactIdentity.createMany({
      data: [
        {
          id: sharedIdentityId,
          type: 'phone',
          normalizedHash: hash(sharedIdentityId),
          hashKeyVersion: 1,
          status: 'active',
          encryptedNormalizedValue: 'integration-test',
          canonicalCustomerId: deletedCustomerId,
        },
        {
          id: rollbackIdentityId,
          type: 'phone',
          normalizedHash: hash(rollbackIdentityId),
          hashKeyVersion: 1,
          status: 'active',
          encryptedNormalizedValue: 'integration-test',
          canonicalCustomerId: rollbackCustomerId,
        },
      ],
    });
    await prisma.contactIdentityLink.createMany({
      data: [
        {
          id: `plc-${runId}`,
          identityId: sharedIdentityId,
          entityType: 'customer',
          entityId: deletedCustomerId,
          linkStatus: 'active',
          source: 'integration_test',
        },
        {
          id: `pll-${runId}`,
          identityId: sharedIdentityId,
          entityType: 'lead',
          entityId: deletedLeadId,
          linkStatus: 'active',
          source: 'integration_test',
        },
        {
          id: `plo-${runId}`,
          identityId: sharedIdentityId,
          entityType: 'customer',
          entityId: otherCustomerId,
          linkStatus: 'active',
          source: 'integration_test',
        },
        {
          id: `plrc-${runId}`,
          identityId: rollbackIdentityId,
          entityType: 'customer',
          entityId: rollbackCustomerId,
          linkStatus: 'active',
          source: 'integration_test',
        },
        {
          id: `plrl-${runId}`,
          identityId: rollbackIdentityId,
          entityType: 'lead',
          entityId: rollbackLeadId,
          linkStatus: 'active',
          source: 'integration_test',
        },
      ],
    });
    await prisma.customerAuditEvent.createMany({
      data: [
        {
          id: `purge-customer-audit-${runId}`,
          customerId: deletedCustomerId,
          operation: 'update_customer',
          actorId: 'integration-test',
          actorName: '集成测试',
          beforeSnapshot: { name: '待永久删除客户', phone: '13900000000' },
          afterSnapshot: { name: '待永久删除客户', phone: '13900000000' },
          result: 'success',
        },
        {
          id: `purge-rollback-audit-${runId}`,
          customerId: rollbackCustomerId,
          operation: 'update_customer',
          actorId: 'integration-test',
          actorName: '集成测试',
          beforeSnapshot: { name: '回滚客户', phone: '13900000000' },
          afterSnapshot: { name: '回滚客户', phone: '13900000000' },
          result: 'success',
        },
      ],
    });

    const repository = createPrismaBusinessRecycleBinRepository(prisma);
    await repository.purge('customer', deletedCustomerId, '集成测试永久删除', '集成测试');
    assert.equal(await prisma.businessRecord.count({
      where: { domain: STORAGE_KEYS.CUSTOMERS, recordId: deletedCustomerId },
    }), 0);
    assert.equal(await prisma.leadRecord.count({ where: { id: deletedLeadId } }), 0);
    assert.equal(await prisma.customerAuditEvent.count({ where: { customerId: deletedCustomerId } }), 0);
    assert.deepEqual(
      await prisma.contactIdentityLink.findMany({
        where: { identityId: sharedIdentityId },
        select: { entityType: true, entityId: true },
      }),
      [{ entityType: 'customer', entityId: otherCustomerId }],
    );
    assert.equal(
      (await prisma.contactIdentity.findUniqueOrThrow({ where: { id: sharedIdentityId } })).canonicalCustomerId,
      otherCustomerId,
    );

    const failingPrisma = {
      $queryRaw: prisma.$queryRaw.bind(prisma),
      $transaction: (callback: (tx: any) => Promise<unknown>) => prisma.$transaction(async (tx) => {
        const transaction = new Proxy(tx as any, {
          get(target, property) {
            if (property === 'businessRecord') {
              return new Proxy(target.businessRecord, {
                get(delegate, method) {
                  if (method === 'delete') {
                    return async ({ where }: any) => {
                      if (where?.domain_recordId?.recordId === rollbackCustomerId) {
                        throw new Error('forced late purge failure');
                      }
                      return delegate.delete({ where });
                    };
                  }
                  const value = Reflect.get(delegate, method);
                  return typeof value === 'function' ? value.bind(delegate) : value;
                },
              });
            }
            const value = Reflect.get(target, property);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        return callback(transaction);
      }),
    };
    const failingRepository = createPrismaBusinessRecycleBinRepository(failingPrisma as any);
    await assert.rejects(
      () => failingRepository.purge('customer', rollbackCustomerId, '验证失败回滚', '集成测试'),
      /forced late purge failure/,
    );
    assert.equal(await prisma.businessRecord.count({
      where: { domain: STORAGE_KEYS.CUSTOMERS, recordId: rollbackCustomerId },
    }), 1);
    assert.equal(await prisma.leadRecord.count({ where: { id: rollbackLeadId } }), 1);
    assert.equal(await prisma.customerAuditEvent.count({ where: { customerId: rollbackCustomerId } }), 1);
    assert.equal(await prisma.contactIdentityLink.count({ where: { identityId: rollbackIdentityId } }), 2);
    assert.equal(await prisma.contactIdentity.count({ where: { id: rollbackIdentityId } }), 1);
    const rollbackAudits = await prisma.businessRecord.findMany({
      where: { domain: STORAGE_KEYS.BUSINESS_RECYCLE_BIN_AUDITS },
      select: { data: true },
    });
    assert.equal(
      rollbackAudits.some((row) => (row.data as any)?.targetId === rollbackCustomerId),
      false,
      '事务末尾失败时最小审计也必须回滚',
    );
  } finally {
    const auditRows = await prisma.businessRecord.findMany({
      where: { domain: STORAGE_KEYS.BUSINESS_RECYCLE_BIN_AUDITS },
      select: { id: true, data: true },
    });
    const auditIds = auditRows
      .filter((row) => customerIds.includes(String((row.data as any)?.targetId || '')))
      .map((row) => row.id);
    await prisma.customerAuditEvent.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.contactIdentityLink.deleteMany({ where: { identityId: { in: identityIds } } });
    await prisma.customerDuplicateGroup.deleteMany({ where: { contactIdentityId: { in: identityIds } } });
    await prisma.contactIdentity.deleteMany({ where: { id: { in: identityIds } } });
    await prisma.leadRecord.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.businessRecord.deleteMany({
      where: {
        OR: [
          { domain: STORAGE_KEYS.CUSTOMERS, recordId: { in: customerIds } },
          ...(auditIds.length ? [{ id: { in: auditIds } }] : []),
        ],
      },
    });
    await prisma.$disconnect();
  }
  console.log('business recycle bin purge integration: ok');
}
