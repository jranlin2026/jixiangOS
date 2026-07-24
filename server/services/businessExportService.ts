import type { PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { buildDataVisibilityScopeForUser } from '../../src/shared/utils/dataVisibility';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Commission } from '../../src/types/commission';
import type { CommissionOperationLog } from '../../src/types/commission';
import type { BusinessExportColumn, BusinessExportModule, BusinessExportRequest, BusinessExportResult, BusinessExportRow } from '../../src/types/businessExport';
import type { Order } from '../../src/types/order';
import type { RecoveryOrder } from '../../src/types/recoveryOrder';
import { formatLeadSourcePath, getActiveCommissions, summarizeCommissionProcessing } from '../../src/shared/utils/financeSettlementPresentation';
import { getRecoveryEvidenceAttachments } from '../../src/shared/utils/recoveryEvidence';

type BusinessExportPrisma = Pick<PrismaClient, 'businessRecord' | 'user' | 'role' | 'department'> & {
  businessExportAudit: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
};

const MAX_SUMMARY_ROWS = 10_000;
const EXPORT_PERMISSION: Record<BusinessExportModule, string> = {
  orders: PERMISSION_KEYS.ORDER_EXPORT,
  order_settlements: PERMISSION_KEYS.ORDER_SETTLEMENT_EXPORT,
  recovery_settlements: PERMISSION_KEYS.RECOVERY_SETTLEMENT_EXPORT,
};
const SHEETS: Record<BusinessExportModule, [string, string]> = {
  orders: ['订单汇总', '付款明细'],
  order_settlements: ['订单分账汇总', '人员分账明细'],
  recovery_settlements: ['售后挽回分账汇总', '人员分账明细'],
};
const FILENAMES: Record<BusinessExportModule, string> = {
  orders: '订单导出',
  order_settlements: '订单分账导出',
  recovery_settlements: '售后挽回分账导出',
};
const col = (id: string, label: string, type: BusinessExportColumn['type'] = 'text'): BusinessExportColumn => ({ id, label, type });
const ORDER_COLUMNS = [
  col('orderNo', '订单号'), col('status', '订单状态'), col('customer', '客户'), col('productName', '产品名称'),
  col('productLevel', '产品等级'), col('orderType', '订单类型'), col('actualAmount', '实付金额', 'currency'),
  col('officialPaymentChannel', '官方收款渠道'), col('thirdPartyOrderNo', '第三方平台订单'), col('resourceOwnership', '资源归属'),
  col('owner', '销售负责人'), col('createdByName', '订单创建人'), col('paymentDate', '付款时间', 'date'),
  col('leadInputBy', '线索录入人'), col('leadContributorName', '线索贡献人'), col('notes', '备注'), col('createdAt', '创建时间', 'date'),
];
const ORDER_ALL_COLUMNS = [
  ...ORDER_COLUMNS,
  col('leadSourceFull', '线索来源'),
  col('updatedAt', '更新时间', 'date'),
];
const ORDER_SETTLEMENT_COLUMNS = [
  col('orderNo', '订单号'), col('status', '分账状态'), col('customerName', '客户'), col('thirdPartyOrderNo', '第三方平台订单'),
  col('productName', '产品名称'), col('productLevel', '产品等级'), col('orderAmount', '实付金额', 'currency'),
  col('officialPaymentChannel', '官方收款渠道'), col('paymentDate', '付款时间', 'date'), col('salesOwner', '销售负责人'),
  col('createdByName', '订单创建人'), col('splitDetails', '分账明细'), col('totalCommissionAmount', '分账总额', 'currency'),
  col('orderType', '订单类型'), col('resourceOwnership', '资源归属'), col('leadSourceFull', '线索来源'), col('leadInputBy', '线索录入人'),
  col('leadContributorName', '线索贡献人'), col('paymentOrderNo', '付款订单号'), col('notes', '备注'),
  col('createdAt', '订单创建时间', 'date'), col('updatedAt', '分账更新时间', 'date'), col('performanceAmount', '业绩计算金额', 'currency'),
  col('pendingAssignCount', '待分配人数', 'number'), col('exceptionCount', '已撤回人数', 'number'), col('settlementOperator', '分账经办人'),
  col('confirmedAt', '确认时间', 'date'), col('paidAt', '发放时间', 'date'), col('withdrawReason', '撤回原因'),
];
const RECOVERY_SETTLEMENT_COLUMNS = [
  col('recoveryNo', '挽回订单号'), col('status', '分账状态'), col('customerName', '客户'), col('thirdPartyOrderNo', '第三方平台订单'),
  col('sourcePlatformShop', '来源平台 / 店铺'), col('originalProduct', '原产品'), col('originalProductLevel', '原产品等级'),
  col('originalAmount', '原付款金额', 'currency'), col('recoveryAmount', '挽回成交金额', 'currency'), col('officialPaymentChannel', '官方收款渠道'),
  col('paymentAt', '付款时间', 'date'), col('recoveryUserName', '挽回人员'), col('createdByName', '订单创建人'), col('splitDetails', '分账明细'),
  col('totalCommissionAmount', '分账总额', 'currency'), col('customerPhone', '手机号'), col('customerWechat', '微信'),
  col('customerMatchStatus', '客户匹配状态'), col('sourcePlatform', '来源平台'), col('sourceShop', '来源店铺'), col('paymentOrderNo', '付款订单号'),
  col('recoveryAt', '挽回成交时间', 'date'), col('assistUserName', '协助人员'), col('auditorName', '审核人'), col('auditedAt', '审核时间', 'date'),
  col('remark', '备注'), col('createdAt', '创建时间', 'date'), col('updatedAt', '更新时间', 'date'), col('performanceAmount', '业绩计算金额', 'currency'),
  col('settlementHandledBy', '分账经办人'), col('settlementConfirmedAt', '确认时间', 'date'), col('settlementPaidAt', '发放时间', 'date'),
  col('settlementWithdrawReason', '撤回原因'),
];
const RECOVERY_SETTLEMENT_ALL_COLUMNS = [
  ...RECOVERY_SETTLEMENT_COLUMNS,
  col('auditStatus', '审核状态'),
  col('attachmentNames', '挽回凭证文件名'),
  col('attachmentCount', '挽回凭证数量', 'number'),
];
const ORDER_PAYMENT_DETAIL_COLUMNS = [
  col('orderNo', '订单号'), col('customerName', '客户'), col('paymentSequence', '付款序号', 'number'), col('paymentOrderNo', '付款订单号'),
  col('amount', '付款金额', 'currency'), col('paymentMethod', '支付方式'), col('paidAt', '付款时间', 'date'), col('voucherName', '凭证文件名'),
  col('attachmentNames', '附件文件名'), col('attachmentCount', '附件数量', 'number'), col('remark', '付款备注'),
];
const ORDER_SETTLEMENT_DETAIL_COLUMNS = [
  col('orderNo', '订单号'), col('customerName', '客户'), col('orderAmount', '实付金额', 'currency'), col('role', '分账角色'), col('owner', '分账人员'), col('department', '所属部门'),
  col('commissionAmount', '分账金额', 'currency'), col('performanceAmount', '业绩计算金额', 'currency'), col('commissionRate', '提成比例', 'number'),
  col('status', '分账状态'), col('paymentDate', '付款时间', 'date'), col('payoutPlanName', '提成方案'), col('ruleCalculationType', '计算类型'),
  col('formulaText', '计算公式'), col('calculationNote', '计算说明'), col('evidenceStatus', '凭证校验状态'), col('auditReason', '审核原因'),
  col('confirmedAt', '确认时间', 'date'), col('paidAt', '发放时间', 'date'), col('withdrawStatus', '撤回状态'), col('withdrawReason', '撤回原因'),
];
const RECOVERY_SETTLEMENT_DETAIL_COLUMNS = [
  col('recoveryNo', '挽回订单号'), col('customerName', '客户'), col('originalProduct', '原产品'), col('recoveryAmount', '挽回成交金额', 'currency'),
  col('role', '分账角色'), col('owner', '分账人员'), col('department', '所属部门'), col('commissionAmount', '分账金额', 'currency'),
  col('performanceAmount', '业绩计算金额', 'currency'), col('commissionRate', '提成比例', 'number'), col('status', '分账状态'),
  col('paymentDate', '付款时间', 'date'), col('payoutPlanName', '提成方案'), col('ruleCalculationType', '计算类型'), col('formulaText', '计算公式'),
  col('calculationNote', '计算说明'), col('evidenceStatus', '凭证校验状态'), col('auditReason', '审核原因'), col('confirmedAt', '确认时间', 'date'),
  col('paidAt', '发放时间', 'date'), col('withdrawStatus', '撤回状态'), col('withdrawReason', '撤回原因'),
];

