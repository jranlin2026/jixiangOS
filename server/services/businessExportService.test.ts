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
  payments: [
    { id: 'payment-1', amount: 799, paymentMethod: '对公转账', paidAt: now, paymentOrderNo: 'PAY-1', voucherName: '付款凭证.png', attachments: [{ id: 'payment-proof', name: '付款附件.jpg' }] },
    { id: 'payment-2', amount: 100, paymentMethod: '对公转账', paidAt: now, paymentOrderNo: 'PAY-2', voucherName: '历史凭证.png', attachments: [] },
    { id: 'payment-3', amount: 100, paymentMethod: '对公转账', paidAt: now, paymentOrderNo: 'PAY-3', voucherName: '重复凭证.png', attachments: [{ id: 'payment-proof-duplicate', name: '重复凭证.png' }] },
  ],
  leadSource: '抖音', sourceName: '直播',
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
  id: 'recovery-1', recoveryNo: 'RCV-001', thirdPartyOrderNo: 'TP-001', customerId: 'customer-2', customerName: '客户乙', customerPhone: '13800138000', customerWechat: 'wx_recovery',
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
  paymentMethod: '对公转账', paidAt: now, voucherName: '付款凭证.png', attachmentNames: '付款凭证.png、付款附件.jpg', attachmentCount: 2, remark: null,
});
assert.deepEqual(result.data?.detailRows.slice(1).map((row) => [row.voucherName, row.attachmentNames, row.attachmentCount]), [
  ['历史凭证.png', '历史凭证.png', 1],
  ['重复凭证.png', '重复凭证.png', 1],
], '历史 voucherName 必须纳入附件数量，与新附件同名时去重');
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
  { domain: STORAGE_KEYS.COMMISSIONS, recordId: 'commission-cancelled', orderId: order.id, data: { ...commission, id: 'commission-cancelled', commissionAmount: 40, performanceAmount: 500, status: '已取消' } },
  { domain: STORAGE_KEYS.COMMISSIONS, recordId: 'commission-chargeback-pending', orderId: order.id, data: { ...commission, id: 'commission-chargeback-pending', commissionAmount: 50, performanceAmount: 500, status: '待冲销' } },
  { domain: STORAGE_KEYS.COMMISSIONS, recordId: 'commission-chargeback-done', orderId: order.id, data: { ...commission, id: 'commission-chargeback-done', commissionAmount: 60, performanceAmount: 500, status: '已冲销' } },
  { domain: STORAGE_KEYS.COMMISSIONS, recordId: 'commission-active-2', orderId: order.id, data: { ...commission, id: 'commission-active-2', role: '线索', commissionAmount: 10, performanceAmount: 600 } },
  { domain: STORAGE_KEYS.COMMISSION_OPERATION_LOGS, recordId: 'log-confirm', orderId: order.id, data: { id: 'log-confirm', orderId: order.id, orderNo: order.orderNo, customerName: order.customerName, action: '确认分账', operator: '财务甲', operatedAt: '2026-07-24T10:00:00.000Z', summary: '确认分账' } },
  { domain: STORAGE_KEYS.COMMISSION_OPERATION_LOGS, recordId: 'log-withdraw', orderId: order.id, data: { id: 'log-withdraw', orderId: order.id, orderNo: order.orderNo, customerName: order.customerName, action: '撤回提成', operator: '财务乙', operatedAt: '2026-07-24T11:00:00.000Z', reason: '金额有误', summary: '撤回提成' } },
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
  settlement.data?.detailRows.map((row) => row.status).sort(),
  ['已撤回', '已撤回', '已撤回', '待冲销', '已冲销', '待确认', '待确认'].sort(),
  '人员明细必须保留撤回、取消、异常和冲销留痕，并返回归一化状态',
);
assert.deepEqual(
  settlement.data?.detailColumns.map((column) => column.id),
  ['orderNo', 'customerName', 'orderAmount', 'role', 'owner', 'department', 'commissionAmount', 'performanceAmount', 'commissionRate', 'status', 'paymentDate', 'payoutPlanName', 'ruleCalculationType', 'formulaText', 'calculationNote', 'evidenceStatus', 'auditReason', 'confirmedAt', 'paidAt', 'withdrawStatus', 'withdrawReason'],
  '人员分账明细必须包含方案与计算依据字段',
);
assert.equal(settlement.data?.detailRows[0]?.orderAmount, 799);
assert.equal(settlement.data?.detailRows[0]?.confirmedAt, '2026-07-24T10:00:00.000Z');
assert.equal(settlement.data?.detailRows.find((row) => row.status === '已撤回')?.withdrawReason, '金额有误');
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
assert.equal(recoverySettlement.data?.detailRows[0]?.recoveryNo, 'RCV-001');
assert.equal(recoverySettlement.data?.detailRows[0]?.originalProduct, '899课程');
assert.equal(recoverySettlement.data?.detailRows[0]?.recoveryAmount, 2980);
assert.equal(recoverySettlement.data?.detailColumns[0]?.id, 'recoveryNo', '挽回分账明细必须使用独立字段集');
assert.equal(recoverySettlement.data?.detailColumns.some((column) => column.id === 'orderAmount'), false);
assert.equal((await service.export({ module: 'recovery_settlements', reason: '手机号搜索', columnMode: 'current_view', columnIds: ['recoveryNo'], filters: { search: '13800138000' } }, actor)).code, 0);
assert.equal((await service.export({ module: 'recovery_settlements', reason: '微信搜索', columnMode: 'current_view', columnIds: ['recoveryNo'], filters: { search: 'wx_recovery' } }, actor)).code, 0);

