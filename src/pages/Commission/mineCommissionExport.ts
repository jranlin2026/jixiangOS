import { downloadBusinessExportWorkbook } from '../../api/businessExportWorkbook';
import type {
  BusinessExportColumn,
  BusinessExportResult,
  BusinessExportRow,
} from '../../types/businessExport';
import type {
  Commission,
  CommissionPayoutPlan,
  CommissionTierSnapshot,
  MonthlyCommissionPayout,
} from '../../types/commission';
import { resolveMineTierSnapshot } from './mineCommissionPresentation';

const summaryColumns: BusinessExportColumn[] = [
  { id: 'period', label: '月份', type: 'text' },
  { id: 'employee', label: '员工', type: 'text' },
  { id: 'department', label: '部门', type: 'text' },
  { id: 'orderCount', label: '关联订单数', type: 'number' },
  { id: 'commissionCount', label: '提成笔数', type: 'number' },
  { id: 'orderPaidAmount', label: '关联订单实付金额', type: 'currency' },
  { id: 'totalAmount', label: '本月提成', type: 'currency' },
  { id: 'pendingConfirmAmount', label: '待确认', type: 'currency' },
  { id: 'pendingPayAmount', label: '待发放', type: 'currency' },
  { id: 'paidAmount', label: '已发放', type: 'currency' },
  { id: 'withdrawnAmount', label: '已撤回', type: 'currency' },
  { id: 'tierPerformanceAmount', label: '月度阶梯业绩', type: 'currency' },
  { id: 'tierRate', label: '最终/当前档位', type: 'text' },
  { id: 'tierCommissionAmount', label: '月度阶梯提成', type: 'currency' },
  { id: 'ordinaryCommissionAmount', label: '普通订单提成', type: 'currency' },
  { id: 'recoveryCommissionAmount', label: '售后挽回提成', type: 'currency' },
];

const detailColumns: BusinessExportColumn[] = [
  { id: 'period', label: '提成归属月份', type: 'text' },
  { id: 'employee', label: '员工', type: 'text' },
  { id: 'department', label: '部门', type: 'text' },
  { id: 'commissionType', label: '提成类型', type: 'text' },
  { id: 'businessSource', label: '业务来源', type: 'text' },
  { id: 'role', label: '提成角色', type: 'text' },
  { id: 'customerName', label: '客户名称', type: 'text' },
  { id: 'orderNo', label: '订单号', type: 'text' },
  { id: 'productLevel', label: '产品等级', type: 'text' },
  { id: 'paymentDate', label: '业务成交时间', type: 'date' },
  { id: 'orderPaidAmount', label: '订单实付金额', type: 'currency' },
  { id: 'performanceAmount', label: '业绩核算金额', type: 'currency' },
  { id: 'payoutPlanName', label: '提成方案', type: 'text' },
  { id: 'calculationType', label: '计算方式', type: 'text' },
  { id: 'rateOrAmount', label: '比例/固定金额', type: 'text' },
  { id: 'commissionAmount', label: '应发提成', type: 'currency' },
  { id: 'status', label: '当前状态', type: 'text' },
  { id: 'paidAt', label: '实际发放时间', type: 'date' },
  { id: 'batchId', label: '发放批次', type: 'text' },
  { id: 'manualAdjusted', label: '是否人工调整', type: 'text' },
  { id: 'adjustReason', label: '调整原因', type: 'text' },
  { id: 'calculationNote', label: '计算说明', type: 'text' },
];

const isRecoveryCommission = (commission: Commission) => (
  commission.sourceBusinessType === 'after_sales_recovery'
  || commission.sourceBusinessType === 'refund_recovery'
  || Boolean(commission.sourceRecoveryOrderId)
);

const isWithdrawnStatus = (status: Commission['status']) => (
  ['已撤回', '待冲销', '已冲销', '已取消'].includes(status)
);

const displayStatus = (status: Commission['status']) => (
  isWithdrawnStatus(status) ? '已撤回' : status
);