export class BusinessExportError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'BusinessExportError';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try { return asRecord(JSON.parse(value)); } catch { return null; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function clean(value: unknown): string { return String(value ?? '').trim(); }
function isModule(value: unknown): value is BusinessExportModule { return ['orders', 'order_settlements', 'recovery_settlements'].includes(String(value)); }
function dateToken(value: Date): string { return value.toISOString().slice(0, 10).replace(/-/g, ''); }
function timestamp(value: unknown): number { const parsed = new Date(String(value || '')).getTime(); return Number.isFinite(parsed) ? parsed : 0; }
function localBoundary(value: string, end: boolean): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return timestamp(value);
  const [year, month, day] = value.split('-').map(Number);
  const shanghaiStart = Date.UTC(year, month - 1, day, -8, 0, 0, 0);
  return end ? shanghaiStart + 24 * 60 * 60 * 1000 - 1 : shanghaiStart;
}
function inRange(value: unknown, start?: string, end?: string): boolean {
  const time = timestamp(value);
  if (start && time < localBoundary(start, false)) return false;
  if (end && time > localBoundary(end, true)) return false;
  return true;
}
function attachmentCount(attachments: unknown): number { return Array.isArray(attachments) ? attachments.length : 0; }
function commissionIssueText(commission: Commission): string {
  return [commission.auditReason, commission.frozenReason, commission.calculationNote, commission.formulaText, commission.payoutPlanName].filter(Boolean).join('；');
}
function pendingHandling(commission: Commission): boolean {
  const issueText = commissionIssueText(commission);
  const manual = commission.isManualAdjusted || commission.sourceType === '人工新增' || /自定义金额|财务人工|人工新增/.test(issueText);
  const resolved = Boolean(commission.payoutPlanId || commission.payoutPlanName || manual);
  return commission.owner === '待分配' || !commission.ownerId || Boolean(commission.frozenReason) || issueText.includes('冻结') || !resolved
    || (Number(commission.commissionAmount || 0) === 0 && /未匹配|未命中|暂不计算|缺少|不可用/.test(issueText));
}
function settlementStatus(commissions: Commission[]): string {
  if (!commissions.length || commissions.some(pendingHandling)) return '待处理';
  if (commissions.every((item) => ['已撤回', '待冲销', '已冲销', '已取消'].includes(item.status))) return '已撤回';
  if (commissions.every((item) => item.status === '已发放')) return '已发放';
  if (commissions.every((item) => item.status === '待发放' || item.status === '已发放')) return '待发放';
  return '待确认';
}
function recoveryStatus(order: RecoveryOrder): string {
  const value = clean(order.settlementStatus);
  if (value === '待分账') return '待处理';
  if (value === '已分账') return '待发放';
  return value || (order.status === '已分账' ? '待发放' : order.status === '待分账' ? '待处理' : '未分账');
}
function normalizeCommissionForExport(commission: Commission): Commission {
  const rawStatus = String(commission.status);
  if (rawStatus === '待审核') return { ...commission, status: '待确认' };
  if (rawStatus === '已取消' || rawStatus === '异常') return { ...commission, status: '已撤回' };
  return commission;
}
function isInactiveCommission(commission: Commission): boolean {
  return ['已撤回', '待冲销', '已冲销'].includes(String(commission.status));
}

