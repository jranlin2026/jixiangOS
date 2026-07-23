import { Prisma } from '@prisma/client';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { Customer } from '../../src/types/customer';
import { hydrateCustomerFirstSalesOwner } from '../../src/shared/utils/customerOwnership';

export type CustomerBusinessRecordRow = {
  id: string;
  domain: string;
  recordId: string;
  data: unknown;
  recordRevision?: number | null;
  updatedAt: Date | string;
};

export type CustomerRecordSnapshot = {
  rowId: string;
  recordId: string;
  customer: Customer;
  recordRevision: number;
  businessRecordUpdatedAt: Date;
};

type CustomerBusinessRecordWriter = {
  businessRecord: {
    findUnique(args: {
      where: { domain_recordId: { domain: string; recordId: string } };
      select: { id: true; domain: true; recordId: true; data: true; recordRevision: true; updatedAt: true };
    }): Promise<CustomerBusinessRecordRow | null>;
    updateMany(args: {
      where: { id: string; domain: string; recordId: string; recordRevision: number; updatedAt: Date };
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
};

export class CustomerWriteConflictError extends Error {
  readonly code = 'CUSTOMER_WRITE_CONFLICT';

  constructor() {
    super('客户记录已更新，请刷新后重试');
    this.name = 'CustomerWriteConflictError';
  }
}

function parseCustomer(value: unknown): Customer {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('客户 BusinessRecord.data 不是有效对象');
  }
  return parsed as Customer;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function mapCustomerBusinessRecord(row: CustomerBusinessRecordRow): CustomerRecordSnapshot {
  if (row.domain !== STORAGE_KEYS.CUSTOMERS) {
    throw new Error(`客户记录必须来自 ${STORAGE_KEYS.CUSTOMERS}`);
  }
  const customer = hydrateCustomerFirstSalesOwner(parseCustomer(row.data));
  if (!customer.id || customer.id !== row.recordId) {
    throw new Error('客户ID与 BusinessRecord.recordId 不一致');
  }
  const version = row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt);
  if (Number.isNaN(version.getTime())) throw new Error('客户 BusinessRecord.updatedAt 无效');
  const recordRevision = Number(row.recordRevision ?? customer.recordRevision ?? 0);
  if (!Number.isSafeInteger(recordRevision) || recordRevision < 0) throw new Error('客户 recordRevision 无效');
  if (customer.recordRevision !== undefined && customer.recordRevision !== recordRevision) {
    throw new Error('客户 recordRevision 与 BusinessRecord 不一致');
  }
  return {
    rowId: row.id,
    recordId: row.recordId,
    customer,
    recordRevision,
    businessRecordUpdatedAt: version,
  };
}

export function createCustomerBusinessRecordRepository(client: CustomerBusinessRecordWriter) {
  return {
    async findById(customerId: string): Promise<CustomerRecordSnapshot | null> {
      const row = await client.businessRecord.findUnique({
        where: {
          domain_recordId: {
            domain: STORAGE_KEYS.CUSTOMERS,
            recordId: customerId,
          },
        },
        select: { id: true, domain: true, recordId: true, data: true, recordRevision: true, updatedAt: true },
      });
      return row ? mapCustomerBusinessRecord(row) : null;
    },

    async lockById(customerId: string): Promise<CustomerRecordSnapshot | null> {
      const rows = await client.$queryRaw<CustomerBusinessRecordRow[]>(Prisma.sql`
        SELECT id, domain, recordId, data, recordRevision, updatedAt
        FROM business_records
        WHERE domain = ${STORAGE_KEYS.CUSTOMERS}
          AND recordId = ${customerId}
        LIMIT 1
        FOR UPDATE
      `);
      return rows[0] ? mapCustomerBusinessRecord(rows[0]) : null;
    },

    async compareAndSave(
      snapshot: CustomerRecordSnapshot,
      customer: Customer,
      eventAt: Date,
    ): Promise<void> {
      if (customer.id !== snapshot.recordId) {
        throw new Error('不得通过客户更新修改客户ID');
      }
      const nextRevision = snapshot.recordRevision + 1;
      const nextCustomer: Customer = { ...customer, recordRevision: nextRevision };
      const result = await client.businessRecord.updateMany({
        where: {
          id: snapshot.rowId,
          domain: STORAGE_KEYS.CUSTOMERS,
          recordId: snapshot.recordId,
          recordRevision: snapshot.recordRevision,
          updatedAt: snapshot.businessRecordUpdatedAt,
        },
        data: {
          title: nextCustomer.name || nextCustomer.company || nextCustomer.id,
          status: nextCustomer.lifecycleStatusCode || null,
          owner: nextCustomer.owner || null,
          customerId: nextCustomer.id,
          amount: Number.isFinite(Number(nextCustomer.totalSpent)) ? Number(nextCustomer.totalSpent) : null,
          eventAt,
          recordRevision: nextRevision,
          data: toJson(nextCustomer),
        },
      });
      if (result.count !== 1) throw new CustomerWriteConflictError();
    },
  };
}
