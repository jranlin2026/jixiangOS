import type { PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { buildDataVisibilityScopeForUser } from '../../src/shared/utils/dataVisibility';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Commission } from '../../src/types/commission';
import type { BusinessExportColumn, BusinessExportModule, BusinessExportRequest, BusinessExportResult, BusinessExportRow } from '../../src/types/businessExport';
import type { Order } from '../../src/types/order';
import type { RecoveryOrder } from '../../src/types/recoveryOrder';

type BusinessExportPrisma = Pick<PrismaClient, 'businessRecord' | 'user' | 'role' | 'department'> & {
  businessExportAudit?: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
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
const ORDER_COLUMNS = [
  'orderNo', 'status', 'customer', 'customerName', 'productName', 'productLevel', 'orderType', 'amount', 'actualAmount',
  'paymentMethod', 'officialPaymentChannel', 'thirdPartyOrderNo', 'resourceOwnership', 'owner', 'createdByName', 'paymentDate',
  'leadInputBy', 'leadContributorName', 'notes', 'createdAt', 'attachmentSummary',
];
const ORDER_SETTLEMENT_COLUMNS = [
  'orderNo', 'customerName', 'productName', 'productLevel', 'orderType', 'paymentDate', 'orderAmount', 'status',
  'salesOwner', 'resourceOwnership', 'totalCommissionAmount', 'performanceAmount', 'pendingAssignCount', 'exceptionCount',
  'settlementOperator', 'confirmedAt', 'paidAt', 'withdrawReason', 'attachmentSummary',
];
const RECOVERY_SETTLEMENT_COLUMNS = [
  'recoveryNo', 'status', 'customerName', 'thirdPartyOrderNo', 'sourcePlatformShop', 'originalProduct', 'originalProductLevel',
  'originalAmount', 'recoveryAmount', 'officialPaymentChannel', 'paymentAt', 'recoveryUserName', 'createdByName', 'totalCommissionAmount',
  'performanceAmount', 'settlementHandledBy', 'settlementConfirmedAt', 'settlementPaidAt', 'settlementWithdrawReason', 'attachmentSummary',
  'splitDetails', 'customerPhone', 'customerWechat', 'customerMatchStatus', 'sourcePlatform', 'sourceShop', 'paymentOrderNo', 'recoveryAt',
  'assistUserName', 'auditorName', 'auditedAt', 'remark', 'createdAt', 'updatedAt',
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
function inRange(value: unknown, start?: string, end?: string): boolean {
  const time = timestamp(value);
  if (start && time < timestamp(start)) return false;
  if (end) {
    const upper = /^\d{4}-\d{2}-\d{2}$/.test(end) ? `${end}T23:59:59.999Z` : end;
    if (time > timestamp(upper)) return false;
  }
  return true;
}
function attachmentSummary(attachments: unknown): string {
  const list = Array.isArray(attachments) ? attachments : [];
  const names = list.map((item) => clean((item as { name?: unknown })?.name)).filter(Boolean);
  return names.length ? `${names.join('、')}（${names.length}）` : '';
}
function attachmentCount(attachments: unknown): number { return Array.isArray(attachments) ? attachments.length : 0; }
function settlementStatus(commissions: Commission[]): string {
  if (!commissions.length || commissions.some((item) => item.status === '待确认')) return '待处理';
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

function validateRequest(input: BusinessExportRequest): Required<Pick<BusinessExportRequest, 'module' | 'reason' | 'columnMode' | 'filters'>> & { columnIds: string[] } {
  if (!input || typeof input !== 'object' || !isModule(input.module)) throw new BusinessExportError(400, '导出模块无效');
  const reason = clean(input.reason);
  if (!reason) throw new BusinessExportError(400, '请填写导出原因');
  if (input.columnMode !== 'current_view' && input.columnMode !== 'all') throw new BusinessExportError(400, '导出列模式无效');
  if (input.columnIds !== undefined && (!Array.isArray(input.columnIds) || input.columnIds.some((column) => typeof column !== 'string'))) throw new BusinessExportError(400, '导出列无效');
  if (!asRecord(input.filters)) throw new BusinessExportError(400, '导出筛选条件无效');
  const allowlist = input.module === 'orders' ? ORDER_COLUMNS : input.module === 'order_settlements' ? ORDER_SETTLEMENT_COLUMNS : RECOVERY_SETTLEMENT_COLUMNS;
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
function last<T>(items: T[]): T | undefined { return items.length ? items[items.length - 1] : undefined; }
function columnMeta(ids: string[]): BusinessExportColumn[] {
  const labels: Record<string, string> = { orderNo: '订单号', recoveryNo: '挽回订单号', customerName: '客户', amount: '金额', actualAmount: '实付金额', orderAmount: '订单金额', recoveryAmount: '挽回成交金额', totalCommissionAmount: '分账总额', commissionAmount: '分账金额', performanceAmount: '业绩计算金额', paymentDate: '付款时间', paidAt: '付款时间', paymentAt: '付款时间', createdAt: '创建时间', updatedAt: '更新时间' };
  const currency = new Set(['amount', 'actualAmount', 'orderAmount', 'recoveryAmount', 'totalCommissionAmount', 'commissionAmount', 'performanceAmount']);
  const dates = new Set(['paymentDate', 'paidAt', 'paymentAt', 'recoveryAt', 'createdAt', 'updatedAt', 'confirmedAt', 'paidAt', 'auditedAt', 'settlementConfirmedAt', 'settlementPaidAt']);
  return ids.map((id) => ({ id, label: labels[id] || id, type: currency.has(id) ? 'currency' : dates.has(id) ? 'date' : id === 'attachmentCount' || id === 'pendingAssignCount' || id === 'exceptionCount' ? 'number' : 'text' }));
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
          .filter((order) => !order.deletedAt && !order.settlementCleanedAt)
          .filter((order) => scope.unrestricted || (order.createdBy ? scope.visibleUserIds.includes(order.createdBy) : scope.visibleUserNames.includes(order.createdByName)))
          .filter((order) => {
            const search = clean(filters.search).toLocaleLowerCase();
            return (!search || [order.recoveryNo, order.thirdPartyOrderNo, order.customerName, order.originalProduct, order.recoveryUserName]
              .some((value) => clean(value).toLocaleLowerCase().includes(search)))
              && (!filters.settlementStatus || filters.settlementStatus === '全部' || recoveryStatus(order) === filters.settlementStatus)
              && (!Array.isArray(filters.settlementStatuses) || !filters.settlementStatuses.length || filters.settlementStatuses.includes(recoveryStatus(order)));
          });
      } else {
        sourceOrders = rows.map((row) => asRecord((row as any).data) as Order | null).filter(nonNull)
          .filter((order) => !order.deletedAt)
          .filter((order) => scope.unrestricted || (order.salesId ? scope.visibleUserIds.includes(order.salesId) : scope.visibleUserNames.includes(order.salesName || order.owner)))
          .filter((order) => {
            const search = clean(filters.search).toLocaleLowerCase();
            return (!search || [order.orderNo, order.customerName, order.productName, order.salesName, order.owner].some((value) => clean(value).toLocaleLowerCase().includes(search)))
              && (request.module !== 'orders' || !filters.status || filters.status === '全部' || order.status === filters.status)
              && (!filters.owner || order.owner === filters.owner || order.salesName === filters.owner)
              && (!filters.productLevel || order.productLevel === filters.productLevel)
              && (!filters.orderType || order.orderType === filters.orderType)
              && (!filters.paymentMethod || order.paymentMethod === filters.paymentMethod)
              && inRange(order.createdAt, clean(filters.startDate) || undefined, clean(filters.endDate) || undefined);
          });
      }
      const selectedOrderIds = new Set(request.module === 'recovery_settlements' ? sourceRecoveryOrders.map((order) => order.id) : sourceOrders.map((order) => order.id));
      const commissionRows = selectedOrderIds.size
        ? await prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSIONS, orderId: { in: Array.from(selectedOrderIds) } } })
        : [];
      const commissions = commissionRows.map((row) => asRecord((row as any).data) as Commission | null).filter(nonNull)
        .filter((commission) => selectedOrderIds.has(commission.orderId))
        .filter((commission) => request.module !== 'order_settlements' || (!commission.sourceRecoveryOrderId && commission.sourceBusinessType !== 'after_sales_recovery'))
        .filter((commission) => request.module !== 'recovery_settlements' || commission.sourceRecoveryOrderId || commission.sourceBusinessType === 'after_sales_recovery');
      const byOrder = new Map<string, Commission[]>();
      commissions.forEach((commission) => byOrder.set(commission.orderId, [...(byOrder.get(commission.orderId) || []), commission]));
      if (request.module === 'order_settlements') {
        sourceOrders = sourceOrders.filter((order) => {
          const splits = byOrder.get(order.id) || [];
          const paymentDate = order.payments?.[0]?.paidAt || order.createdAt;
          return (!filters.status || filters.status === '全部' || settlementStatus(splits) === filters.status)
            && (!filters.ownerId || splits.some((commission) => commission.ownerId === filters.ownerId))
            && (!filters.role || splits.some((commission) => commission.role === filters.role))
            && (!filters.month || String(paymentDate).startsWith(String(filters.month)))
            && inRange(paymentDate, clean(filters.startDate) || undefined, clean(filters.endDate) || undefined);
        });
      }
      const summaryCount = request.module === 'recovery_settlements' ? sourceRecoveryOrders.length : sourceOrders.length;
      if (summaryCount > MAX_SUMMARY_ROWS) throw new BusinessExportError(400, `导出结果超过 ${MAX_SUMMARY_ROWS} 行上限`);
      const exportedOrderIds = new Set(request.module === 'recovery_settlements' ? sourceRecoveryOrders.map((order) => order.id) : sourceOrders.map((order) => order.id));
      const allColumns = request.module === 'orders' ? ORDER_COLUMNS : request.module === 'order_settlements' ? ORDER_SETTLEMENT_COLUMNS : RECOVERY_SETTLEMENT_COLUMNS;
      const columns = request.columnMode === 'all' ? allColumns : request.columnIds;
      const summaryRows = request.module === 'orders'
        ? sourceOrders.map((order) => project({
          orderNo: order.orderNo, status: order.status, customer: order.customerName, customerName: order.customerName,
          productName: order.productName || order.productLevel, productLevel: order.productLevel, orderType: order.orderType,
          amount: order.amount, actualAmount: order.actualAmount, paymentMethod: order.paymentMethod,
          officialPaymentChannel: order.officialPaymentChannel, thirdPartyOrderNo: order.thirdPartyOrderNo, resourceOwnership: order.resourceOwnership,
          owner: order.salesName || order.owner, createdByName: order.createdByName, paymentDate: order.payments?.[0]?.paidAt || order.createdAt,
          leadInputBy: order.leadInputBy, leadContributorName: order.leadContributorName, notes: order.notes, createdAt: order.createdAt,
          attachmentSummary: attachmentSummary(order.dealEvidenceAttachments),
        }, columns))
        : request.module === 'order_settlements'
          ? sourceOrders.map((order) => {
            const splits = byOrder.get(order.id) || [];
            return project({ orderNo: order.orderNo, customerName: order.customerName, productName: order.productName || order.productLevel,
              productLevel: order.productLevel, orderType: order.orderType, paymentDate: order.payments?.[0]?.paidAt || order.createdAt,
              orderAmount: order.actualAmount || order.amount, status: settlementStatus(splits), salesOwner: order.salesName || order.owner,
              resourceOwnership: order.resourceOwnership, totalCommissionAmount: splits.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0),
              performanceAmount: splits.reduce((sum, item) => sum + Number(item.performanceAmount || 0), 0), pendingAssignCount: splits.filter((item) => !item.ownerId).length,
              exceptionCount: splits.filter((item) => ['已撤回', '待冲销', '已冲销', '已取消'].includes(item.status)).length,
              settlementOperator: last(splits.map((item) => item.adjustedBy).filter(Boolean)), confirmedAt: undefined, paidAt: last(splits.map((item) => item.paidAt).filter(Boolean)),
              withdrawReason: last(splits.map((item) => item.adjustReason).filter(Boolean)), attachmentSummary: attachmentSummary(order.dealEvidenceAttachments), }, columns);
          })
          : sourceRecoveryOrders.map((order) => {
            const splits = byOrder.get(order.id) || [];
            return project({ recoveryNo: order.recoveryNo, status: recoveryStatus(order), customerName: order.customerName, thirdPartyOrderNo: order.thirdPartyOrderNo,
              sourcePlatformShop: [order.sourcePlatformName || order.sourcePlatform, order.sourceShopName].filter(Boolean).join(' / '),
              originalProduct: order.originalProduct, originalProductLevel: order.originalProductLevel, originalAmount: order.originalAmount, recoveryAmount: order.recoveryAmount,
              officialPaymentChannel: order.officialPaymentChannel, paymentAt: order.paymentAt, recoveryUserName: order.recoveryUserName, createdByName: order.createdByName,
              totalCommissionAmount: splits.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0), performanceAmount: splits.reduce((sum, item) => sum + Number(item.performanceAmount || 0), 0),
              settlementHandledBy: order.settlementHandledBy, settlementConfirmedAt: order.settlementConfirmedAt, settlementPaidAt: order.settlementPaidAt,
              settlementWithdrawReason: order.settlementWithdrawReason, attachmentSummary: attachmentSummary(order.recoveryAttachments || order.paymentAttachments || order.chatAttachments),
              splitDetails: splits.map((item) => `${item.role}：${item.owner} ${item.commissionAmount}`).join('；'), customerPhone: order.customerPhone,
              customerWechat: order.customerWechat, customerMatchStatus: order.customerMatchStatus, sourcePlatform: order.sourcePlatformName || order.sourcePlatform,
              sourceShop: order.sourceShopName, paymentOrderNo: order.paymentOrderNo, recoveryAt: order.recoveryAt, assistUserName: order.assistUserName,
              auditorName: order.auditorName, auditedAt: order.auditedAt, remark: order.remark, createdAt: order.createdAt, updatedAt: order.updatedAt, }, columns);
          });
      const detailRows = request.module === 'orders'
        ? sourceOrders.flatMap((order) => (order.payments || []).map((payment) => ({ orderNo: order.orderNo, paymentOrderNo: payment.paymentOrderNo || null,
          amount: payment.amount, paymentMethod: payment.paymentMethod, paidAt: payment.paidAt, voucherName: payment.voucherName || null, attachmentCount: attachmentCount(payment.attachments) })))
        : commissions.filter((commission) => exportedOrderIds.has(commission.orderId)).map((commission) => ({ orderNo: commission.orderNo, customerName: commission.customerName, role: commission.role, owner: commission.owner,
          ownerId: commission.ownerId || null, department: commission.department, commissionAmount: commission.commissionAmount, performanceAmount: commission.performanceAmount || null,
          commissionRate: commission.commissionRate, status: commission.status, paymentDate: commission.paymentDate || null, payoutPlanName: commission.payoutPlanName || null }));
      const createdAt = now().toISOString();
      const filename = `${FILENAMES[request.module]}_${dateToken(new Date(createdAt))}.xlsx`;
      const detailColumnIds = request.module === 'orders'
        ? ['orderNo', 'paymentOrderNo', 'amount', 'paymentMethod', 'paidAt', 'voucherName', 'attachmentCount']
        : ['orderNo', 'customerName', 'role', 'owner', 'ownerId', 'department', 'commissionAmount', 'performanceAmount', 'commissionRate', 'status', 'paymentDate', 'payoutPlanName'];
      await prisma.businessExportAudit?.create({ data: { module: request.module, actorId: actor.id, actorName: actor.name, reason: request.reason,
        filtersSnapshot: JSON.parse(JSON.stringify(request.filters)), columnMode: request.columnMode, columns: columns,
        summaryRowCount: summaryRows.length, detailRowCount: detailRows.length, filename, createdAt: new Date(createdAt) } });
      return success({ filename, sheetNames: SHEETS[request.module], summaryColumns: columnMeta(columns), detailColumns: columnMeta(detailColumnIds), summaryRows, detailRows, audit: { module: request.module, reason: request.reason, summaryRowCount: summaryRows.length, detailRowCount: detailRows.length, createdAt } });
    } catch (error) {
      if (error instanceof BusinessExportError) return failure(error.message, error.statusCode);
      throw error;
    }
  };
  return { export: exportRows };
}