function validateRequest(input: BusinessExportRequest): Required<Pick<BusinessExportRequest, 'module' | 'reason' | 'columnMode' | 'filters'>> & { columnIds: string[] } {
  if (!input || typeof input !== 'object' || !isModule(input.module)) throw new BusinessExportError(400, '导出模块无效');
  const reason = clean(input.reason);
  if (!reason) throw new BusinessExportError(400, '请填写导出原因');
  if (input.columnMode !== 'current_view' && input.columnMode !== 'all') throw new BusinessExportError(400, '导出列模式无效');
  if (input.columnIds !== undefined && (!Array.isArray(input.columnIds) || input.columnIds.some((column) => typeof column !== 'string'))) throw new BusinessExportError(400, '导出列无效');
  if (!asRecord(input.filters)) throw new BusinessExportError(400, '导出筛选条件无效');
  const allowlist = (input.module === 'orders' ? ORDER_COLUMNS : input.module === 'order_settlements' ? ORDER_SETTLEMENT_COLUMNS : RECOVERY_SETTLEMENT_COLUMNS).map((column) => column.id);
  const columnIds = input.columnIds || [];
  if (input.columnMode === 'current_view' && (!columnIds.length || columnIds.some((column) => !allowlist.includes(column)))) {
    throw new BusinessExportError(400, '导出列包含不允许的字段');
  }
  return { module: input.module, reason, columnMode: input.columnMode, columnIds, filters: input.filters };
}

