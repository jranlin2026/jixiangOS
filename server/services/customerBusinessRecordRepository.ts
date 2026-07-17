import { Prisma } from '@prisma/client';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { Customer } from '../../src/types/customer';

export type CustomerBusinessRecordRow = {
  id: string;
  domain: string;
  recordId: string;
  data: unknown;
  updatedAt: Date | string;
};

export type CustomerRecordSnapshot = {
  rowId: string;
  recordId: string;
  customer: Customer;
  businessRecordUpdatedAt: Date;
};

type CustomerBusinessRecordWriter = {
  businessRecord: {
    findUnique(args: {
      where: { domain_recordId: { domain: string; recordId: string } };
      select: { id: true; domain: true; recordId: true; data: true; updatedAt: true };
    }): Promise<CustomerBusinessRecordRow | null>;
    updateMany(args: {
      where: { id: string; domain: string; recordId: string; updatedAt: Date };
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
  const customer = parseCustomer(row.data);
  if (!customer.id || customer.id !== row.recordId) {
    throw new Error('客户ID与 BusinessRecord.recordId 不一致');
  }
  const version = row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt);
  if (Number.isNaN(version.getTime())) throw new Error('客户 BusinessRecord.updatedAt 无效');
  return {
    rowId: row.id,
    recordId: row.recordId,
    customer,
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
        select: { id: true, domain: true, recordId: true, data: true, updatedAt: true },
      });
      return row ? mapCustomerBusinessRecord(row) : null;
    },

    async lockById(customerId: string): Promise<CustomerRecordSnapshot | null> {
      const rows = await client.$queryRaw<CustomerBusinessRecordRow[]>(Prisma.sql`
        SELECT id, domain, recordId, data, updatedAt
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
      const result = await client.businessRecord.updateMany({
        where: {
          id: snapshot.rowId,
          domain: STORAGE_KEYS.CUSTOMERS,
          recordId: snapshot.recordId,
          updatedAt: snapshot.businessRecordUpdatedAt,
        },
        data: {
          title: customer.name || customer.company || customer.id,
          status: customer.lifecycleStatusCode || null,
          owner: customer.owner || null,
          customerId: customer.id,
          amount: Number.isFinite(Number(customer.totalSpent)) ? Number(customer.totalSpent) : null,
          eventAt,
          data: toJson(customer),
        },
      });
      if (result.count !== 1) throw new CustomerWriteConflictError();
    },
  };
}
