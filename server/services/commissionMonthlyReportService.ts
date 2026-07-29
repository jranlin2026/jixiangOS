import ExcelJS from 'exceljs';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { selectCurrentCommissionRounds } from '../../src/shared/utils/commissionConfiguration';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  Commission,
  CommissionPayoutRecord,
  CommissionTier,
  CommissionTierSnapshot,
} from '../../src/types/commission';
import type { Order } from '../../src/types/order';

type ReportPrisma = Pick<PrismaClient, 'businessRecord' | 'businessExportAudit'>;
type ReportScope = 'all' | 'department' | 'employee';
type CellValue = string | number | boolean | null | undefined;

export interface CommissionMonthlyReportRequest {
  period: string;
  reason: string;
  scope: ReportScope;
  departmentId?: string;
  ownerId?: string;
  includeWithdrawn?: boolean;
}

interface ReportActor {
  id: string;
  name: string;
}

interface ReportColumn {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'currency' | 'date';
  width?: number;
}

interface ReportSheet {
  name: string;
  columns: ReportColumn[];
  rows: Array<Record<string, CellValue>>;
}

export interface CommissionMonthlyReportBuildInput extends CommissionMonthlyReportRequest {
  generatedAt: string;
  actor: ReportActor;
  commissions: Commission[];
  payoutRecords: CommissionPayoutRecord[];
  orders: Order[];
}

export interface CommissionMonthlyReportSummary {
  employeeCount: number;
  formalOrderCount: number;
  recoveryOrderCount: number;
  formalOrderPaidAmount: number;
  effectiveCommissionAmount: number;
  pendingConfirmAmount: number;
  pendingPayAmount: number;
  paidAmount: number;
  withdrawnAmount: number;
  chargebackAmount: number;
  ordinaryCommissionAmount: number;
  tierPerformanceAmount: number;
  tierCommissionAmount: number;
  recoveryCommissionAmount: number;
  exceptionCount: number;
}

export interface CommissionMonthlyEmployeeRow extends Record<string, CellValue> {
  employee: string;
  role: string;
  orderPaidAmount: number;
}

export interface CommissionMonthlyReportData {
  filename: string;
  period: string;
  generatedAt: string;
  summary: CommissionMonthlyReportSummary;
  employeeRows: CommissionMonthlyEmployeeRow[];
  sheets: ReportSheet[];
}

const VALID_PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const EFFECTIVE_STATUSES = new Set<Commission['status']>(['待确认', '待发放', '已发放']);
const WITHDRAWN_STATUSES = new Set<Commission['status']>(['已撤回', '待冲销', '已冲销', '已取消']);
const FORMULA_PREFIX = /^\s*[=+\-@]/u;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const clean = (value: unknown) => String(value ?? '').trim();
const asObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);
const periodOf = (commission: Commission) => clean(commission.paymentDate || commission.createdAt).slice(0, 7);
const ownerKey = (commission: Commission) => commission.ownerId || `name:${commission.owner}`;
const isRecovery = (commission: Commission) => (
  commission.sourceBusinessType === 'after_sales_recovery'
  || commission.sourceBusinessType === 'refund_recovery'
  || Boolean(commission.sourceRecoveryOrderId)
  || clean(commission.orderNo).startsWith('RCV-')
);
const isTiered = (commission: Commission) => commission.ruleCalculationType === 'tiered_percentage' && !isRecovery(commission);
const isWithdrawn = (commission: Commission) => WITHDRAWN_STATUSES.has(commission.status);

