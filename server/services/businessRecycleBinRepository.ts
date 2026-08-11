import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { BusinessRecycleBinType } from '../../src/types/businessRecycleBin';
import type { Customer } from '../../src/types/customer';
import type { Lead } from '../../src/types/lead';
import type { Order } from '../../src/types/order';
import {
  lockContactIdentityMutationGate,
  reconcileContactIdentitiesAfterEntityPurge,
} from './contactIdentityService';
import {
  lockCustomerAssociationScope,
} from './customerAssociationRegistry';
import { assertCustomerCanBeSoftDeleted } from './customerDeletePolicy';
import { createCustomerBusinessRecordRepository } from './customerBusinessRecordRepository';

export type BusinessRecycleBinDeletedRow = {
  type: BusinessRecycleBinType;
  data: unknown;
  linkedCustomerExists?: boolean;
};

export type BusinessRecycleBinRepository = {
  listDeleted(input: {
    type?: BusinessRecycleBinType;
    search?: string;
    offset: number;
    limit: number;
  }): Promise<{ rows: BusinessRecycleBinDeletedRow[]; total: number }>;
  restoreOrder(id: string, actorName: string): Promise<void>;
  purge(type: BusinessRecycleBinType, id: string, reason: string, actorName: string): Promise<void>;
};

type RecycleBinPrisma = Pick<PrismaClient, '$queryRaw' | '$transaction'>;

export class BusinessRecycleBinCommandError extends Error {
  constructor(readonly responseCode: number, message: string) {
    super(message);
    this.name = 'BusinessRecycleBinCommandError';
  }
}