function project(row: Record<string, unknown>, columns: string[]): BusinessExportRow {
  return Object.fromEntries(columns.map((column) => [column, row[column] as BusinessExportRow[string] ?? null]));
}

function nonNull<T>(value: T | null): value is T { return value !== null; }
function defined<T>(value: T | undefined): value is T { return value !== undefined; }
function selectColumns(pool: BusinessExportColumn[], ids: string[]): BusinessExportColumn[] {
  const byId = new Map(pool.map((column) => [column.id, column]));
  return ids.map((id) => byId.get(id)).filter(defined);
}

export function createBusinessExportService(prisma: BusinessExportPrisma, options: { now?: () => Date } = {}) {
  const now = options.now || (() => new Date());
  const exportRows = async (input: BusinessExportRequest, actor: AuthenticatedUser): Promise<ApiResponse<BusinessExportResult | null>> => {
    try {
      const request = validateRequest(input);
      if (!hasPermission(actor, EXPORT_PERMISSION[request.module], 'read')) throw new BusinessExportError(403, '无权导出当前业务数据');
      const [users, roles, departments, rows] = await Promise.all([
        prisma.user.findMany(), prisma.role.findMany({ where: { isActive: true } }), prisma.department.findMany(),
        prisma.businessRecord.findMany({ where: { domain: request.module === 'recovery_settlements' ? STORAGE_KEYS.RECOVERY_ORDERS : STORAGE_KEYS.ORDERS } }),
      ]);
      const scope = buildDataVisibilityScopeForUser(actor as any, users as any, roles as any, departments as any,
        request.module === 'recovery_settlements' ? 'recoveryOrders' : 'orders');
      const filters = request.filters as Record<string, unknown>;
      let sourceOrders: Order[] = [];
      let sourceRecoveryOrders: RecoveryOrder[] = [];
      if (request.module === 'recovery_settlements') {
        sourceRecoveryOrders = rows.map((row) => asRecord((row as any).data) as RecoveryOrder | null).filter(nonNull)
          .filter((order) => !order.settlementCleanedAt && (Boolean(filters.includeDeleted) || !order.deletedAt))
          .filter((order) => scope.unrestricted || (order.createdBy ? scope.visibleUserIds.includes(order.createdBy) : scope.visibleUserNames.includes(order.createdByName)))
          .filter((order) => {
            const search = clean(filters.search).toLocaleLowerCase();
            return (!search || [order.recoveryNo, order.thirdPartyOrderNo, order.customerName, order.originalProduct, order.recoveryUserName]
              .some((value) => clean(value).toLocaleLowerCase().includes(search)))
              && (!filters.settlementStatus || filters.settlementStatus === '全部' || recoveryStatus(order) === filters.settlementStatus)
              && (!Array.isArray(filters.settlementStatuses) || !filters.settlementStatuses.length || filters.settlementStatuses.includes(recoveryStatus(order)))
              && (!Array.isArray(filters.statuses) || !filters.statuses.length || filters.statuses.includes(order.status))
              && (Array.isArray(filters.statuses) || !filters.status || filters.status === '全部' || filters.status === order.status)
              && (!filters.ownerId || [order.createdBy, order.recoveryUserId, order.assistUserId].includes(String(filters.ownerId)));
          })
          .sort((left, right) => timestamp(right.updatedAt || right.createdAt) - timestamp(left.updatedAt || left.createdAt));
      } else {
        sourceOrders = rows.map((row) => asRecord((row as any).data) as Order | null).filter(nonNull)
          .filter((order) => request.module === 'order_settlements' || !order.deletedAt)
          .filter((order) => scope.unrestricted || (order.salesId ? scope.visibleUserIds.includes(order.salesId) : scope.visibleUserNames.includes(order.salesName || order.owner)))
          .filter((order) => {
            const search = clean(filters.search).toLocaleLowerCase();
            return (!search || [order.orderNo, order.customerName, order.productName, order.salesName, order.owner].some((value) => clean(value).toLocaleLowerCase().includes(search)))
              && (request.module !== 'orders' || !filters.status || filters.status === '全部' || order.status === filters.status)
              && (request.module !== 'orders' || !filters.customerId || order.customerId === filters.customerId)
              && (!filters.owner || order.owner === filters.owner || order.salesName === filters.owner)
              && (!filters.productLevel || order.productLevel === filters.productLevel)
              && (!filters.orderType || order.orderType === filters.orderType)
              && (!filters.paymentMethod || order.paymentMethod === filters.paymentMethod)
              && (request.module !== 'orders' || inRange(order.createdAt, clean(filters.startDate) || undefined, clean(filters.endDate) || undefined));
          })
          .sort((left, right) => {
            const direction = filters.sortDirection === 'asc' ? 1 : -1;
            const leftTime = filters.sortBy === 'paymentDate' ? timestamp(left.payments?.[0]?.paidAt || left.createdAt) : timestamp(left.updatedAt || left.createdAt);
            const rightTime = filters.sortBy === 'paymentDate' ? timestamp(right.payments?.[0]?.paidAt || right.createdAt) : timestamp(right.updatedAt || right.createdAt);
            return direction * (leftTime - rightTime) || left.id.localeCompare(right.id);
          });
      }
      const selectedOrderIds = new Set(request.module === 'recovery_settlements' ? sourceRecoveryOrders.map((order) => order.id) : sourceOrders.map((order) => order.id));
      const commissionRows = selectedOrderIds.size
        ? await prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSIONS, orderId: { in: Array.from(selectedOrderIds) } } })
        : [];
      const commissions = commissionRows.map((row) => asRecord((row as any).data) as Commission | null).filter(nonNull).map(normalizeCommissionForExport)
        .filter((commission) => selectedOrderIds.has(commission.orderId))
        .filter((commission) => request.module !== 'order_settlements' || (!commission.sourceRecoveryOrderId && commission.sourceBusinessType !== 'after_sales_recovery'))
        .filter((commission) => request.module !== 'recovery_settlements' || commission.sourceRecoveryOrderId || commission.sourceBusinessType === 'after_sales_recovery');
      const byOrder = new Map<string, Commission[]>();
      commissions.forEach((commission) => byOrder.set(commission.orderId, [...(byOrder.get(commission.orderId) || []), commission]));
      const operationLogRows = request.module === 'order_settlements' && selectedOrderIds.size
        ? await prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSION_OPERATION_LOGS, orderId: { in: Array.from(selectedOrderIds) } } })
        : [];
      const operationLogs = operationLogRows.map((row) => asRecord((row as any).data) as CommissionOperationLog | null).filter(nonNull);
      const logsByOrder = new Map<string, CommissionOperationLog[]>();
      operationLogs.forEach((log) => logsByOrder.set(log.orderId, [...(logsByOrder.get(log.orderId) || []), log]));
      if (request.module === 'order_settlements') {
        sourceOrders = sourceOrders.filter((order) => {
          const splits = byOrder.get(order.id) || [];
          if (!splits.length) return false;
          const paymentDate = splits[0]?.paymentDate || order.payments?.[0]?.paidAt || order.createdAt;
          return (!filters.search || [order.orderNo, order.customerName].some((value) => clean(value).toLocaleLowerCase().includes(clean(filters.search).toLocaleLowerCase())))
            && (!filters.status || filters.status === '全部' || settlementStatus(splits) === filters.status)
            && (!filters.ownerId || splits.some((commission) => commission.ownerId === filters.ownerId))
            && (!filters.role || splits.some((commission) => commission.role === filters.role))
            && (!filters.month || String(paymentDate).startsWith(String(filters.month)))
            && inRange(paymentDate, clean(filters.startDate) || undefined, clean(filters.endDate) || undefined);
        }).sort((left, right) => {
          const leftSplits = byOrder.get(left.id) || [];
          const rightSplits = byOrder.get(right.id) || [];
          return timestamp(rightSplits[0]?.paymentDate || right.payments?.[0]?.paidAt || right.createdAt)
            - timestamp(leftSplits[0]?.paymentDate || left.payments?.[0]?.paidAt || left.createdAt);
        });
      }
      const summaryCount = request.module === 'recovery_settlements' ? sourceRecoveryOrders.length : sourceOrders.length;
      if (!summaryCount) throw new BusinessExportError(400, '当前筛选条件下没有可导出的数据');
      if (summaryCount > MAX_SUMMARY_ROWS) throw new BusinessExportError(400, `导出结果超过 ${MAX_SUMMARY_ROWS} 行上限`);
      const exportedOrderIds = new Set(request.module === 'recovery_settlements' ? sourceRecoveryOrders.map((order) => order.id) : sourceOrders.map((order) => order.id));
      const summaryColumnPool = request.module === 'orders' ? ORDER_ALL_COLUMNS
        : request.module === 'order_settlements' ? ORDER_SETTLEMENT_COLUMNS : RECOVERY_SETTLEMENT_ALL_COLUMNS;
      const columns = request.columnMode === 'all' ? summaryColumnPool.map((column) => column.id) : request.columnIds;
      const summaryRows = request.module === 'orders'
        ? sourceOrders.map((order) => project({
          orderNo: order.orderNo, status: order.status, customer: order.customerName,
          productName: order.productName || order.productLevel, productLevel: order.productLevel, orderType: order.orderType,
          actualAmount: order.actualAmount,
          officialPaymentChannel: order.officialPaymentChannel, thirdPartyOrderNo: order.thirdPartyOrderNo, resourceOwnership: order.resourceOwnership,
          owner: order.salesName || order.owner, createdByName: order.createdByName, paymentDate: order.payments?.[0]?.paidAt || order.createdAt,
          leadInputBy: order.leadInputBy, leadContributorName: order.leadContributorName, notes: order.notes, createdAt: order.createdAt,
          leadSourceFull: formatLeadSourcePath(order), updatedAt: order.updatedAt,
        }, columns))
        : request.module === 'order_settlements'
          ? sourceOrders.map((order) => {
            const splits = byOrder.get(order.id) || [];
            const activeSplits = getActiveCommissions(splits);
            const processing = summarizeCommissionProcessing(splits, logsByOrder.get(order.id) || []);
            const paymentDate = splits[0]?.paymentDate || order.payments?.[0]?.paidAt || order.createdAt;
            const latestPayment = [...(order.payments || [])].sort((left, right) => timestamp(right.paidAt) - timestamp(left.paidAt))[0];
            const updateDates = [...splits.map((item) => item.updatedAt), ...(logsByOrder.get(order.id) || []).map((log) => log.operatedAt)].filter(Boolean).sort();
            return project({ orderNo: order.orderNo, customerName: order.customerName, productName: order.productName || order.productLevel,
              productLevel: order.productLevel, orderType: order.orderType, paymentDate,
              orderAmount: order.actualAmount || order.amount, status: settlementStatus(splits), salesOwner: order.salesName || order.owner,
              resourceOwnership: order.resourceOwnership, totalCommissionAmount: processing.totalCommissionAmount,
              performanceAmount: processing.performanceAmount, pendingAssignCount: splits.filter((item) => item.owner === '待分配' || !item.ownerId).length,
              exceptionCount: processing.withdrawnCount, settlementOperator: processing.settlementOperator, confirmedAt: processing.confirmedAt, paidAt: processing.paidAt,
              withdrawReason: processing.withdrawReason, splitDetails: activeSplits.map((item) => `${item.role}：${item.owner || '-'} ${item.commissionAmount}`).join('；'),
              thirdPartyOrderNo: order.thirdPartyOrderNo, officialPaymentChannel: order.officialPaymentChannel, createdByName: order.createdByName,
              leadSourceFull: formatLeadSourcePath(order), leadInputBy: order.leadInputBy, leadContributorName: order.leadContributorName,
              paymentOrderNo: latestPayment?.paymentOrderNo, notes: order.notes, createdAt: order.createdAt || splits[0]?.createdAt,
              updatedAt: updateDates[updateDates.length - 1], }, columns);
          })
          : sourceRecoveryOrders.map((order) => {
            const splits = byOrder.get(order.id) || [];
            const activeSplits = getActiveCommissions(splits);
            const attachments = getRecoveryEvidenceAttachments(order);
            const totalCommissionAmount = Math.round(activeSplits.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0) * 100) / 100;
            const performanceAmount = Math.max(0, ...activeSplits.map((item) => Number(item.performanceAmount || 0)));
            return project({ recoveryNo: order.recoveryNo, status: recoveryStatus(order), auditStatus: order.status, customerName: order.customerName, thirdPartyOrderNo: order.thirdPartyOrderNo,
              sourcePlatformShop: [order.sourcePlatformName || order.sourcePlatform, order.sourceShopName].filter(Boolean).join(' / '),
              originalProduct: order.originalProduct, originalProductLevel: order.originalProductLevel, originalAmount: order.originalAmount, recoveryAmount: order.recoveryAmount,
              officialPaymentChannel: order.officialPaymentChannel, paymentAt: order.paymentAt, recoveryUserName: order.recoveryUserName, createdByName: order.createdByName,
              totalCommissionAmount, performanceAmount,
              settlementHandledBy: order.settlementHandledBy, settlementConfirmedAt: order.settlementConfirmedAt, settlementPaidAt: order.settlementPaidAt,
              settlementWithdrawReason: order.settlementWithdrawReason,
              splitDetails: activeSplits.map((item) => `${item.role}：${item.owner} ${item.commissionAmount}`).join('；'), customerPhone: order.customerPhone,
              customerWechat: order.customerWechat, customerMatchStatus: order.customerMatchStatus, sourcePlatform: order.sourcePlatformName || order.sourcePlatform,
              sourceShop: order.sourceShopName, paymentOrderNo: order.paymentOrderNo, recoveryAt: order.recoveryAt, assistUserName: order.assistUserName,
              auditorName: order.auditorName, auditedAt: order.auditedAt, remark: order.remark, createdAt: order.createdAt, updatedAt: order.updatedAt,
              attachmentNames: attachments.map((attachment) => attachment.name).filter(Boolean).join('、') || null,
              attachmentCount: attachments.length, }, columns);
          });
      const detailRows = request.module === 'orders'
        ? sourceOrders.flatMap((order) => (order.payments || []).map((payment, index) => ({ orderNo: order.orderNo, customerName: order.customerName,
          paymentSequence: index + 1, paymentOrderNo: payment.paymentOrderNo || null, amount: payment.amount, paymentMethod: payment.paymentMethod,
          paidAt: payment.paidAt, voucherName: payment.voucherName || null,
          attachmentNames: (payment.attachments || []).map((attachment) => attachment.name).filter(Boolean).join('、') || null,
          attachmentCount: attachmentCount(payment.attachments), remark: payment.remark || null })))
        : commissions.filter((commission) => exportedOrderIds.has(commission.orderId)).map((commission) => {
          const inactive = isInactiveCommission(commission);
          const common = {
            customerName: commission.customerName, role: commission.role, owner: commission.owner,
            department: commission.department, commissionAmount: commission.commissionAmount, performanceAmount: commission.performanceAmount || null,
            commissionRate: commission.commissionRate, status: commission.status, paymentDate: commission.paymentDate || null,
            payoutPlanName: commission.payoutPlanName || null, ruleCalculationType: commission.ruleCalculationType || null,
            formulaText: commission.formulaText || null, calculationNote: commission.calculationNote || null,
            evidenceStatus: commission.evidenceStatus || null, auditReason: commission.auditReason || null,
          };
          if (request.module === 'order_settlements') {
            const order = sourceOrders.find((item) => item.id === commission.orderId);
            const processing = summarizeCommissionProcessing(byOrder.get(commission.orderId) || [], logsByOrder.get(commission.orderId) || []);
            return {
              ...common, orderNo: order?.orderNo || commission.orderNo, customerName: order?.customerName || common.customerName,
              orderAmount: order?.actualAmount || order?.amount || commission.orderAmount,
              confirmedAt: processing.confirmedAt || null, paidAt: commission.paidAt || processing.paidAt || null,
              withdrawStatus: inactive ? commission.status : null,
              withdrawReason: inactive ? processing.withdrawReason || commission.adjustReason || commission.auditReason || null : null,
            };
          }
          const recoveryOrder = sourceRecoveryOrders.find((item) => item.id === commission.orderId);
          return {
            ...common, recoveryNo: recoveryOrder?.recoveryNo || commission.orderNo, customerName: recoveryOrder?.customerName || common.customerName,
            originalProduct: recoveryOrder?.originalProduct || null, recoveryAmount: recoveryOrder?.recoveryAmount || null,
            paymentDate: commission.paymentDate || recoveryOrder?.paymentAt || null,
            confirmedAt: recoveryOrder?.settlementConfirmedAt || null, paidAt: commission.paidAt || recoveryOrder?.settlementPaidAt || null,
            withdrawStatus: inactive ? commission.status : null,
            withdrawReason: inactive ? recoveryOrder?.settlementWithdrawReason || commission.adjustReason || commission.auditReason || null : null,
          };
        });
      const createdAt = now().toISOString();
      const filename = `${FILENAMES[request.module]}_${dateToken(new Date(createdAt))}.xlsx`;
      const detailColumns = request.module === 'orders' ? ORDER_PAYMENT_DETAIL_COLUMNS
        : request.module === 'order_settlements' ? ORDER_SETTLEMENT_DETAIL_COLUMNS : RECOVERY_SETTLEMENT_DETAIL_COLUMNS;
      await prisma.businessExportAudit.create({ data: { module: request.module, actorId: actor.id, actorName: actor.name, reason: request.reason,
        filtersSnapshot: JSON.parse(JSON.stringify(request.filters)), columnMode: request.columnMode, columns: columns,
        summaryRowCount: summaryRows.length, detailRowCount: detailRows.length, filename, createdAt: new Date(createdAt) } });
      return success({ filename, sheetNames: SHEETS[request.module], summaryColumns: selectColumns(summaryColumnPool, columns), detailColumns, summaryRows, detailRows, audit: { module: request.module, reason: request.reason, summaryRowCount: summaryRows.length, detailRowCount: detailRows.length, createdAt } });
    } catch (error) {
      if (error instanceof BusinessExportError) return failure(error.message, error.statusCode);
      return failure('业务导出服务暂时不可用', 500);
    }
  };
  return { export: exportRows };
}