function safeText(value: unknown): string {
  const text = String(value ?? '');
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

function normalizeTiers(tiers: CommissionTier[] = []): CommissionTier[] {
  return tiers.slice().sort((left, right) => left.minAmount - right.minAmount);
}

function tierBucketKey(commission: Commission): string {
  return [ownerKey(commission), commission.role, commission.payoutPlanSnapshot?.id || commission.payoutPlanId || commission.payoutPlanName || 'unknown', commission.payoutPlanSnapshot?.version || commission.payoutPlanVersion || 1].join('::');
}

function resolveTierSnapshot(commissions: Commission[]): CommissionTierSnapshot | undefined {
  const snapshotSource = commissions.find((item) => item.payoutPlanSnapshot?.tiers?.length);
  const tierSource = commissions.find((item) => item.tierSnapshot?.tiers?.length);
  const tiers = normalizeTiers(snapshotSource?.payoutPlanSnapshot?.tiers || tierSource?.tierSnapshot?.tiers || []);
  const active = commissions.filter((item) => !isWithdrawn(item));
  const baseAmount = roundMoney(active.reduce((sum, item) => sum + Number(item.performanceAmount || item.orderAmount || 0), 0));
  if (!tiers.length) return tierSource?.tierSnapshot;
  const currentTier = tiers.find((tier) => baseAmount >= tier.minAmount && (tier.maxAmount === undefined || baseAmount < tier.maxAmount));
  const nextTier = tiers.find((tier) => tier.minAmount > baseAmount);
  return { tiers, currentTier, nextTier, baseAmount, gapToNext: nextTier ? roundMoney(nextTier.minAmount - baseAmount) : 0 };
}

function displayAmount(commission: Commission, tierSnapshots: Map<string, CommissionTierSnapshot | undefined>): number {
  if (!isTiered(commission)) return roundMoney(Number(commission.commissionAmount || 0));
  const snapshot = tierSnapshots.get(tierBucketKey(commission));
  const rate = snapshot?.currentTier?.rate ?? Number(commission.commissionRate || 0) * 100;
  if (!rate) return roundMoney(Number(commission.commissionAmount || 0));
  return roundMoney(Number(commission.performanceAmount || commission.orderAmount || 0) * rate / 100);
}

function orderPaidAmount(order: Order | undefined): number | null {
  if (!order) return null;
  const payments = Array.isArray(order.payments) ? order.payments.filter((payment) => Number(payment.amount) > 0) : [];
  if (payments.length) return roundMoney(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  return null;
}

function normalizePayoutRecord(value: unknown): CommissionPayoutRecord | null {
  const data = asObject(value);
  const id = clean(data.id);
  if (!id) return null;
  return {
    id,
    payoutNo: clean(data.payoutNo || data.batchNo || id),
    period: clean(data.issuedAt || data.paidAt || data.period).slice(0, 7),
    status: ['已撤销', '已作废'].includes(clean(data.status)) ? '已撤销' : '已发放',
    totalCount: Number(data.totalCount || 0),
    totalAmount: Number(data.totalAmount || 0),
    commissionIds: Array.isArray(data.commissionIds)
      ? data.commissionIds.map(String)
      : Array.isArray(data.commissionSnapshots) ? (data.commissionSnapshots as Array<{ id?: unknown }>).map((item) => clean(item.id)).filter(Boolean) : [],
    commissionSnapshots: Array.isArray(data.commissionSnapshots) ? data.commissionSnapshots as unknown as Commission[] : undefined,
    byOwner: Array.isArray(data.byOwner) ? data.byOwner as unknown as CommissionPayoutRecord['byOwner'] : [],
    createdAt: clean(data.createdAt || data.issuedAt), createdById: clean(data.createdById), createdByName: clean(data.createdByName),
    issuedAt: clean(data.issuedAt || data.paidAt || data.createdAt), issuedById: clean(data.issuedById), issuedByName: clean(data.issuedByName),
    paymentMethod: clean(data.paymentMethod) || undefined, paymentReference: clean(data.paymentReference) || undefined,
    reversedAt: clean(data.reversedAt) || undefined, reversedById: clean(data.reversedById) || undefined,
    reversedByName: clean(data.reversedByName) || undefined, reverseReason: clean(data.reverseReason) || undefined,
    note: clean(data.note) || undefined,
  };
}

function statusAmount(commissions: Commission[], status: Commission['status'], amountFor: (commission: Commission) => number): number {
  return roundMoney(commissions.filter((item) => item.status === status).reduce((sum, item) => sum + amountFor(item), 0));
}

function reportColumns(): Record<ReportSheet['name'], ReportColumn[]> {
  return {
    '月度核对总览': [
      { key: 'item', label: '核对项目', width: 28 }, { key: 'value', label: '数值', width: 22 }, { key: 'note', label: '财务口径', width: 58 },
    ],
    '员工提成汇总': [
      { key: 'employeeId', label: '员工ID' }, { key: 'employee', label: '员工' }, { key: 'department', label: '部门' }, { key: 'role', label: '提成角色' },
      { key: 'orderCount', label: '关联订单数', type: 'number' }, { key: 'commissionCount', label: '提成笔数', type: 'number' },
      { key: 'orderPaidAmount', label: '关联正式订单实付（不可跨员工求和）', type: 'currency', width: 28 },
      { key: 'ordinaryAmount', label: '普通订单提成', type: 'currency' }, { key: 'tierPerformanceAmount', label: '正式订单阶梯业绩', type: 'currency' },
      { key: 'tierRate', label: '阶梯档位' }, { key: 'tierAmount', label: '正式订单阶梯提成', type: 'currency' },
      { key: 'recoveryAmount', label: '售后挽回提成', type: 'currency' }, { key: 'effectiveAmount', label: '有效应发', type: 'currency' },
      { key: 'pendingConfirmAmount', label: '待确认', type: 'currency' }, { key: 'pendingPayAmount', label: '待发放', type: 'currency' },
      { key: 'paidAmount', label: '已发放', type: 'currency' }, { key: 'withdrawnAmount', label: '已撤回', type: 'currency' },
      { key: 'lastPaidAt', label: '最后发放时间', type: 'date' }, { key: 'checkStatus', label: '核对状态' }, { key: 'exceptionNote', label: '异常说明', width: 36 },
    ],
    '逐笔提成明细': [
      { key: 'commissionId', label: '提成ID' }, { key: 'period', label: '归属月份' }, { key: 'commissionType', label: '提成类型' },
      { key: 'customerName', label: '客户' }, { key: 'orderNo', label: '订单号' }, { key: 'productLevel', label: '产品/项目' }, { key: 'businessSource', label: '业务类型' },
      { key: 'businessAt', label: '业务成交/付款时间', type: 'date' }, { key: 'orderPaidAmount', label: '订单实付', type: 'currency' }, { key: 'performanceAmount', label: '业绩核算金额', type: 'currency' },
      { key: 'employeeId', label: '员工ID' }, { key: 'employee', label: '提成员工' }, { key: 'department', label: '部门' }, { key: 'role', label: '提成角色' },
      { key: 'planName', label: '提成方案' }, { key: 'planId', label: '方案ID' }, { key: 'planVersion', label: '方案版本', type: 'number' }, { key: 'calculationType', label: '计算方式' },
      { key: 'rateOrFixed', label: '比例/固定金额' }, { key: 'tierRate', label: '阶梯档位' }, { key: 'formula', label: '计算公式', width: 38 },
      { key: 'storedAmount', label: '保存金额', type: 'currency' }, { key: 'finalAmount', label: '最终应发', type: 'currency' }, { key: 'manualAdjusted', label: '人工调整' },
      { key: 'adjustReason', label: '调整原因' }, { key: 'adjustedBy', label: '调整人' }, { key: 'adjustedAt', label: '调整时间', type: 'date' },
      { key: 'status', label: '当前状态' }, { key: 'paidAt', label: '实际发放时间', type: 'date' }, { key: 'payoutNo', label: '发放单号' },
      { key: 'paymentMethod', label: '发放方式' }, { key: 'paymentReference', label: '付款流水号' }, { key: 'issuedBy', label: '经办人' },
      { key: 'reverseStatus', label: '历史发放单状态' }, { key: 'reverseReason', label: '历史撤销原因' }, { key: 'calculationNote', label: '计算说明', width: 40 },
    ],
    '正式订单阶梯核对': [
      { key: 'employee', label: '员工' }, { key: 'department', label: '部门' }, { key: 'role', label: '角色' }, { key: 'planName', label: '阶梯方案' },
      { key: 'planVersion', label: '方案版本', type: 'number' }, { key: 'includedOrderCount', label: '纳入订单数', type: 'number' }, { key: 'includedOrderNos', label: '纳入订单号', width: 42 },
      { key: 'performanceAmount', label: '月度阶梯业绩', type: 'currency' }, { key: 'tierRange', label: '当前档位范围' }, { key: 'tierRate', label: '当前比例' },
      { key: 'gapToNext', label: '距离下一档', type: 'currency' }, { key: 'formula', label: '阶梯计算公式', width: 38 }, { key: 'commissionAmount', label: '阶梯提成合计', type: 'currency' },
      { key: 'excludedOrderNos', label: '排除订单' }, { key: 'excludedReason', label: '排除原因' }, { key: 'checkStatus', label: '核对状态' },
    ],
    '发放与撤销记录': [
      { key: 'payoutNo', label: '发放单号' }, { key: 'status', label: '发放状态' }, { key: 'issuedAt', label: '发放时间', type: 'date' },
      { key: 'paymentMethod', label: '发放方式' }, { key: 'paymentReference', label: '付款流水号' }, { key: 'issuedBy', label: '经办人' },
      { key: 'employee', label: '员工' }, { key: 'commissionPeriods', label: '提成归属月份' }, { key: 'commissionCount', label: '提成笔数', type: 'number' },
      { key: 'allocatedAmount', label: '本报表归属提成金额', type: 'currency' }, { key: 'recordTotalAmount', label: '发放单总额', type: 'currency' }, { key: 'commissionIds', label: '提成ID', width: 42 },
      { key: 'crossPeriod', label: '是否跨月' }, { key: 'reversedAt', label: '撤销时间', type: 'date' }, { key: 'reversedBy', label: '撤销人' },
      { key: 'reverseReason', label: '撤销原因' }, { key: 'fundRecoveryStatus', label: '资金追回状态' }, { key: 'note', label: '备注' },
    ],
    '异常与口径说明': [
      { key: 'kind', label: '类型' }, { key: 'level', label: '级别' }, { key: 'employee', label: '员工' }, { key: 'orderNo', label: '订单号' },
      { key: 'commissionId', label: '提成ID' }, { key: 'issue', label: '异常/口径', width: 42 }, { key: 'suggestion', label: '处理建议', width: 48 },
    ],
  };
}

export function buildCommissionMonthlyReportData(input: CommissionMonthlyReportBuildInput): CommissionMonthlyReportData {
  const scoped = selectCurrentCommissionRounds(input.commissions)
    .filter((commission) => periodOf(commission) === input.period)
    .filter((commission) => input.includeWithdrawn !== false || !isWithdrawn(commission))
    .filter((commission) => input.scope !== 'department' || commission.departmentId === input.departmentId || commission.department === input.departmentId)
    .filter((commission) => input.scope !== 'employee' || commission.ownerId === input.ownerId || commission.owner === input.ownerId);
  const ordersById = new Map(input.orders.map((order) => [order.id, order]));
  const payoutByCommission = new Map<string, CommissionPayoutRecord>();
  const payoutSnapshotByCommission = new Map<string, Commission>();
  const duplicatePayoutCommissionIds = new Set<string>();
  input.payoutRecords.forEach((record) => {
    record.commissionIds.forEach((id) => {
      if (payoutByCommission.has(id)) duplicatePayoutCommissionIds.add(id);
      payoutByCommission.set(id, record);
    });
    (record.commissionSnapshots || []).forEach((snapshot) => payoutSnapshotByCommission.set(snapshot.id, snapshot));
  });
  const tierGroups = new Map<string, Commission[]>();
  scoped.filter(isTiered).forEach((commission) => tierGroups.set(tierBucketKey(commission), [...(tierGroups.get(tierBucketKey(commission)) || []), commission]));
  const tierSnapshots = new Map([...tierGroups.entries()].map(([key, rows]) => [key, resolveTierSnapshot(rows)]));
  const amountFor = (commission: Commission) => {
    const payoutSnapshot = payoutSnapshotByCommission.get(commission.id);
    return commission.status === '已发放' && payoutSnapshot
      ? roundMoney(Number(payoutSnapshot.commissionAmount || 0))
      : displayAmount(commission, tierSnapshots);
  };
  const effective = scoped.filter((commission) => EFFECTIVE_STATUSES.has(commission.status));
  const formal = scoped.filter((commission) => !isRecovery(commission));
  const recovery = scoped.filter(isRecovery);
  const uniqueFormalOrders = new Map<string, Commission>();
  formal.forEach((commission) => uniqueFormalOrders.set(commission.orderId, commission));
  const formalOrderPaidAmount = roundMoney([...uniqueFormalOrders.entries()].reduce((sum, [orderId, commission]) => (
    sum + (orderPaidAmount(ordersById.get(orderId)) ?? Number(commission.orderAmount || 0))
  ), 0));

  const exceptionRows: Array<Record<string, CellValue>> = [];
  const addException = (commission: Commission | undefined, issue: string, suggestion: string, level = '需处理') => exceptionRows.push({
    kind: '异常', level, employee: commission?.owner || '-', orderNo: commission?.orderNo || '-', commissionId: commission?.id || '-', issue, suggestion,
  });

  const detailRows = scoped.map((commission) => {
    const order = ordersById.get(commission.orderId);
    const payout = payoutByCommission.get(commission.id);
    const snapshot = isTiered(commission) ? tierSnapshots.get(tierBucketKey(commission)) : undefined;
    const finalAmount = amountFor(commission);
    if (!commission.ownerId || commission.owner === '待分配') addException(commission, '提成人员待分配', '补齐人员后重新核对');
    if (!clean(commission.customerName)) addException(commission, '缺少客户名称', '核对源业务记录');
    if (!clean(commission.orderNo)) addException(commission, '缺少订单号', '核对源业务记录');
    if (Number(commission.performanceAmount || commission.orderAmount || 0) <= 0) addException(commission, '业绩核算金额不合法', '不要自动猜测，请核对实付与规则');
    if (!commission.payoutPlanId && !commission.payoutPlanSnapshot?.id) addException(commission, '缺少提成方案ID', '核对历史方案快照');
    if (!commission.payoutPlanVersion && !commission.payoutPlanSnapshot?.version) addException(commission, '缺少提成方案版本', '补齐不可变方案快照');
    if (isTiered(commission) && Math.abs(finalAmount - Number(commission.commissionAmount || 0)) >= 0.01) addException(commission, `阶梯复算金额 ${finalAmount.toFixed(2)} 与保存金额 ${Number(commission.commissionAmount || 0).toFixed(2)} 不一致`, '以方案快照和本月阶梯业绩人工复核');
    if (commission.status === '已发放' && !payout) addException(commission, '已发放提成缺少发放单', '查找历史发放记录或标记历史数据缺失');
    if (commission.status === '已发放' && payout && !payout.paymentReference) addException(commission, '已发放但缺少付款流水号', '财务核对付款凭证');
    const actualPaid = isRecovery(commission) ? Number(commission.orderAmount || 0) : orderPaidAmount(order);
    if (!isRecovery(commission) && actualPaid === null) addException(commission, '正式订单缺少可核验付款明细', '当前仅能参考提成快照中的订单金额');
    return {
      commissionId: commission.id, period: input.period,
      commissionType: isRecovery(commission) ? '售后挽回提成' : isTiered(commission) ? '正式订单月度阶梯提成' : '普通订单提成',
      customerName: commission.customerName || '-', orderNo: commission.orderNo || '-', productLevel: commission.productLevel || '-',
      businessSource: isRecovery(commission) ? '售后挽回' : '正式订单', businessAt: commission.paymentDate || commission.createdAt,
      orderPaidAmount: actualPaid ?? Number(commission.orderAmount || 0), performanceAmount: Number(commission.performanceAmount || commission.orderAmount || 0),
      employeeId: commission.ownerId || '', employee: commission.owner || '待分配', department: commission.department || '-', role: commission.role,
      planName: commission.payoutPlanSnapshot?.name || commission.payoutPlanName || '-', planId: commission.payoutPlanSnapshot?.id || commission.payoutPlanId || '',
      planVersion: commission.payoutPlanSnapshot?.version || commission.payoutPlanVersion || '',
      calculationType: commission.ruleCalculationType === 'tiered_percentage' ? '月度阶梯' : commission.ruleCalculationType === 'percentage' ? '按比例' : '固定金额',
      rateOrFixed: commission.ruleCalculationType === 'percentage' ? `${roundMoney(Number(commission.commissionRate || 0) * 100)}%` : commission.ruleCalculationType === 'fixed' ? `¥${Number(commission.commissionAmount || 0).toFixed(2)}` : `${snapshot?.currentTier?.rate ?? '-'}%`,
      tierRate: snapshot?.currentTier?.rate === undefined ? '-' : `${snapshot.currentTier.rate}%`, formula: commission.formulaText || commission.calculationNote || '-',
      storedAmount: Number(commission.commissionAmount || 0), finalAmount, manualAdjusted: commission.isManualAdjusted ? '是' : '否', adjustReason: commission.adjustReason || '',
      adjustedBy: commission.adjustedBy || '', adjustedAt: commission.adjustedAt || '', status: isWithdrawn(commission) ? '已撤回' : commission.status,
      paidAt: commission.paidAt || payout?.issuedAt || '', payoutNo: payout?.payoutNo || '', paymentMethod: payout?.paymentMethod || '',
      paymentReference: payout?.paymentReference || '', issuedBy: payout?.issuedByName || '', reverseStatus: payout?.status === '已撤销' ? '系统已撤销' : '',
      reverseReason: payout?.reverseReason || '', calculationNote: commission.formulaText || commission.calculationNote || '',
      chargebackMethod: commission.chargebackMethod || '', chargebackAmount: Number(commission.chargebackAmount || 0), chargebackReason: commission.chargebackReason || '',
      chargebackHandledBy: commission.chargebackHandledBy || '', chargebackHandledAt: commission.chargebackHandledAt || '',
    };
  });

  const employeeGroups = new Map<string, Commission[]>();
  scoped.forEach((commission) => {
    const key = `${ownerKey(commission)}::${commission.role}`;
    employeeGroups.set(key, [...(employeeGroups.get(key) || []), commission]);
  });
  const employeeRows: CommissionMonthlyEmployeeRow[] = [...employeeGroups.values()].map((rows) => {
    const first = rows[0];
    const rowFormal = rows.filter((item) => !isRecovery(item));
    const uniqueOrders = new Map<string, Commission>(); rowFormal.forEach((item) => uniqueOrders.set(item.orderId, item));
    const orderPaid = roundMoney([...uniqueOrders.entries()].reduce((sum, [orderId, commission]) => sum + (orderPaidAmount(ordersById.get(orderId)) ?? Number(commission.orderAmount || 0)), 0));
    const tierRows = rows.filter(isTiered); const tierSnapshotsForRow = [...new Set(tierRows.map(tierBucketKey))].map((key) => tierSnapshots.get(key)).filter(Boolean) as CommissionTierSnapshot[];
    const issues = exceptionRows.filter((issue) => issue.employee === first.owner).map((issue) => issue.issue);
    const paidDates = rows.map((item) => payoutByCommission.get(item.id)?.issuedAt || item.paidAt || '').filter(Boolean).sort();
    const lastPaidAt = paidDates[paidDates.length - 1] || '';
    return {
      employeeId: first.ownerId || '', employee: first.owner || '待分配', department: first.department || '-', role: first.role,
      orderCount: new Set(rows.map((item) => item.orderId)).size, commissionCount: rows.length, orderPaidAmount: orderPaid,
      ordinaryAmount: roundMoney(rows.filter((item) => !isRecovery(item) && !isTiered(item) && EFFECTIVE_STATUSES.has(item.status)).reduce((sum, item) => sum + amountFor(item), 0)),
      tierPerformanceAmount: roundMoney(tierSnapshotsForRow.reduce((sum, snapshot) => sum + Number(snapshot.baseAmount || 0), 0)),
      tierRate: [...new Set(tierSnapshotsForRow.map((snapshot) => snapshot.currentTier?.rate).filter((rate) => rate !== undefined))].map((rate) => `${rate}%`).join('、') || '-',
      tierAmount: roundMoney(tierRows.filter((item) => EFFECTIVE_STATUSES.has(item.status)).reduce((sum, item) => sum + amountFor(item), 0)),
      recoveryAmount: roundMoney(rows.filter((item) => isRecovery(item) && EFFECTIVE_STATUSES.has(item.status)).reduce((sum, item) => sum + amountFor(item), 0)),
      effectiveAmount: roundMoney(rows.filter((item) => EFFECTIVE_STATUSES.has(item.status)).reduce((sum, item) => sum + amountFor(item), 0)),
      pendingConfirmAmount: statusAmount(rows, '待确认', amountFor), pendingPayAmount: statusAmount(rows, '待发放', amountFor), paidAmount: statusAmount(rows, '已发放', amountFor),
      withdrawnAmount: roundMoney(rows.filter(isWithdrawn).reduce((sum, item) => sum + amountFor(item), 0)), lastPaidAt,
      chargebackAmount: roundMoney(rows.reduce((sum, item) => sum + Number(item.chargebackAmount || 0), 0)),
      checkStatus: issues.length ? '存在异常' : '一致', exceptionNote: [...new Set(issues)].join('；'),
    };
  }).sort((left, right) => clean(left.employee).localeCompare(clean(right.employee), 'zh-CN') || clean(left.role).localeCompare(clean(right.role), 'zh-CN'));

  const tierRows = [...tierGroups.values()].map((rows) => {
    const first = rows[0]; const snapshot = tierSnapshots.get(tierBucketKey(first)); const activeRows = rows.filter((item) => !isWithdrawn(item));
    const excludedRows = rows.filter(isWithdrawn); const amount = roundMoney(activeRows.reduce((sum, item) => sum + amountFor(item), 0));
    const current = snapshot?.currentTier;
    return {
      employee: first.owner, department: first.department || '-', role: first.role, planName: first.payoutPlanSnapshot?.name || first.payoutPlanName || '-',
      planVersion: first.payoutPlanSnapshot?.version || first.payoutPlanVersion || '', includedOrderCount: new Set(activeRows.map((item) => item.orderId)).size,
      includedOrderNos: [...new Set(activeRows.map((item) => item.orderNo))].join('、'), performanceAmount: snapshot?.baseAmount || 0,
      tierRange: current ? `¥${current.minAmount.toFixed(2)} - ${current.maxAmount === undefined ? '不封顶' : `¥${current.maxAmount.toFixed(2)}`}` : '未匹配档位',
      tierRate: current ? `${current.rate}%` : '-', gapToNext: snapshot?.gapToNext || 0,
      formula: current ? `¥${Number(snapshot?.baseAmount || 0).toFixed(2)} × ${current.rate}% = ¥${amount.toFixed(2)}` : '缺少可复算的阶梯快照',
      commissionAmount: amount, excludedOrderNos: [...new Set(excludedRows.map((item) => item.orderNo))].join('、'),
      excludedReason: excludedRows.length ? '已撤回/冲销不计入有效阶梯业绩' : '', checkStatus: current ? '一致' : '缺少阶梯快照',
    };
  });

  const scopedIds = new Set(scoped.map((item) => item.id));
  const payoutRows = input.payoutRecords.flatMap((record) => {
    const relevantIds = record.commissionIds.filter((id) => scopedIds.has(id));
    if (!relevantIds.length) return [];
    const relevantCommissions = scoped.filter((item) => relevantIds.includes(item.id));
    const byOwner = new Map<string, Commission[]>(); relevantCommissions.forEach((item) => byOwner.set(ownerKey(item), [...(byOwner.get(ownerKey(item)) || []), item]));
    const snapshotsById = new Map((record.commissionSnapshots || []).map((snapshot) => [snapshot.id, snapshot]));
    return [...byOwner.values()].map((rows) => ({
      payoutNo: record.payoutNo, status: record.status, issuedAt: record.issuedAt, paymentMethod: record.paymentMethod || '-', paymentReference: record.paymentReference || '-', issuedBy: record.issuedByName || '-',
      employee: rows[0]?.owner || '-', commissionPeriods: [...new Set((record.commissionSnapshots || relevantCommissions).map(periodOf))].sort().join('、'),
      commissionCount: rows.length, allocatedAmount: roundMoney(rows.reduce((sum, item) => sum + Number(snapshotsById.get(item.id)?.commissionAmount ?? amountFor(item)), 0)), recordTotalAmount: Number(record.totalAmount || 0),
      commissionIds: rows.map((item) => item.id).join('、'), crossPeriod: new Set((record.commissionSnapshots || relevantCommissions).map(periodOf)).size > 1 ? '是' : '否',
      reversedAt: record.reversedAt || '', reversedBy: record.reversedByName || '', reverseReason: record.reverseReason || '',
      fundRecoveryStatus: record.status === '已撤销' ? '未知（系统撤销不代表资金已追回）' : '-', note: record.note || '',
    }));
  });

  input.payoutRecords.filter((record) => record.commissionIds.some((id) => scopedIds.has(id))).forEach((record) => {
    if (!record.commissionSnapshots?.length) addException(undefined, `发放单 ${record.payoutNo} 缺少逐笔提成快照`, '历史发放单只能核对汇总，不能证明逐笔金额');
    if (new Set(record.commissionIds).size !== record.commissionIds.length) addException(undefined, `发放单 ${record.payoutNo} 内存在重复提成ID`, '停止对账并核对发放单快照', '阻断');
    if (record.commissionSnapshots?.length) {
      const snapshotTotal = roundMoney(record.commissionSnapshots.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0));
      if (Math.abs(snapshotTotal - Number(record.totalAmount || 0)) >= 0.01) addException(undefined, `发放单 ${record.payoutNo} 总额 ${Number(record.totalAmount || 0).toFixed(2)} 与快照合计 ${snapshotTotal.toFixed(2)} 不一致`, '停止对账并核对原发放单', '阻断');
    }
    if (record.status === '已撤销') addException(undefined, `发放单 ${record.payoutNo} 已在系统撤销，资金是否追回未知`, '核对银行或支付流水，不得自动冲减现金支出');
  });
  duplicatePayoutCommissionIds.forEach((id) => {
    const commission = scoped.find((item) => item.id === id);
    if (commission) addException(commission, '同一提成进入多个发放单', '停止发放并核对重复记账', '阻断');
  });

  const summary: CommissionMonthlyReportSummary = {
    employeeCount: new Set(scoped.map(ownerKey)).size, formalOrderCount: uniqueFormalOrders.size, recoveryOrderCount: new Set(recovery.map((item) => item.orderId)).size,
    formalOrderPaidAmount, effectiveCommissionAmount: roundMoney(effective.reduce((sum, item) => sum + amountFor(item), 0)),
    pendingConfirmAmount: statusAmount(scoped, '待确认', amountFor), pendingPayAmount: statusAmount(scoped, '待发放', amountFor), paidAmount: statusAmount(scoped, '已发放', amountFor),
    withdrawnAmount: roundMoney(scoped.filter(isWithdrawn).reduce((sum, item) => sum + amountFor(item), 0)),
    chargebackAmount: roundMoney(scoped.reduce((sum, item) => sum + Number(item.chargebackAmount || 0), 0)),
    ordinaryCommissionAmount: roundMoney(effective.filter((item) => !isRecovery(item) && !isTiered(item)).reduce((sum, item) => sum + amountFor(item), 0)),
    tierPerformanceAmount: roundMoney([...tierSnapshots.values()].reduce((sum, snapshot) => sum + Number(snapshot?.baseAmount || 0), 0)),
    tierCommissionAmount: roundMoney(effective.filter(isTiered).reduce((sum, item) => sum + amountFor(item), 0)),
    recoveryCommissionAmount: roundMoney(effective.filter(isRecovery).reduce((sum, item) => sum + amountFor(item), 0)), exceptionCount: 0,
  };
  const statusIdentity = roundMoney(summary.pendingConfirmAmount + summary.pendingPayAmount + summary.paidAmount);
  const typeIdentity = roundMoney(summary.ordinaryCommissionAmount + summary.tierCommissionAmount + summary.recoveryCommissionAmount);
  if (statusIdentity !== summary.effectiveCommissionAmount) addException(undefined, '状态汇总与有效应发不一致', '停止发放并核对逐笔明细', '阻断');
  if (typeIdentity !== summary.effectiveCommissionAmount) addException(undefined, '提成类型汇总与有效应发不一致', '停止发放并核对业务类型', '阻断');
  summary.exceptionCount = exceptionRows.length;

  const overviewRows = [
    ['统计月份', input.period, '按提成归属月份统计，不等同于当月现金支出'], ['数据截止时间', input.generatedAt, '报表生成时的服务器数据快照'],
    ['导出人', input.actor.name, `导出原因：${input.reason}`], ['员工人数', summary.employeeCount, '按员工ID去重'],
    ['关联正式订单数', summary.formalOrderCount, '按订单ID去重'], ['售后挽回业务数', summary.recoveryOrderCount, '不计入正式订单阶梯'],
    ['正式订单实付总额', summary.formalOrderPaidAmount, '按订单去重；不可直接求和员工表中的关联实付'], ['本月有效应发', summary.effectiveCommissionAmount, '待确认+待发放+已发放'],
    ['待确认', summary.pendingConfirmAmount, '未进入实际发放'], ['待发放', summary.pendingPayAmount, '已确认、尚未实际发放'], ['已发放', summary.paidAmount, '按归属本月的提成统计'],
    ['已撤回', summary.withdrawnAmount, '不计入有效应发，保留历史'], ['普通订单提成', summary.ordinaryCommissionAmount, '不含阶梯和售后挽回'],
    ['正式订单阶梯业绩', summary.tierPerformanceAmount, '仅纳入正式订单有效阶梯明细'], ['正式订单阶梯提成', summary.tierCommissionAmount, '按方案快照复算'],
    ['售后挽回提成', summary.recoveryCommissionAmount, '不参与正式订单阶梯'], ['异常数量', summary.exceptionCount, summary.exceptionCount ? '请查看“异常与口径说明”' : '无异常'],
    ['核对结果', statusIdentity !== summary.effectiveCommissionAmount || typeIdentity !== summary.effectiveCommissionAmount ? '存在差异' : summary.exceptionCount ? '有异常待处理' : '一致', '员工汇总、状态汇总、类型汇总均应与逐笔有效明细一致'],
  ].map(([item, value, note]) => ({ item, value, note }));

  const policyRows = [
    ['口径', '说明', '月报按提成归属月份统计，不等同于当月实际现金支出。'], ['口径', '说明', '正式订单实付总额按订单ID去重，员工汇总中的关联实付不可跨员工求和。'],
    ['口径', '说明', '售后挽回不参与正式订单月度阶梯累计。'], ['口径', '说明', '已撤回不计入有效应发，但必须保留历史金额和原因。'],
    ['口径', '说明', '已发放是系统终态；历史撤销记录只读保留，新的异常发放请线下处理并保留说明。'],
  ].map(([kind, level, issue]) => ({ kind, level, employee: '-', orderNo: '-', commissionId: '-', issue, suggestion: '依此口径完成月度核对' }));
  const columns = reportColumns();
  const sheets: ReportSheet[] = [
    { name: '月度核对总览', columns: columns['月度核对总览'], rows: overviewRows },
    { name: '员工提成汇总', columns: columns['员工提成汇总'], rows: employeeRows },
    { name: '逐笔提成明细', columns: columns['逐笔提成明细'], rows: detailRows },
    { name: '正式订单阶梯核对', columns: columns['正式订单阶梯核对'], rows: tierRows },
    { name: '发放与撤销记录', columns: columns['发放与撤销记录'], rows: payoutRows },
    { name: '异常与口径说明', columns: columns['异常与口径说明'], rows: [...exceptionRows, ...policyRows] },
  ];
  const timeToken = input.generatedAt.replace(/[-:TZ.]/g, '').slice(0, 14);
  return { filename: `极享OS-员工提成月度核对表-${input.period}-${timeToken}.xlsx`, period: input.period, generatedAt: input.generatedAt, summary, employeeRows, sheets };
}

function normalizeCell(column: ReportColumn, value: CellValue): string | number | Date {
  if (column.type === 'number' || column.type === 'currency') return Number.isFinite(Number(value)) ? Number(value) : 0;
  if (column.type === 'date' && clean(value)) {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) return date;
  }
  return safeText(value);
}