function parseObject<T>(value: unknown, label: string): T {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as T;
  } catch {
    throw new BusinessRecycleBinCommandError(409, `${label}数据损坏，请先修复数据`);
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function lockDeletedOrder(transaction: Prisma.TransactionClient, id: string): Promise<Order> {
  const rows = await transaction.$queryRaw<Array<{ data: unknown }>>(Prisma.sql`
    SELECT data
    FROM business_records
    WHERE domain = ${STORAGE_KEYS.ORDERS}
      AND recordId = ${id}
    LIMIT 1
    FOR UPDATE
  `);
  if (!rows[0]) throw new BusinessRecycleBinCommandError(404, '订单不存在');
  const order = parseObject<Order>(rows[0].data, '订单');
  if (order.id !== id) throw new BusinessRecycleBinCommandError(409, '订单标识与数据库记录不一致');
  if (!order.deletedAt) throw new BusinessRecycleBinCommandError(409, '订单不在业务回收站中');
  return order;
}

async function lockDeletedCustomer(transaction: Prisma.TransactionClient, id: string): Promise<Customer> {
  const rows = await transaction.$queryRaw<Array<{ data: unknown }>>(Prisma.sql`
    SELECT data
    FROM business_records
    WHERE domain = ${STORAGE_KEYS.CUSTOMERS}
      AND recordId = ${id}
    LIMIT 1
    FOR UPDATE
  `);
  if (!rows[0]) throw new BusinessRecycleBinCommandError(404, '客户不存在');
  const customer = parseObject<Customer>(rows[0].data, '客户');
  if (customer.id !== id) throw new BusinessRecycleBinCommandError(409, '客户标识与数据库记录不一致');
  if (!customer.deletedAt) throw new BusinessRecycleBinCommandError(409, '客户不在业务回收站中');
  return customer;
}

async function lockDeletedLead(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<{ rowId: string; externalIntakeKey: string | null; lead: Lead }> {
  const rows = await transaction.$queryRaw<Array<{ id: string; externalIntakeKey: string | null; data: unknown }>>(Prisma.sql`
    SELECT id, externalIntakeKey, data
    FROM lead_records
    WHERE id = ${id}
    LIMIT 1
    FOR UPDATE
  `);
  if (!rows[0]) throw new BusinessRecycleBinCommandError(404, '线索不存在');
  const lead = parseObject<Lead>(rows[0].data, '线索');
  if (lead.id !== id) throw new BusinessRecycleBinCommandError(409, '线索标识与数据库记录不一致');
  if (!lead.deletedAt) throw new BusinessRecycleBinCommandError(409, '线索不在业务回收站中');
  return { rowId: rows[0].id, externalIntakeKey: rows[0].externalIntakeKey, lead };
}

async function lockedLinkedLeadRows(
  transaction: Prisma.TransactionClient,
  customerId: string,
): Promise<Array<{ id: string; externalIntakeKey: string | null; data: unknown }>> {
  return transaction.$queryRaw<Array<{ id: string; externalIntakeKey: string | null; data: unknown }>>(Prisma.sql`
    SELECT id, externalIntakeKey, data
    FROM lead_records
    WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.customerId')) = ${customerId}
    ORDER BY id
    FOR UPDATE
  `);
}

async function purgeBrowserLeadSyncs(
  transaction: Prisma.TransactionClient,
  leads: Array<{ rowId: string; externalIntakeKey?: string | null }>,
): Promise<number> {
  const leadIds = leads.map((lead) => lead.rowId);
  const syncIds = leads
    .map((lead) => lead.externalIntakeKey)
    .filter((syncId): syncId is string => Boolean(syncId));
  if (!leadIds.length && !syncIds.length) return 0;
  const removed = await transaction.browserLeadSync.deleteMany({
    where: {
      OR: [
        ...(leadIds.length ? [{ leadId: { in: leadIds } }] : []),
        ...(syncIds.length ? [{ id: { in: syncIds } }] : []),
      ],
    },
  });
  return removed.count;
}

async function purgeContactIdentityArtifacts(
  transaction: Prisma.TransactionClient,
  customerIds: string[],
  leadIds: string[],
): Promise<{ removedLinkCount: number; removedOrphanIdentityCount: number }> {
  const subjects = [
    ...customerIds.map((entityId) => ({ entityType: 'customer', entityId })),
    ...leadIds.map((entityId) => ({ entityType: 'lead', entityId })),
  ];
  if (!subjects.length) return { removedLinkCount: 0, removedOrphanIdentityCount: 0 };
  const links = await transaction.contactIdentityLink.findMany({
    where: { OR: subjects },
    select: { identityId: true },
  });
  const identityIds = [...new Set(links.map((link) => link.identityId))];
  const removedLinks = await transaction.contactIdentityLink.deleteMany({
    where: { OR: subjects },
  });
  if (!identityIds.length) {
    return { removedLinkCount: removedLinks.count, removedOrphanIdentityCount: 0 };
  }
  const orphanRows = await transaction.contactIdentity.findMany({
    where: { id: { in: identityIds }, links: { none: {} } },
    select: { id: true },
  });
  const orphanIds = orphanRows.map((row) => row.id);
  const retainedIdentityIds = identityIds.filter((identityId) => !orphanIds.includes(identityId));
  await reconcileContactIdentitiesAfterEntityPurge(transaction, retainedIdentityIds);
  if (!orphanIds.length) {
    return { removedLinkCount: removedLinks.count, removedOrphanIdentityCount: 0 };
  }
  await transaction.customerDuplicateGroup.deleteMany({
    where: { contactIdentityId: { in: orphanIds } },
  });
  const removedIdentities = await transaction.contactIdentity.deleteMany({
    where: { id: { in: orphanIds }, links: { none: {} } },
  });
  return {
    removedLinkCount: removedLinks.count,
    removedOrphanIdentityCount: removedIdentities.count,
  };
}

async function purgeDeletedCustomer(
  transaction: Prisma.TransactionClient,
  id: string,
  reason: string,
  actorName: string,
): Promise<void> {
  await lockContactIdentityMutationGate(transaction);
  await lockCustomerAssociationScope(transaction, [id]);
  const customer = await lockDeletedCustomer(transaction, id);
  try {
    await assertCustomerCanBeSoftDeleted(transaction, id, { cascadeLinkedLeads: true });
  } catch (error) {
    throw new BusinessRecycleBinCommandError(
      409,
      error instanceof Error ? error.message : '客户存在关联业务，不能永久删除',
    );
  }
  const linkedRows = await lockedLinkedLeadRows(transaction, id);
  const linkedLeads = linkedRows.map((row) => ({
    rowId: row.id,
    lead: parseObject<Lead>(row.data, '线索'),
  }));
  if (linkedLeads.some(({ lead }) => !lead.deletedAt)) {
    throw new BusinessRecycleBinCommandError(409, '客户仍有关联的有效线索，不能永久删除');
  }

  const identityCleanup = await purgeContactIdentityArtifacts(
    transaction,
    [id],
    linkedLeads.map(({ rowId }) => rowId),
  );
  const removedCustomerAudits = await transaction.customerAuditEvent.deleteMany({
    where: { customerId: id },
  });
  const removedBrowserLeadSyncCount = await purgeBrowserLeadSyncs(
    transaction,
    linkedRows.map((row) => ({ rowId: row.id, externalIntakeKey: row.externalIntakeKey })),
  );
  const purgedAt = new Date().toISOString();
  const auditId = `recycle-purge-${randomUUID()}`;
  await transaction.businessRecord.create({
    data: {
      id: `business-recycle-bin-audit:${auditId}`,
      domain: STORAGE_KEYS.BUSINESS_RECYCLE_BIN_AUDITS,
      recordId: auditId,
      title: id,
      status: '已永久删除',
      owner: actorName,
      eventAt: new Date(purgedAt),
      data: jsonValue({
        id: auditId,
        targetType: 'customer',
        targetId: id,
        reason,
        operator: actorName,
        removedLinkedLeadCount: linkedLeads.length,
        removedCustomerAuditEventCount: removedCustomerAudits.count,
        removedBrowserLeadSyncCount,
        removedContactIdentityLinkCount: identityCleanup.removedLinkCount,
        removedOrphanIdentityCount: identityCleanup.removedOrphanIdentityCount,
        purgedAt,
      }),
    },
  });
  if (linkedLeads.length) {
    await transaction.leadRecord.deleteMany({
      where: { id: { in: linkedLeads.map(({ rowId }) => rowId) } },
    });
  }
  await transaction.businessRecord.delete({
    where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: id } },
  });
}

