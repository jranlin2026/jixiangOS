import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { CommissionPayoutRecord } from '../../src/types/commission';
import type { Order } from '../../src/types/order';
import { createFinanceTransactionService } from './financeTransactionService';

const rows = new Map<string, any>();
const key = (domain: string, recordId: string) => `${domain}\0${recordId}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const businessRecord = {
  findUnique: async ({ where }: any) => clone(rows.get(key(where.domain_recordId.domain, where.domain_recordId.recordId)) || null),
  findMany: async ({ where }: any) => [...rows.values()].filter((row) => {
    if (where.domain) return row.domain === where.domain;
    return (where.OR || []).some((clause: any) => row.domain === clause.domain && clause.recordId.in.includes(row.recordId));
  }).map(clone),
  create: async ({ data }: any) => {
    const target = key(data.domain, data.recordId);
    if (rows.has(target)) throw new Error('duplicate');
    rows.set(target, clone({ ...data, createdAt: new Date(data.data.createdAt), data: data.data }));
    return clone(rows.get(target));
  },
};
const prisma: any = { businessRecord, $transaction: async (callback: any) => callback({ businessRecord }) };
const service = createFinanceTransactionService(prisma);
const actor = { id: 'finance-1', name: '财务A' } as AuthenticatedUser;
const order = {
  id: 'order-1', orderNo: 'ORD-1', customerId: 'customer-1', customerName: '客户A', productLevel: '代理', productName: '代理产品',
  paymentMethod: '对公转账', payments: [
    { id: 'payment-1', amount: 100, paidAt: '2026-07-01T01:00:00.000Z', paymentMethod: '对公转账', paymentOrderNo: 'BANK-1', attachments: [] },
    { id: 'payment-2', amount: 200, paidAt: '2026-07-02T01:00:00.000Z', paymentMethod: '企业支付宝', attachments: [] },
  ],
} as unknown as Order;

await prisma.$transaction((tx: any) => service.recordOrderPayments(tx, order, actor, '2026-07-03T00:00:00.000Z'));
await prisma.$transaction((tx: any) => service.recordOrderPayments(tx, order, actor, '2026-07-03T00:00:00.000Z'));
assert.equal(rows.size, 2, '同一订单付款重复写入不得生成重复流水');

const payout = {
  id: 'payout-1', payoutNo: 'FF-1', period: '2026-07', status: '已发放', totalCount: 2, totalAmount: 50,
  commissionIds: ['c1', 'c2'], byOwner: [{ owner: '员工A', department: '销售部', count: 2, amount: 50 }],
  createdAt: '2026-07-04T00:00:00.000Z', createdById: actor.id, createdByName: actor.name,
  issuedAt: '2026-07-04T00:00:00.000Z', issuedById: actor.id, issuedByName: actor.name, paymentMethod: '银行转账', paymentReference: 'BANK-PAYOUT',
} as CommissionPayoutRecord;
await prisma.$transaction((tx: any) => service.recordCommissionPayout(tx, payout));
await prisma.$transaction((tx: any) => service.recordCommissionPayout(tx, payout));
assert.equal(rows.size, 3, '同一发放单重复写入不得生成重复流水');

const firstPage = await service.list({ page: 1, pageSize: 1 });
assert.equal(firstPage.data?.items.length, 1);
assert.equal(firstPage.data?.pagination.total, 3);
assert.deepEqual(firstPage.data?.summary, { incomeAmount: 300, expenseAmount: 50, netAmount: 250, transactionCount: 3 }, '汇总必须基于完整筛选结果而不是当前页');

rows.set(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, payout.id), { domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, recordId: payout.id, data: { ...payout, status: '已撤销' } });
rows.set(key(STORAGE_KEYS.ORDERS, order.id), { domain: STORAGE_KEYS.ORDERS, recordId: order.id, data: order });
const payoutFlow = (await service.list({ type: '提成发放' })).data?.items[0];
assert.ok(payoutFlow);
assert.equal(payoutFlow?.sourceStatus, '已撤销', '流水列表必须展示来源发放单的当前状态');
const detail = await service.getById(payoutFlow!.id);
assert.equal(detail.data?.sourceStatus, '已撤销');
assert.equal((await service.list({ type: '提成发放' })).data?.summary.expenseAmount, 50, '撤销发放不代表资金追回，原支出流水必须保留');

const dryRun = await service.backfill(false, actor);
assert.equal(dryRun.data?.plannedCount, 3);
assert.equal(dryRun.data?.existingCount, 3);
assert.equal(dryRun.data?.createdCount, 0);
assert.equal(dryRun.data?.missingCount, 0);
assert.equal(dryRun.data?.existingIncomeAmount, 300);
assert.equal(dryRun.data?.existingExpenseAmount, 50);
const applied = await service.backfill(true, actor);
assert.equal(applied.code, 0);
assert.equal(applied.data?.createdCount, 0, '重复回填必须幂等');

rows.set(key(STORAGE_KEYS.ORDERS, 'bad-order'), { domain: STORAGE_KEYS.ORDERS, recordId: 'bad-order', data: { ...order, id: 'bad-order', orderNo: 'BAD', payments: [{ id: '', amount: 0, paidAt: '' }] } });
const rejected = await service.backfill(true, actor);
assert.equal(rejected.code, 409, '存在异常付款时必须拒绝 apply');

console.log('finance transaction service tests passed');
