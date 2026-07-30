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
  $queryRaw = async () => [];
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
  put(prisma, STORAGE_KEYS.ORDERS, 'order-1', order(true));
  put(prisma, STORAGE_KEYS.COMMISSION_OPERATION_LOGS, 'reset-log-1', {
    id: 'reset-log-1',
    orderId: 'order-1',
    orderNo: 'ORD-1',
    customerName: '客户甲',
    action: '重置分账',
    operator: '财务甲',
    operatedAt: now,
    reason: '重新配置人员',
    summary: '重置分账',
    commissionCount: 1,
    totalCommissionAmount: 89.9,
    splitSnapshot: [],
    status: '重置分账',
  });
  const resetLogRow = prisma.rows.get(key(STORAGE_KEYS.COMMISSION_OPERATION_LOGS, 'reset-log-1'))!;
  resetLogRow.orderId = 'order-1';
  resetLogRow.status = '重置分账';
  const service = createOrderSettlementCommandService(prisma as any, { now: () => new Date(now) });
  const cleaned = await service.cleanup('order-1', '清理已删除的待处理记录', admin);
  assert.equal(cleaned.code, 0, cleaned.message);
  assert.equal(
    Array.from(prisma.rows.values()).some((row) => row.domain === STORAGE_KEYS.COMMISSION_OPERATION_LOGS && row.status === '清理废弃分账'),
    true,
    '重置后已无人员分账明细时，仍应允许超级管理员清理已删除源订单的废弃记录',
  );
}

{
  const prisma = new FakePrisma();
  put(prisma, STORAGE_KEYS.ORDERS, 'order-1', order());
  put(prisma, STORAGE_KEYS.COMMISSIONS, 'commission-withdrawn', {
    ...commission('已撤回'), settlementVersion: 1, settlementRoundId: 'settlement-order-1-v1',
  });
  const service = createOrderSettlementCommandService(prisma as any, { now: () => new Date(now) });
  const rows = [{
    orderId: 'order-1', role: '销售' as const, owner: '销售甲', ownerId: 'sales-1', department: '销售部',
    commissionAmount: 99.9, performanceAmount: 899, ruleCalculationType: 'fixed' as const,
  }];
  assert.equal((await service.save('order-1', rows, '调整人员', finance)).code, 409, '已撤回的分账必须先重新分账');
  assert.equal((await service.reopen('order-1', '调整人员', finance)).code, 0);
  const saved = await service.save('order-1', rows, '调整人员', finance);
  assert.equal(saved.code, 0, saved.message);
  assert.equal(saved.data?.[0]?.settlementVersion, 2);
  assert.equal(prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-withdrawn'))?.data.status, '已撤回', '旧轮次不得删除');
  assert.equal(
    Array.from(prisma.rows.values()).some((row) => row.domain === STORAGE_KEYS.COMMISSIONS && row.data.status === '待确认' && row.data.settlementVersion === 2),
    true,
    '重新分账保存必须创建新轮次',
  );
  const resetNewRound = await service.reset('order-1', '重置第二轮', finance);
  assert.equal(resetNewRound.code, 0, resetNewRound.message);
  assert.equal(prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-withdrawn'))?.data.status, '已撤回', '重置当前轮次不得删除旧轮次');
  assert.equal(
    Array.from(prisma.rows.values()).some((row) => row.domain === STORAGE_KEYS.COMMISSIONS && row.data.status === '待确认'),
    false,
    '重置当前轮次必须删除当前待确认明细',
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

{
  const prisma = new FakePrisma();
  put(prisma, STORAGE_KEYS.ORDERS, 'order-1', order());
  put(prisma, STORAGE_KEYS.COMMISSIONS, 'commission-1', {
    ...commission('待确认'),
    payoutPlanId: 'plan-1',
    payoutPlanName: '销售固定提成',
  });
  const service = createOrderSettlementCommandService(prisma as any, { now: () => new Date(now) });
  const confirmed = await service.confirm('order-1', '财务核对通过', finance);
  assert.equal(confirmed.code, 0, confirmed.message);
  assert.equal(prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))?.data.status, '待发放');
  assert.equal(
    Array.from(prisma.rows.values()).some((row) => row.domain === STORAGE_KEYS.COMMISSION_OPERATION_LOGS && row.status === '确认分账'),
    true,
    '确认分账必须通过记录级命令写入操作留痕',
  );
}

{
  const prisma = new FakePrisma();
  put(prisma, STORAGE_KEYS.ORDERS, 'order-1', order());
  put(prisma, STORAGE_KEYS.COMMISSIONS, 'commission-1', {
    ...commission('已撤回'),
    settlementVersion: 1,
    settlementRoundId: 'order-1-round-1',
  });
  const service = createOrderSettlementCommandService(prisma as any, { now: () => new Date(now) });
  assert.equal((await service.reopen('order-1', '', finance)).code, 400, '重新分账必须填写原因');
  const reopened = await service.reopen('order-1', '调整分账人员', finance);
  assert.equal(reopened.code, 0, reopened.message);
  assert.equal(prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))?.data.status, '已撤回', '重新分账不得覆盖旧明细');
  assert.equal(
    Array.from(prisma.rows.values()).some((row) => row.domain === STORAGE_KEYS.COMMISSION_OPERATION_LOGS && row.status === '重新分账'),
    true,
    '重新分账必须留下可追溯的命令留痕',
  );
}