function toArrayBuffer(value: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  const source = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy.buffer;
}

export async function createCommissionMonthlyReportWorkbook(data: CommissionMonthlyReportData): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '极享OS'; workbook.subject = `${data.period} 员工提成财务核对`; workbook.created = new Date(data.generatedAt);
  for (const definition of data.sheets) {
    const sheet = workbook.addWorksheet(definition.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow(definition.columns.map((column) => column.label));
    definition.rows.forEach((row) => sheet.addRow(definition.columns.map((column) => normalizeCell(column, row[column.key]))));
    const header = sheet.getRow(1); header.height = 28; header.font = { bold: true, color: { argb: 'FFFFFFFF' } }; header.alignment = { vertical: 'middle', horizontal: 'center' };
    header.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; cell.border = { bottom: { style: 'thin', color: { argb: 'FF93C5FD' } } }; });
    definition.columns.forEach((column, index) => {
      const worksheetColumn = sheet.getColumn(index + 1); worksheetColumn.width = column.width || Math.min(32, Math.max(12, column.label.length + 6));
      if (column.type === 'currency') worksheetColumn.numFmt = '¥#,##0.00;[Red]-¥#,##0.00';
      if (column.type === 'date') worksheetColumn.numFmt = 'yyyy-mm-dd hh:mm:ss';
    });
    if (definition.rows.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: definition.columns.length } };
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.alignment = { vertical: 'top', wrapText: true };
      if (definition.name === '异常与口径说明' && row.getCell(1).value === '异常') row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F2' } }; });
    });
  }
  return toArrayBuffer(await workbook.xlsx.writeBuffer());
}