async function purgeDeletedLead(
  transaction: Prisma.TransactionClient,
  id: string,
  reason: string,
  actorName: string,
): Promise<void> {
  await lockContactIdentityMutationGate(transaction);
  const { rowId, externalIntakeKey, lead } = await lockDeletedLead(transaction, id);
  const customerId = String(lead.customerId || '').trim();
  if (customerId) {
    await lockCustomerAssociationScope(transaction, [customerId], { allowMerged: true });
    const customerRow = await transaction.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: customerId } },
      select: { recordId: true },
    });
    if (customerRow) {
      throw new BusinessRecycleBinCommandError(
        409,
        '该线索仍关联客户，请从关联客户统一永久删除',
      );
    }
  }

  const identityCleanup = await purgeContactIdentityArtifacts(transaction, [], [rowId]);
  const removedBrowserLeadSyncCount = await purgeBrowserLeadSyncs(
    transaction,
    [{ rowId, externalIntakeKey }],
  );
  const purgedAt = new Date().toISOString();
  const auditId = `recycle-purge-${randomUUID()}`;
  await transaction.businessRecord.create({
    data: {
      id: `business-recycle-bin-audit:${auditId}`,
      domain: STORAGE_KEYS.BUSINESS_RECYCLE_BIN_AUDITS,
      recordId: auditId,
      title: id,
      status: '已永久删除',
      owner: actorName,
      eventAt: new Date(purgedAt),
      data: jsonValue({
        id: auditId,
        targetType: 'lead',
        targetId: id,
        reason,
        operator: actorName,
        removedContactIdentityLinkCount: identityCleanup.removedLinkCount,
        removedOrphanIdentityCount: identityCleanup.removedOrphanIdentityCount,
        removedBrowserLeadSyncCount,
        purgedAt,
      }),
    },
  });
  await transaction.leadRecord.delete({ where: { id: rowId } });
}

async function recalculateCustomerProjection(
  transaction: Prisma.TransactionClient,
  customerId: string,
  changedAt: string,
): Promise<void> {
  const customers = createCustomerBusinessRecordRepository(transaction);
  const snapshot = await customers.lockById(customerId);
  if (!snapshot) return;
  const rows = await transaction.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS } });
  const orders = rows
    .map((row) => parseObject<Order>(row.data, '订单'))
    .filter((order) => order.customerId === customerId && !order.deletedAt);
  const latest = [...orders].sort((left, right) => (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  ))[0];
  const customer: Customer = {
    ...snapshot.customer,
    productLevel: latest?.productLevel || snapshot.customer.productLevel,
    orderCount: orders.length,
    totalSpent: Math.round(orders.reduce((sum, order) => sum + Number(order.actualAmount || 0), 0) * 100) / 100,
    updatedAt: changedAt,
  };
  await customers.compareAndSave(snapshot, customer, new Date(changedAt));
}

