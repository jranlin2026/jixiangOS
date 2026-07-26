import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { Commission } from '../../src/types/commission';
import type { Order } from '../../src/types/order';
import type { AuthenticatedUser } from '../../src/types/auth';
import { createOrderSettlementCommandService } from './orderSettlementCommandService';

type Row = {
  id: string;
  domain: string;
  recordId: string;
  orderId: string | null;
  status: string | null;
  data: any;
  updatedAt?: Date;
};

const key = (domain: string, recordId: string) => `${domain}:${recordId}`;

class FakePrisma {
  rows = new Map<string, Row>();
  businessRecord = {
    findUnique: async ({ where }: any) => {
      const target = where.domain_recordId;
      return this.rows.get(key(target.domain, target.recordId)) || null;
    },
    findMany: async ({ where }: any) => Array.from(this.rows.values()).filter((row) => (
      row.domain === where.domain
      && (
        !where.OR
        || where.OR.some((condition: any) => (
          condition.orderId === row.orderId
          || condition.data?.equals === row.data?.orderId
        ))
      )
    )),
    findFirst: async ({ where }: any) => Array.from(this.rows.values()).find((row) => (
      row.domain === where.domain && row.orderId === where.orderId && row.status === where.status
    )) || null,
    deleteMany: async ({ where }: any) => {
      let count = 0;
      for (const [rowKey, row] of this.rows) {
        const matchesRecordId = !where.recordId?.in || where.recordId.in.includes(row.recordId);
        const matchesOrderId = where.orderId === undefined || row.orderId === where.orderId;
        if (row.domain === where.domain && matchesRecordId && matchesOrderId) {
          this.rows.delete(rowKey);
          count += 1;
        }
      }
      return { count };
    },
    update: async ({ where, data }: any) => {
      const target = where.domain_recordId;
      const row = this.rows.get(key(target.domain, target.recordId));
      if (!row) throw new Error('missing row');
      Object.assign(row, data);
      return row;
    },
    create: async ({ data }: any) => {
      const row = { ...data } as Row;
      this.rows.set(key(row.domain, row.recordId), row);
      return row;
    },
  };
  $transaction = async (task: (transaction: any) => Promise<any>) => task(this);
}

const now = '2026-07-26T12:00:00.000Z';
const admin = {
  id: 'admin', name: '超级管理员', account: 'admin', role: '超级管理员',
  roleId: 'super-admin', departmentId: 'finance', isActive: true,
  permissions: [{ module: '全部', actions: ['admin'] }],
} as AuthenticatedUser;
const finance = {
  ...admin,
  id: 'finance',
  name: '财务甲',
  role: '财务专员',
  roleId: 'finance-role',
  permissions: [{ module: '财务中心/订单分账', actions: ['read', 'write'] }],
} as AuthenticatedUser;

function order(deleted = false): Order {
  return {
    id: 'order-1', orderNo: 'ORD-1', customerId: 'customer-1', customerName: '客户甲',
    productLevel: '899', orderType: '成交', amount: 899, actualAmount: 899,
    paymentMethod: '对公转账', status: '已确认', refundStatus: '无', owner: '销售甲',
    sourceType: '公司资源', resourceOwnership: '公司资源', dealScene: '成交', proofStatus: '已上传',
    payments: [{ id: 'payment-1', amount: 899, paidAt: now }],
    createdAt: now, updatedAt: now, ...(deleted ? { deletedAt: now } : {}),
  } as unknown as Order;
}

function commission(status: Commission['status']): Commission {
  return {
    id: 'commission-1', orderId: 'order-1', orderNo: 'ORD-1', customerName: '客户甲',
    productLevel: '899', orderAmount: 899, commissionRate: 0.1, commissionAmount: 89.9,
    performanceAmount: 899, resourceOwnership: '公司资源', role: '销售', owner: '销售甲',
    ownerId: 'sales-1', department: '销售部', paymentDate: now, status,
    createdAt: now, updatedAt: now,
  };
}

function put(prisma: FakePrisma, domain: string, recordId: string, data: any) {
  prisma.rows.set(key(domain, recordId), {
    id: key(domain, recordId), domain, recordId,
    orderId: data.orderId || (domain === STORAGE_KEYS.ORDERS ? recordId : null),
    status: data.status || null, data,
  });
}

{
  const prisma = new FakePrisma();
  put(prisma, STORAGE_KEYS.ORDERS, 'order-1', order());
  put(prisma, STORAGE_KEYS.COMMISSIONS, 'commission-1', commission('待确认'));
  prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!.orderId = null;
  const service = createOrderSettlementCommandService(prisma as any, { now: () => new Date(now) });
  const result = await service.reset('order-1', '重新配置人员', finance);
  assert.equal(result.code, 0);
  assert.equal(prisma.rows.has(key(STORAGE_KEYS.COMMISSIONS, 'commission-1')), false);
  assert.equal(
    Array.from(prisma.rows.values()).some((row) => row.domain === STORAGE_KEYS.COMMISSION_OPERATION_LOGS && row.status === '重置分账'),
    true,
  );
}

{
  const prisma = new FakePrisma();
  put(prisma, STORAGE_KEYS.ORDERS, 'order-1', order());
  put(prisma, STORAGE_KEYS.COMMISSIONS, 'commission-1', commission('待发放'));
  const service = createOrderSettlementCommandService(prisma as any, { now: () => new Date(now) });
  assert.equal((await service.withdraw('order-1', '订单退款', finance)).code, 0);
  assert.equal(prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))?.data.status, '已撤回');

  put(prisma, STORAGE_KEYS.ORDERS, 'order-1', order(true));
  assert.equal((await service.cleanup('order-1', '清理废弃记录', finance)).code, 403);
  assert.equal((await service.cleanup('order-1', '清理废弃记录', admin)).code, 0);
  assert.equal(
    prisma.rows.has(key(STORAGE_KEYS.COMMISSIONS, 'commission-1')),
    true,
    '清理废弃记录不能物理删除人员分账',
  );
  assert.equal(
    Array.from(prisma.rows.values()).some((row) => row.domain === STORAGE_KEYS.COMMISSION_OPERATION_LOGS && row.status === '清理废弃分账'),
    true,
  );
}
