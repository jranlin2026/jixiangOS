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
  payments: [{ id: 'payment-1', amount: 799, paymentMethod: '对公转账', paidAt: now, paymentOrderNo: 'PAY-1', voucherName: '付款凭证.png', attachments: [{ id: 'payment-proof', name: '付款附件.jpg' }] }],
  dealEvidenceAttachments: [{ id: 'proof-1', name: '成交凭证.png', mimeType: 'image/png', size: 12, category: 'order-deal-evidence' }],
  createdAt: now, updatedAt: now,
};

const commission = {
  id: 'commission-1', orderId: order.id, orderNo: order.orderNo, customerName: order.customerName,
  productLevel: order.productLevel, orderAmount: order.actualAmount, commissionRate: 0.1,
  commissionAmount: 79.9, performanceAmount: 799, role: '销售', owner: '销售甲', ownerId: 'sales-1', department: '销售部', status: '待确认',
  payoutPlanId: 'plan-1', payoutPlanName: '标准销售方案', ruleCalculationType: 'percentage', formulaText: '799 × 10%', calculationNote: '标准销售提成', evidenceStatus: '已齐全',
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
const records: any[] = [
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
  module: 'orders', reason: '月度对账', columnMode: 'current_view', columnIds: ['orderNo', 'customer', 'notes'], filters: {},
}, actor);

