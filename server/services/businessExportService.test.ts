import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import { createBusinessExportService } from './businessExportService';

const now = '2026-07-24T12:00:00.000Z';
const actor: AuthenticatedUser = {
  id: 'admin-1', name: '超级管理员', account: 'admin', email: 'admin@example.com', phone: '',
  role: '超级管理员', roleId: 'role-admin', isActive: true,
  permissions: [{ module: '全部', actions: ['admin'] }],
};

const order = {
  id: 'order-1', orderNo: 'ORD-001', customerId: 'customer-1', customerName: '客户甲',
  productLevel: '899', orderType: '899成交', amount: 899, actualAmount: 799,
  paymentMethod: '对公转账', status: '已确认', refundStatus: '无', owner: '销售甲', salesId: 'sales-1',
  payments: [{ id: 'payment-1', amount: 799, paymentMethod: '对公转账', paidAt: now, paymentOrderNo: 'PAY-1', voucherName: '付款凭证.png' }],
  dealEvidenceAttachments: [{ id: 'proof-1', name: '成交凭证.png', mimeType: 'image/png', size: 12, category: 'order-deal-evidence' }],
  createdAt: now, updatedAt: now,
};

const commission = {
  id: 'commission-1', orderId: order.id, orderNo: order.orderNo, customerName: order.customerName,
  productLevel: order.productLevel, orderAmount: order.actualAmount, commissionRate: 0.1,
  commissionAmount: 79.9, role: '销售', owner: '销售甲', department: '销售部', status: '待确认',
  createdAt: now, updatedAt: now,
};
const recovery = {
  id: 'recovery-1', recoveryNo: 'RCV-001', thirdPartyOrderNo: 'TP-001', customerId: 'customer-2', customerName: '客户乙',
  customerMatchStatus: '手工填写', originalProduct: '899课程', originalAmount: 899, recoveryAmount: 2980,
  recoveryUserId: 'sales-1', recoveryUserName: '售后甲', status: '已分账', settlementStatus: '待发放',
  recoveryAttachments: [{ id: 'recovery-proof', name: '挽回凭证.png', mimeType: 'image/png', size: 16, category: 'recovery-payment-proof' }],
  createdBy: 'admin-1', createdByName: '超级管理员', createdAt: now, updatedAt: now,
};
const recoveryCommission = {
  ...commission, id: 'commission-recovery-1', orderId: recovery.id, orderNo: recovery.recoveryNo, customerName: recovery.customerName,
  commissionAmount: 298, sourceRecoveryOrderId: recovery.id, sourceBusinessType: 'after_sales_recovery', commissionType: 'recovery',
};

const auditEvents: any[] = [];
const records = [
  { domain: STORAGE_KEYS.ORDERS, recordId: order.id, data: order },
  { domain: STORAGE_KEYS.COMMISSIONS, recordId: commission.id, orderId: order.id, data: commission },
  { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: recovery.id, data: recovery },
  { domain: STORAGE_KEYS.COMMISSIONS, recordId: recoveryCommission.id, orderId: recovery.id, data: recoveryCommission },
];

const prisma: any = {
  user: { findMany: async () => [actor, { ...actor, id: 'sales-1', name: '销售甲', role: '销售顾问', roleId: 'role-sales' }] },
  role: { findMany: async () => [{ id: 'role-admin', name: '超级管理员', code: 'super_admin', permissions: actor.permissions, dataScopes: { orders: 'all', recoveryOrders: 'all' }, isActive: true }] },
  department: { findMany: async () => [] },
  businessRecord: {
    findMany: async ({ where }: any) => records.filter((row) => (
      (!where?.domain || row.domain === where.domain)
      && (!where?.orderId || (where.orderId.in ? where.orderId.in.includes(row.orderId) : row.orderId === where.orderId))
    )),
  },
  businessExportAudit: { create: async ({ data }: any) => { auditEvents.push(data); return data; } },
};

const service = createBusinessExportService(prisma, { now: () => new Date(now) });
const result = await service.export({
  module: 'orders', reason: '月度对账', columnMode: 'current_view', columnIds: ['orderNo', 'customerName', 'attachmentSummary'], filters: {},
}, actor);

assert.equal(result.code, 0);
assert.equal(result.data?.summaryRows.length, 1);
assert.deepEqual(result.data?.summaryRows[0], {
  orderNo: 'ORD-001', customerName: '客户甲', attachmentSummary: '成交凭证.png（1）',
});
assert.deepEqual(result.data?.detailRows[0], {
  orderNo: 'ORD-001', paymentOrderNo: 'PAY-1', amount: 799, paymentMethod: '对公转账', paidAt: now, voucherName: '付款凭证.png', attachmentCount: 0,
});
assert.equal(auditEvents.length, 1, '投影成功后必须写入审计事件');
assert.equal(auditEvents[0].module, 'orders');
assert.equal(auditEvents[0].actorId, actor.id);
assert.equal(auditEvents[0].summaryRowCount, 1);

const denied = await service.export({
  module: 'order_settlements', reason: '月度对账', columnMode: 'all', columnIds: [], filters: {},
}, { ...actor, permissions: [{ module: PERMISSION_KEYS.ORDER_EXPORT, actions: ['read'] }] });
assert.equal(denied.code, 403, '三个导出模块必须分别授权');

const invalidColumns = await service.export({
  module: 'orders', reason: '月度对账', columnMode: 'current_view', columnIds: ['id'], filters: {},
}, actor);
assert.equal(invalidColumns.code, 400, '内部标识不得导出');

const settlement = await service.export({
  module: 'order_settlements', reason: '月度对账', columnMode: 'current_view', columnIds: ['orderNo', 'totalCommissionAmount'], filters: { status: '待处理' },
}, actor);
assert.deepEqual(settlement.data?.summaryRows, [{ orderNo: 'ORD-001', totalCommissionAmount: 79.9 }]);
assert.equal(settlement.data?.detailRows.length, 1, '订单分账明细只能来自已筛选的订单');

const recoverySettlement = await service.export({
  module: 'recovery_settlements', reason: '售后复核', columnMode: 'current_view', columnIds: ['recoveryNo', 'attachmentSummary', 'splitDetails'], filters: { settlementStatus: '待发放' },
}, actor);
assert.deepEqual(recoverySettlement.data?.summaryRows, [{ recoveryNo: 'RCV-001', attachmentSummary: '挽回凭证.png（1）', splitDetails: '销售：销售甲 298' }]);
assert.equal(recoverySettlement.data?.detailRows[0]?.orderNo, 'RCV-001');