export class CommissionMonthlyReportError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); this.name = 'CommissionMonthlyReportError'; }
}

function validateRequest(input: CommissionMonthlyReportRequest): Required<Pick<CommissionMonthlyReportRequest, 'period' | 'reason' | 'scope' | 'includeWithdrawn'>> & Pick<CommissionMonthlyReportRequest, 'departmentId' | 'ownerId'> {
  if (!VALID_PERIOD.test(clean(input.period))) throw new CommissionMonthlyReportError(400, '请选择正确的统计月份');
  if (!clean(input.reason)) throw new CommissionMonthlyReportError(400, '请填写导出原因');
  if (clean(input.reason).length > 500) throw new CommissionMonthlyReportError(400, '导出原因不能超过500字');
  if (!['all', 'department', 'employee'].includes(clean(input.scope))) throw new CommissionMonthlyReportError(400, '导出范围无效');
  if (input.scope === 'department' && !clean(input.departmentId)) throw new CommissionMonthlyReportError(400, '请选择部门');
  if (input.scope === 'employee' && !clean(input.ownerId)) throw new CommissionMonthlyReportError(400, '请选择员工');
  return { period: clean(input.period), reason: clean(input.reason), scope: input.scope, departmentId: clean(input.departmentId) || undefined, ownerId: clean(input.ownerId) || undefined, includeWithdrawn: input.includeWithdrawn !== false };
}