assert.equal(result.code, 0);
assert.equal(result.data?.summaryRows.length, 1);
assert.deepEqual(result.data?.summaryRows[0], {
  orderNo: 'ORD-001', customer: '客户甲', notes: null,
});
assert.deepEqual(
  result.data?.summaryColumns.map((column) => column.label),
  ['订单号', '客户', '备注'],
  '服务端必须返回完整中文表头',
);
assert.deepEqual(result.data?.detailRows[0], {
  orderNo: 'ORD-001', customerName: '客户甲', paymentSequence: 1, paymentOrderNo: 'PAY-1', amount: 799,
  paymentMethod: '对公转账', paidAt: now, voucherName: '付款凭证.png', attachmentNames: '付款附件.jpg', attachmentCount: 1, remark: null,
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

records.push(
  { domain: STORAGE_KEYS.ORDERS, recordId: 'order-without-commission', data: { ...order, id: 'order-without-commission', orderNo: 'ORD-NO-COMMISSION' } },
  { domain: STORAGE_KEYS.COMMISSIONS, recordId: 'commission-withdrawn', orderId: order.id, data: { ...commission, id: 'commission-withdrawn', commissionAmount: 20, performanceAmount: 500, status: '已撤回' } },
  { domain: STORAGE_KEYS.COMMISSIONS, recordId: 'commission-legacy-exception', orderId: order.id, data: { ...commission, id: 'commission-legacy-exception', commissionAmount: 30, performanceAmount: 500, status: '异常' } },
  { domain: STORAGE_KEYS.COMMISSIONS, recordId: 'commission-active-2', orderId: order.id, data: { ...commission, id: 'commission-active-2', role: '线索', commissionAmount: 10, performanceAmount: 600 } },
);
const settlement = await service.export({
  module: 'order_settlements', reason: '月度对账', columnMode: 'current_view',
  columnIds: ['orderNo', 'splitDetails', 'totalCommissionAmount', 'performanceAmount', 'leadSourceFull', 'updatedAt'], filters: { status: '待确认' },
}, actor);
assert.equal(settlement.code, 0);
assert.equal(settlement.data?.summaryRows.length, 1, '订单分账只允许导出页面中由正式提成驱动的数据集');
assert.equal(settlement.data?.summaryRows[0]?.totalCommissionAmount, 89.9, '分账总额只统计有效提成');
assert.equal(settlement.data?.summaryRows[0]?.performanceAmount, 799, '业绩口径取有效提成最大值，不得累加');
assert.equal(settlement.data?.detailRows.some((row) => 'ownerId' in row), false, '固定明细不得泄露内部人员 ID');
assert.deepEqual(
  settlement.data?.detailColumns.map((column) => column.id),
  ['orderNo', 'customerName', 'role', 'owner', 'department', 'commissionAmount', 'performanceAmount', 'commissionRate', 'status', 'paymentDate', 'payoutPlanName', 'ruleCalculationType', 'formulaText', 'calculationNote', 'evidenceStatus', 'auditReason'],
  '人员分账明细必须包含方案与计算依据字段',
);
assert.equal(settlement.data?.summaryColumns.every((column) => !/^[A-Za-z]/.test(column.label)), true, '汇总表头必须全部中文');
assert.equal(settlement.data?.detailColumns.every((column) => !/^[A-Za-z]/.test(column.label)), true, '明细表头必须全部中文');

const oldCreatedOrder = {
  ...order, id: 'order-old-created', orderNo: 'ORD-OLD-CREATED', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: now,
};
records.push(
  { domain: STORAGE_KEYS.ORDERS, recordId: oldCreatedOrder.id, data: oldCreatedOrder },
  { domain: STORAGE_KEYS.COMMISSIONS, recordId: 'commission-old-created', orderId: oldCreatedOrder.id, data: { ...commission, id: 'commission-old-created', orderId: oldCreatedOrder.id, orderNo: oldCreatedOrder.orderNo, paymentDate: now } },
);
const settlementPaymentDateFilter = await service.export({
  module: 'order_settlements', reason: '付款日期口径', columnMode: 'current_view', columnIds: ['orderNo'],
  filters: { search: 'ORD-OLD-CREATED', startDate: '2026-07-24', endDate: '2026-07-24' },
}, actor);
assert.equal(settlementPaymentDateFilter.code, 0, '订单分账日期筛选必须使用付款时间，不得先按订单创建时间剔除');

const recoverySettlement = await service.export({
  module: 'recovery_settlements', reason: '售后复核', columnMode: 'current_view', columnIds: ['recoveryNo', 'splitDetails', 'totalCommissionAmount'], filters: { settlementStatus: '待发放' },
}, actor);
assert.deepEqual(recoverySettlement.data?.summaryRows, [{ recoveryNo: 'RCV-001', splitDetails: '销售：销售甲 298', totalCommissionAmount: 298 }]);
assert.equal(recoverySettlement.data?.detailRows[0]?.orderNo, 'RCV-001');

assert.deepEqual(
  (await service.export({ module: 'orders', reason: '字段池检查', columnMode: 'all', filters: { search: 'ORD-001' } }, actor)).data?.summaryColumns.map((column) => column.id),
  ['orderNo', 'status', 'customer', 'productName', 'productLevel', 'orderType', 'actualAmount', 'officialPaymentChannel', 'thirdPartyOrderNo', 'resourceOwnership', 'owner', 'createdByName', 'paymentDate', 'leadInputBy', 'leadContributorName', 'notes', 'createdAt'],
  '订单全部字段必须与 ORDER_COLUMNS 完全一致',
);
assert.deepEqual(
  (await service.export({ module: 'order_settlements', reason: '字段池检查', columnMode: 'all', filters: { search: 'ORD-001' } }, actor)).data?.summaryColumns.map((column) => column.id),
  ['orderNo', 'status', 'customerName', 'thirdPartyOrderNo', 'productName', 'productLevel', 'orderAmount', 'officialPaymentChannel', 'paymentDate', 'salesOwner', 'createdByName', 'splitDetails', 'totalCommissionAmount', 'orderType', 'resourceOwnership', 'leadSourceFull', 'leadInputBy', 'leadContributorName', 'paymentOrderNo', 'notes', 'createdAt', 'updatedAt', 'performanceAmount', 'pendingAssignCount', 'exceptionCount', 'settlementOperator', 'confirmedAt', 'paidAt', 'withdrawReason'],
  '订单分账全部字段必须与 ORDER_SPLIT_COLUMNS 完全一致',
);
assert.equal(recoverySettlement.data?.summaryColumns.every((column) => !/^[A-Za-z]/.test(column.label)), true);

records.push(
  { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: 'recovery-deleted', data: { ...recovery, id: 'recovery-deleted', recoveryNo: 'RCV-DELETED', deletedAt: now } },
  { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: 'recovery-cleaned', data: { ...recovery, id: 'recovery-cleaned', recoveryNo: 'RCV-CLEANED', settlementCleanedAt: now } },
);
const recoveryDeletedBehavior = await service.export({
  module: 'recovery_settlements', reason: '删除口径', columnMode: 'current_view', columnIds: ['recoveryNo'],
  filters: { settlementStatus: '待发放', includeDeleted: true },
}, actor);
assert.deepEqual(recoveryDeletedBehavior.data?.summaryRows.map((row) => row.recoveryNo).sort(), ['RCV-001', 'RCV-DELETED'], '财务页允许已删除源记录，但必须排除已清理分账');

const empty = await service.export({
  module: 'orders', reason: '空结果检查', columnMode: 'current_view', columnIds: ['orderNo'], filters: { search: '绝不存在的订单' },
}, actor);
assert.equal(empty.code, 400, '空结果必须由后端拒绝');

const noAuditService = createBusinessExportService({ ...prisma, businessExportAudit: undefined } as any, { now: () => new Date(now) });
await assert.rejects(
  () => noAuditService.export({ module: 'orders', reason: '审计检查', columnMode: 'current_view', columnIds: ['orderNo'], filters: { search: 'ORD-001' } }, actor),
  '审计写入必须是成功导出的强制步骤',
);

records.push({
  domain: STORAGE_KEYS.ORDERS,
  recordId: 'order-next-local-day',
  data: { ...order, id: 'order-next-local-day', orderNo: 'ORD-NEXT-DAY', createdAt: '2026-07-24T16:30:00.000Z', updatedAt: '2026-07-24T16:30:00.000Z' },
});
const localDateBoundary = await service.export({
  module: 'orders', reason: '本地日期检查', columnMode: 'current_view', columnIds: ['orderNo'], filters: { startDate: '2026-07-24', endDate: '2026-07-24' },
}, actor);
assert.deepEqual(localDateBoundary.data?.summaryRows.map((row) => row.orderNo).sort(), ['ORD-001', 'ORD-NO-COMMISSION'], '日期边界必须按 Asia/Shanghai 本地日历日计算');