function tierSnapshotFor(
  row: MonthlyCommissionPayout,
  commission: Commission,
  payoutPlans: CommissionPayoutPlan[],
  useLivePlan: boolean,
): CommissionTierSnapshot | undefined {
  if (commission.ruleCalculationType !== 'tiered_percentage') return undefined;
  const storedSummary = row.roleSummaries?.find((summary) => (
    summary.role === commission.role && summary.isTiered
  ));
  const roleCommissions = row.commissions.filter((item) => (
    item.role === commission.role && item.ruleCalculationType === 'tiered_percentage'
  )).map((item) => (
    item.tierSnapshot || !storedSummary?.tierSnapshot
      ? item
      : { ...item, tierSnapshot: storedSummary.tierSnapshot }
  ));
  return resolveMineTierSnapshot(roleCommissions, payoutPlans, useLivePlan);
}

function displayCommissionAmount(
  row: MonthlyCommissionPayout,
  commission: Commission,
  payoutPlans: CommissionPayoutPlan[],
  useLivePlan: boolean,
): number {
  if (commission.ruleCalculationType !== 'tiered_percentage') return Number(commission.commissionAmount || 0);
  const snapshot = tierSnapshotFor(row, commission, payoutPlans, useLivePlan);
  const rate = snapshot?.currentTier?.rate ?? Number(commission.commissionRate || 0) * 100;
  if (!rate) return Number(commission.commissionAmount || 0);
  return Math.round(Number(commission.performanceAmount || commission.orderAmount || 0) * rate) / 100;
}

function uniqueOrderPaidAmount(commissions: Commission[]): number {
  const orders = new Map<string, number>();
  commissions.forEach((commission) => {
    const key = commission.orderId || commission.orderNo;
    orders.set(key, Math.max(orders.get(key) || 0, Number(commission.orderAmount || 0)));
  });
  return Math.round([...orders.values()].reduce((sum, value) => sum + value, 0) * 100) / 100;
}

function commissionTypeLabel(commission: Commission): string {
  if (isRecoveryCommission(commission)) return '售后挽回提成';
  if (commission.ruleCalculationType === 'tiered_percentage') return '月度阶梯提成';
  return '普通订单提成';
}

function calculationTypeLabel(commission: Commission): string {
  if (commission.ruleCalculationType === 'tiered_percentage') return '月度阶梯';
  if (commission.ruleCalculationType === 'percentage') return '按比例';
  return '固定金额';
}

function rateOrAmountLabel(
  row: MonthlyCommissionPayout,
  commission: Commission,
  payoutPlans: CommissionPayoutPlan[],
  useLivePlan: boolean,
): string {
  if (commission.ruleCalculationType === 'tiered_percentage') {
    const rate = tierSnapshotFor(row, commission, payoutPlans, useLivePlan)?.currentTier?.rate;
    return rate === undefined ? '待结算' : `${rate}%`;
  }
  if (commission.ruleCalculationType === 'percentage') {
    return `${Math.round(Number(commission.commissionRate || 0) * 10_000) / 100}%`;
  }
  return `¥${Number(commission.commissionAmount || 0).toFixed(2)}`;
}