const recoveryOrders = await service.export({
  module: 'recovery_orders' as any,
  reason: '售后订单归档',
  columnMode: 'current_view',
  columnIds: ['recoveryNo', 'customerName', 'status', 'recoveryAmount'],
  filters: { search: 'RCV-001' },
}, actor);
assert.equal(recoveryOrders.code, 0, '售后挽回订单列表应支持独立导出');
const recoveryOrdersWithCustomizedView = await service.export({
  module: 'recovery_orders',
  reason: '自定义视图导出',
  columnMode: 'current_view',
  columnIds: [
    'recoveryNo', 'status', 'customerName', 'thirdPartyOrderNo', 'sourcePlatformShop',
    'originalProduct', 'originalProductLevel', 'originalAmount', 'recoveryAmount',
    'recoveryUserName', 'createdByName', 'recoveryAt', 'createdAt', 'customerPhone', 'customerWechat',
  ],
  filters: { search: 'RCV-001' },
}, actor);
assert.equal(
  recoveryOrdersWithCustomizedView.code,
  0,
  '售后挽回订单导出必须接受视图设置中的全部合法列表字段',
);
assert.deepEqual(recoveryOrders.data?.sheetNames, ['售后挽回订单汇总', '挽回凭证明细']);
assert.deepEqual(recoveryOrders.data?.summaryRows, [{
  recoveryNo: 'RCV-001', customerName: '客户乙', status: '待发放', recoveryAmount: 2980,
}]);
assert.equal(
  (await service.export({
    module: 'recovery_orders', reason: '分账状态筛选', columnMode: 'current_view', columnIds: ['recoveryNo'],
    filters: { settlementStatuses: ['待发放'], recoveryUserId: 'sales-1' },
  }, actor)).code,
  0,
  '售后挽回订单导出必须复用列表的分账状态和挽回人员筛选',
);
assert.equal(
  (await service.export({
    module: 'recovery_orders', reason: '不匹配筛选', columnMode: 'current_view', columnIds: ['recoveryNo'],
    filters: { settlementStatuses: ['待处理'], recoveryUserId: 'sales-1' },
  }, actor)).code,
  400,
  '售后挽回订单导出不得忽略列表筛选',
);
assert.deepEqual(recoveryOrders.data?.detailRows, [{
  recoveryNo: 'RCV-001', customerName: '客户乙', evidenceSequence: 1,
  fileName: '挽回凭证.png', mimeType: 'image/png', fileSize: 16,
}]);

const scopedActor: AuthenticatedUser = {
  ...actor,
  id: 'sales-1',
  name: '销售甲',
  role: '销售顾问',
  roleId: 'role-sales',
  permissions: [{ module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_EXPORT, actions: ['read'] }],
};
const scopedRecoveries = [
  recovery,
  { ...recovery, id: 'recovery-assist', recoveryNo: 'RCV-ASSIST', createdBy: 'admin-1', recoveryUserId: 'other-1', assistUserId: 'sales-1' },
  { ...recovery, id: 'recovery-created', recoveryNo: 'RCV-CREATED', createdBy: 'sales-1', recoveryUserId: 'other-1', assistUserId: '' },
];
const scopedPrisma: any = {
  ...prisma,
  user: { findMany: async () => [scopedActor, { ...actor, id: 'admin-1' }, { ...actor, id: 'other-1', roleId: 'role-other' }] },
  role: { findMany: async () => [{
    id: 'role-sales', name: '销售顾问', code: 'sales_consultant',
    permissions: scopedActor.permissions, dataScopes: { recoveryOrders: 'self' }, isActive: true,
  }] },
  businessRecord: {
    findMany: async ({ where }: any) => scopedRecoveries
      .map((item) => ({ domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: item.id, data: item }))
      .filter((row) => !where?.domain || row.domain === where.domain),
  },
  businessExportAudit: { create: async ({ data }: any) => data },
};
const scopedRecoveryExport = await createBusinessExportService(scopedPrisma, { now: () => new Date(now) }).export({
  module: 'recovery_orders', reason: '个人范围导出', columnMode: 'current_view', columnIds: ['recoveryNo'], filters: {},
}, scopedActor);
assert.deepEqual(
  scopedRecoveryExport.data?.summaryRows.map((row) => row.recoveryNo).sort(),
  ['RCV-001', 'RCV-ASSIST', 'RCV-CREATED'],
  '售后挽回订单导出应与列表一致，创建人、挽回人员或协助人员任一可见即允许导出',
);