const DEPENDENCY_LABELS: Record<string, string> = {
  [STORAGE_KEYS.COMMISSIONS]: '提成记录',
  [STORAGE_KEYS.DELIVERIES]: '交付记录',
  [STORAGE_KEYS.REFUNDS]: '退款记录',
  [STORAGE_KEYS.RECOVERY_ORDERS]: '售后挽回记录',
  [STORAGE_KEYS.FINANCE_TRANSACTIONS]: '资金流水',
};

function deletedRecordsSql() {
  return Prisma.sql`(
    SELECT 'lead' AS recordType, data
    FROM lead_records
    WHERE NULLIF(JSON_UNQUOTE(JSON_EXTRACT(data, '$.deletedAt')), 'null') IS NOT NULL
    UNION ALL
    SELECT CASE
      WHEN domain = ${STORAGE_KEYS.CUSTOMERS} THEN 'customer'
      WHEN domain = ${STORAGE_KEYS.ORDERS} THEN 'order'
    END AS recordType, data
    FROM business_records
    WHERE domain IN (${STORAGE_KEYS.CUSTOMERS}, ${STORAGE_KEYS.ORDERS})
      AND NULLIF(JSON_UNQUOTE(JSON_EXTRACT(data, '$.deletedAt')), 'null') IS NOT NULL
  ) AS deleted_records`;
}

function deletedRecordsWhere(type?: BusinessRecycleBinType, search?: string) {
  const conditions: Prisma.Sql[] = [];
  if (type) conditions.push(Prisma.sql`recordType = ${type}`);
  if (search) {
    const query = `%${search.toLowerCase()}%`;
    conditions.push(Prisma.sql`LOWER(CONCAT_WS(' ',
      JSON_UNQUOTE(JSON_EXTRACT(data, '$.name')),
      JSON_UNQUOTE(JSON_EXTRACT(data, '$.company')),
      JSON_UNQUOTE(JSON_EXTRACT(data, '$.phone')),
      JSON_UNQUOTE(JSON_EXTRACT(data, '$.orderNo')),
      JSON_UNQUOTE(JSON_EXTRACT(data, '$.customerName')),
      JSON_UNQUOTE(JSON_EXTRACT(data, '$.owner')),
      JSON_UNQUOTE(JSON_EXTRACT(data, '$.assignedTo'))
    )) LIKE ${query}`);
  }
  return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
}