export function buildMineCommissionExportResult(
  period: string,
  rows: MonthlyCommissionPayout[],
  employeeName: string,
  payoutPlans: CommissionPayoutPlan[] = [],
): BusinessExportResult {
  const localNow = new Date();
  const currentPeriod = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}`;
  const useLivePlan = period === currentPeriod;
  const summaryRows: BusinessExportRow[] = rows.map((row) => {
    const tierCommissions = row.commissions.filter((commission) => (
      commission.ruleCalculationType === 'tiered_percentage' && !isRecoveryCommission(commission)
    ));
    const ordinaryCommissions = row.commissions.filter((commission) => (
      commission.ruleCalculationType !== 'tiered_percentage' && !isRecoveryCommission(commission)
    ));
    const recoveryCommissions = row.commissions.filter(isRecoveryCommission);
    const tierSnapshots = [...new Set(tierCommissions.map((commission) => commission.role))]
      .map((role) => tierSnapshotFor(
        row,
        tierCommissions.find((commission) => commission.role === role)!,
        payoutPlans,
        useLivePlan,
      ))
      .filter((snapshot): snapshot is CommissionTierSnapshot => Boolean(snapshot));
    const amountFor = (commission: Commission) => displayCommissionAmount(row, commission, payoutPlans, useLivePlan);
    const pendingConfirmAmount = row.commissions.filter((commission) => commission.status === '待确认').reduce((sum, commission) => sum + amountFor(commission), 0);
    const pendingPayAmount = row.commissions.filter((commission) => commission.status === '待发放').reduce((sum, commission) => sum + amountFor(commission), 0);
    const paidAmount = row.commissions.filter((commission) => commission.status === '已发放').reduce((sum, commission) => sum + amountFor(commission), 0);
    const withdrawnAmount = row.commissions.filter((commission) => isWithdrawnStatus(commission.status)).reduce((sum, commission) => sum + amountFor(commission), 0);
    return {
      period,
      employee: row.owner || employeeName,
      department: row.department || '-',
      orderCount: row.orderCount,
      commissionCount: row.commissions.length,
      orderPaidAmount: uniqueOrderPaidAmount(row.commissions),
      totalAmount: pendingConfirmAmount + pendingPayAmount + paidAmount,
      pendingConfirmAmount,
      pendingPayAmount,
      paidAmount,
      withdrawnAmount,
      tierPerformanceAmount: tierSnapshots.reduce((sum, snapshot) => sum + Number(snapshot.baseAmount || 0), 0),
      tierRate: [...new Set(tierSnapshots.map((snapshot) => snapshot.currentTier?.rate).filter((rate) => rate !== undefined))]
        .map((rate) => `${rate}%`).join('、') || '-',
      tierCommissionAmount: tierCommissions.reduce((sum, commission) => sum + amountFor(commission), 0),
      ordinaryCommissionAmount: ordinaryCommissions.reduce((sum, commission) => sum + amountFor(commission), 0),
      recoveryCommissionAmount: recoveryCommissions.reduce((sum, commission) => sum + amountFor(commission), 0),
    };
  });

  const detailRows: BusinessExportRow[] = rows.flatMap((row) => row.commissions.map((commission) => ({
    period,
    employee: row.owner || employeeName,
    department: commission.department || row.department || '-',
    commissionType: commissionTypeLabel(commission),
    businessSource: isRecoveryCommission(commission) ? '售后挽回' : '正式订单',
    role: commission.role,
    orderNo: commission.orderNo,
    customerName: commission.customerName || '-',
    productLevel: commission.productLevel || '-',
    paymentDate: commission.paymentDate || commission.createdAt,
    orderPaidAmount: commission.orderAmount,
    performanceAmount: commission.performanceAmount || commission.orderAmount,
    payoutPlanName: commission.payoutPlanName || '-',
    calculationType: calculationTypeLabel(commission),
    rateOrAmount: rateOrAmountLabel(row, commission, payoutPlans, useLivePlan),
    commissionAmount: displayCommissionAmount(row, commission, payoutPlans, useLivePlan),
    status: displayStatus(commission.status),
    paidAt: commission.paidAt || '',
    batchId: commission.batchId || '',
    manualAdjusted: commission.isManualAdjusted ? '是' : '否',
    adjustReason: commission.adjustReason || '',
    calculationNote: commission.formulaText || commission.calculationNote || '',
  })));

  const safeEmployeeName = (employeeName || rows[0]?.owner || '员工').replace(/[\\/:*?"<>|]/g, '_');
  return {
    filename: `我的提成明细-${safeEmployeeName}-${period}.xlsx`,
    sheetNames: ['月度汇总', '提成明细'],
    summaryColumns,
    detailColumns,
    summaryRows,
    detailRows,
    audit: {
      module: 'order_settlements',
      reason: '员工导出本人提成明细',
      summaryRowCount: summaryRows.length,
      detailRowCount: detailRows.length,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function downloadMineCommissionStatement(
  period: string,
  rows: MonthlyCommissionPayout[],
  employeeName: string,
  payoutPlans: CommissionPayoutPlan[] = [],
): Promise<void> {
  await downloadBusinessExportWorkbook(buildMineCommissionExportResult(period, rows, employeeName, payoutPlans));
}