export function createCommissionMonthlyReportService(prisma: ReportPrisma, options: { now?: () => Date } = {}) {
  const now = options.now || (() => new Date());
  const exportWorkbook = async (input: CommissionMonthlyReportRequest, actor: AuthenticatedUser) => {
    try {
      const request = validateRequest(input);
      if (!hasPermission(actor, PERMISSION_KEYS.FINANCE_PAYOUT_REPORT_EXPORT, 'read')) throw new CommissionMonthlyReportError(403, '无权导出提成月度报告');
      const [commissionRows, payoutRows, orderRows] = await Promise.all([
        prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSIONS } }),
        prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES } }),
        prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS } }),
      ]);
      const commissions = commissionRows.map((row) => asObject(row.data) as unknown as Commission);
      const payoutRecords = payoutRows.map((row) => normalizePayoutRecord(row.data)).filter((row): row is CommissionPayoutRecord => Boolean(row));
      const orders = orderRows.map((row) => asObject(row.data) as unknown as Order);
      const generatedAt = now().toISOString();
      const report = buildCommissionMonthlyReportData({ ...request, generatedAt, actor: { id: actor.id, name: actor.name }, commissions, payoutRecords, orders });
      if (!report.sheets[2].rows.length) throw new CommissionMonthlyReportError(400, '当前筛选范围没有可导出的提成数据');
      if (report.sheets[2].rows.length > 50_000) throw new CommissionMonthlyReportError(400, '提成明细超过50000行，请按部门或员工分批导出');
      const buffer = Buffer.from(await createCommissionMonthlyReportWorkbook(report));
      await prisma.businessExportAudit.create({ data: {
        module: 'commission_monthly_report', actorId: actor.id, actorName: actor.name, reason: request.reason,
        filtersSnapshot: JSON.parse(JSON.stringify({ period: request.period, scope: request.scope, departmentId: request.departmentId, ownerId: request.ownerId, includeWithdrawn: request.includeWithdrawn })) as Prisma.InputJsonValue,
        columnMode: 'finance_report', columns: report.sheets.map((sheet) => sheet.name) as unknown as Prisma.InputJsonValue,
        summaryRowCount: report.employeeRows.length, detailRowCount: report.sheets[2].rows.length, filename: report.filename, createdAt: new Date(generatedAt),
      } });
      return success({ filename: report.filename, buffer, summary: report.summary });
    } catch (error) {
      if (error instanceof CommissionMonthlyReportError) return failure(error.message, error.statusCode);
      console.error('[commission-monthly-report-export]', error);
      return failure('提成月度报告生成失败，请稍后重试（错误编号：FIN-CMR-001）', 500);
    }
  };
  return { exportWorkbook };
}