export function createPrismaBusinessRecycleBinRepository(prisma: RecycleBinPrisma): BusinessRecycleBinRepository {
  return {
    async listDeleted(input) {
      const where = deletedRecordsWhere(input.type, input.search);
      const [countRows, rows] = await Promise.all([
        prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
          SELECT COUNT(*) AS total FROM ${deletedRecordsSql()} ${where}
        `),
        prisma.$queryRaw<Array<{
          recordType: BusinessRecycleBinType;
          data: unknown;
          linkedCustomerExists: bigint | number;
        }>>(Prisma.sql`
          SELECT recordType, data,
            CASE
              WHEN recordType = 'lead'
                AND EXISTS (
                  SELECT 1
                  FROM business_records AS linked_customer
                  WHERE linked_customer.domain = ${STORAGE_KEYS.CUSTOMERS}
                    AND linked_customer.recordId =
                      JSON_UNQUOTE(JSON_EXTRACT(deleted_records.data, '$.customerId'))
                )
              THEN 1
              ELSE 0
            END AS linkedCustomerExists
          FROM ${deletedRecordsSql()}
          ${where}
          ORDER BY JSON_UNQUOTE(JSON_EXTRACT(data, '$.deletedAt')) DESC,
            recordType ASC,
            JSON_UNQUOTE(JSON_EXTRACT(data, '$.id')) ASC
          LIMIT ${input.limit} OFFSET ${input.offset}
        `),
      ]);
      return {
        total: Number(countRows[0]?.total || 0),
        rows: rows.map((row) => ({
          type: row.recordType,
          data: row.data,
          linkedCustomerExists: Number(row.linkedCustomerExists || 0) === 1,
        })),
      };
    },
    async restoreOrder(id, actorName) {
      await prisma.$transaction(async (transaction) => {
        const order = await lockDeletedOrder(transaction, id);
        const changedAt = new Date().toISOString();
        const next: Order = {
          ...order,
          deletedAt: undefined,
          deletedBy: undefined,
          deleteReason: undefined,
          updatedAt: changedAt,
          changeHistory: [{
            id: `hist-restore-${id}-${Date.now()}`,
            action: 'update',
            operator: actorName,
            changedAt,
            summary: '从业务回收站恢复订单',
          }, ...(order.changeHistory || [])],
        };
        await transaction.businessRecord.update({
          where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: id } },
          data: {
            status: next.status,
            owner: next.salesName || next.owner || null,
            customerId: next.customerId,
            orderId: next.id,
            amount: next.actualAmount,
            eventAt: new Date(changedAt),
            data: jsonValue(next),
          },
        });
        await recalculateCustomerProjection(transaction, next.customerId, changedAt);
      });
    },
    async purge(type, id, _reason, _actorName) {
      if (type === 'customer') {
        await prisma.$transaction((transaction) => (
          purgeDeletedCustomer(transaction, id, _reason, _actorName)
        ));
        return;
      }
      if (type === 'lead') {
        await prisma.$transaction((transaction) => (
          purgeDeletedLead(transaction, id, _reason, _actorName)
        ));
        return;
      }
      await prisma.$transaction(async (transaction) => {
        const order = await lockDeletedOrder(transaction, id);
        const [dependencies, operationLogs] = await Promise.all([
          transaction.businessRecord.findMany({
            where: {
              orderId: id,
              domain: { notIn: [
                STORAGE_KEYS.ORDERS,
                STORAGE_KEYS.ORDER_APPLICATIONS,
                STORAGE_KEYS.COMMISSION_OPERATION_LOGS,
              ] },
            },
            select: { domain: true },
          }),
          transaction.businessRecord.findMany({
            where: { domain: STORAGE_KEYS.COMMISSION_OPERATION_LOGS, orderId: id },
            select: { recordId: true },
          }),
        ]);
        if (dependencies.length) {
          const labels = [...new Set(dependencies.map((row) => DEPENDENCY_LABELS[row.domain] || '关联业务记录'))];
          throw new BusinessRecycleBinCommandError(
            409,
            `该订单仍有${labels.join('、')}，不能永久删除`,
          );
        }
        const purgedAt = new Date().toISOString();
        const auditId = `recycle-purge-${randomUUID()}`;
        await transaction.businessRecord.create({
          data: {
            id: `business-recycle-bin-audit:${auditId}`,
            domain: STORAGE_KEYS.BUSINESS_RECYCLE_BIN_AUDITS,
            recordId: auditId,
            title: order.orderNo,
            status: '已永久删除',
            owner: _actorName,
            customerId: order.customerId,
            eventAt: new Date(purgedAt),
            data: jsonValue({
              id: auditId,
              targetType: 'order',
              targetId: order.id,
              orderNo: order.orderNo,
              customerId: order.customerId,
              customerName: order.customerName,
              reason: _reason,
              operator: _actorName,
              removedOperationLogCount: operationLogs.length,
              purgedAt,
            }),
          },
        });
        await transaction.businessRecord.deleteMany({
          where: {
            domain: STORAGE_KEYS.ORDER_APPLICATIONS,
            OR: [
              { orderId: id },
              ...(order.sourceApplicationId ? [{ recordId: order.sourceApplicationId }] : []),
            ],
          },
        });
        await transaction.businessRecord.deleteMany({
          where: { domain: STORAGE_KEYS.COMMISSION_OPERATION_LOGS, orderId: id },
        });
        await transaction.businessRecord.delete({
          where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: id } },
        });
        await recalculateCustomerProjection(transaction, order.customerId, new Date().toISOString());
      });
    },
  };
}
