import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { BusinessRecycleBinType } from '../../src/types/businessRecycleBin';
import type { Customer } from '../../src/types/customer';
import type { Order } from '../../src/types/order';
import { createCustomerBusinessRecordRepository } from './customerBusinessRecordRepository';

export type BusinessRecycleBinDeletedRow = {
  type: BusinessRecycleBinType;
  data: unknown;
};

export type BusinessRecycleBinRepository = {
  listDeleted(input: {
    type?: BusinessRecycleBinType;
    search?: string;
    offset: number;
    limit: number;
  }): Promise<{ rows: BusinessRecycleBinDeletedRow[]; total: number }>;
  restoreOrder(id: string, actorName: string): Promise<void>;
  purgeOrder(id: string, reason: string, actorName: string): Promise<void>;
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
  [STORAGE_KEYS.COMMISSION_OPERATION_LOGS]: '分账操作记录',
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
        prisma.$queryRaw<Array<{ recordType: BusinessRecycleBinType; data: unknown }>>(Prisma.sql`
          SELECT recordType, data
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
        rows: rows.map((row) => ({ type: row.recordType, data: row.data })),
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
    async purgeOrder(id, _reason, _actorName) {
      await prisma.$transaction(async (transaction) => {
        const order = await lockDeletedOrder(transaction, id);
        const dependencies = await transaction.businessRecord.findMany({
          where: {
            orderId: id,
            domain: { notIn: [STORAGE_KEYS.ORDERS, STORAGE_KEYS.ORDER_APPLICATIONS] },
          },
          select: { domain: true },
        });
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
            domain: 'aaos_business_recycle_bin_audit',
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
        await transaction.businessRecord.delete({
          where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: id } },
        });
        await recalculateCustomerProjection(transaction, order.customerId, new Date().toISOString());
      });
    },
  };
}