assert.deepEqual(
  (await service.export({ module: 'orders', reason: '字段池检查', columnMode: 'all', filters: { search: 'ORD-001' } }, actor)).data?.summaryColumns.map((column) => column.id),
  ['orderNo', 'settlementStatus', 'customer', 'productName', 'productLevel', 'orderType', 'actualAmount', 'officialPaymentChannel', 'thirdPartyOrderNo', 'resourceOwnership', 'owner', 'createdByName', 'paymentDate', 'leadInputBy', 'leadContributorName', 'notes', 'createdAt', 'leadSourceFull', 'updatedAt'],
  '订单全部字段必须与 ORDER_COLUMNS 完全一致',
);
const orderAllFields = await service.export({ module: 'orders', reason: '全部字段值', columnMode: 'all', filters: { search: 'ORD-001' } }, actor);
assert.equal(orderAllFields.data?.summaryRows[0]?.leadSourceFull, '抖音 / 直播');
assert.equal(orderAllFields.data?.summaryRows[0]?.updatedAt, now);
assert.equal(orderAllFields.data?.summaryRows[0]?.settlementStatus, '待确认');
assert.equal(
  (await service.export({ module: 'orders', reason: '分账状态筛选', columnMode: 'current_view', columnIds: ['orderNo', 'settlementStatus'], filters: { settlementStatus: '待确认' } }, actor)).code,
  0,
);
assert.deepEqual(
  (await service.export({ module: 'order_settlements', reason: '字段池检查', columnMode: 'all', filters: { search: 'ORD-001' } }, actor)).data?.summaryColumns.map((column) => column.id),
  ['orderNo', 'status', 'customerName', 'thirdPartyOrderNo', 'productName', 'productLevel', 'orderAmount', 'officialPaymentChannel', 'paymentDate', 'salesOwner', 'createdByName', 'splitDetails', 'totalCommissionAmount', 'orderType', 'resourceOwnership', 'leadSourceFull', 'leadInputBy', 'leadContributorName', 'paymentOrderNo', 'notes', 'createdAt', 'updatedAt', 'performanceAmount', 'pendingAssignCount', 'exceptionCount', 'settlementOperator', 'confirmedAt', 'paidAt', 'withdrawReason'],
  '订单分账全部字段必须与 ORDER_SPLIT_COLUMNS 完全一致',
);
assert.equal(recoverySettlement.data?.summaryColumns.every((column) => !/^[A-Za-z]/.test(column.label)), true);
const recoveryAllFields = await service.export({ module: 'recovery_settlements', reason: '全部字段值', columnMode: 'all', filters: { search: 'RCV-001', settlementStatus: '待发放' } }, actor);
assert.equal(recoveryAllFields.data?.summaryColumns.find((column) => column.id === 'auditStatus')?.label, '审核状态');
assert.equal(recoveryAllFields.data?.summaryRows[0]?.status, '待发放', 'status 必须保留分账状态');
assert.equal(recoveryAllFields.data?.summaryRows[0]?.auditStatus, '已分账', 'auditStatus 必须投影挽回订单审核状态');
assert.equal(recoveryAllFields.data?.summaryRows[0]?.attachmentNames, '挽回凭证.png');
assert.equal(recoveryAllFields.data?.summaryRows[0]?.attachmentCount, 1);

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
const auditFailure = await noAuditService.export({ module: 'orders', reason: '审计检查', columnMode: 'current_view', columnIds: ['orderNo'], filters: { search: 'ORD-001' } }, actor);
assert.deepEqual(auditFailure, { code: 500, data: null, message: '业务导出服务暂时不可用' }, '审计失败必须阻止成功并返回脱敏 JSON 错误');

records.push({
  domain: STORAGE_KEYS.ORDERS,
  recordId: 'order-next-local-day',
  data: { ...order, id: 'order-next-local-day', orderNo: 'ORD-NEXT-DAY', createdAt: '2026-07-24T16:30:00.000Z', updatedAt: '2026-07-24T16:30:00.000Z' },
});
const localDateBoundary = await service.export({
  module: 'orders', reason: '本地日期检查', columnMode: 'current_view', columnIds: ['orderNo'], filters: { startDate: '2026-07-24', endDate: '2026-07-24' },
}, actor);
assert.deepEqual(localDateBoundary.data?.summaryRows.map((row) => row.orderNo).sort(), ['ORD-001', 'ORD-NO-COMMISSION'], '日期边界必须按 Asia/Shanghai 本地日历日计算');
