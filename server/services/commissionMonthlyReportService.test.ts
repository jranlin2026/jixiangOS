import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildCommissionMonthlyReportData, createCommissionMonthlyReportService, createCommissionMonthlyReportWorkbook } from './commissionMonthlyReportService';
import type { Commission, CommissionPayoutRecord } from '../../src/types/commission';
import type { Order } from '../../src/types/order';
import type { RecoveryOrder } from '../../src/types/recoveryOrder';
import type { AuthenticatedUser } from '../../src/types/auth';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';

const baseCommission = (overrides: Partial<Commission>): Commission => ({
  id: 'commission-1',
  orderId: 'order-1',
  orderNo: 'ORD-001',
  customerName: '客户甲',
  productLevel: 'L1-潜客',
  orderAmount: 1000,
  performanceAmount: 1000,
  commissionRate: 0.1,
  commissionAmount: 100,
  role: '销售',
  owner: '员工A',
  ownerId: 'user-a',
  department: '销售部',
  departmentId: 'dept-sales',
  paymentDate: '2026-07-10T02:00:00.000Z',
  status: '待发放',
  payoutPlanId: 'plan-1',
  payoutPlanName: '销售固定比例10%',
  payoutPlanVersion: 2,
  ruleCalculationType: 'percentage',
  formulaText: '¥1000 × 10% = ¥100',
  createdAt: '2026-07-10T02:00:00.000Z',
  updatedAt: '2026-07-10T02:00:00.000Z',
  sourceBusinessType: 'formal_order',
  ...overrides,
});

const order = {
  id: 'order-1',
  orderNo: 'ORD-001',
  customerName: '客户甲',
  actualAmount: 900,
  payments: [],
} as unknown as Order;

const commissions: Commission[] = [
  baseCommission({ id: 'sales', owner: '员工A', ownerId: 'user-a', role: '销售', commissionAmount: 100 }),
  baseCommission({ id: 'manager', owner: '经理B', ownerId: 'user-b', role: '销售主管', commissionRate: 0.03, commissionAmount: 30 }),
  baseCommission({
    id: 'recovery', orderId: 'recovery-1', orderNo: 'RCV-001', owner: '员工A', ownerId: 'user-a',
    role: '售后挽回', orderAmount: 500, performanceAmount: 500, commissionAmount: 50,
    sourceBusinessType: 'after_sales_recovery', sourceRecoveryOrderId: 'recovery-1',
  }),
];

const data = buildCommissionMonthlyReportData({
  period: '2026-07',
  reason: '月度财务核对',
  scope: 'all',
  includeWithdrawn: true,
  generatedAt: '2026-07-31T10:00:00.000Z',
  actor: { id: 'finance-1', name: '财务甲' },
  commissions,
  payoutRecords: [] as CommissionPayoutRecord[],
  orders: [order],
  recoveryOrders: [{ id: 'recovery-1', recoveryAmount: 699 } as RecoveryOrder],
});

assert.deepEqual(data.sheets.map((sheet) => sheet.name), [
  '月度核对总览', '员工提成汇总', '逐笔提成明细', '正式订单阶梯核对', '发放与撤销记录', '异常与口径说明',
]);
assert.equal(data.summary.formalOrderPaidAmount, 900, '月度总览必须按订单去重实付');
assert.equal(data.summary.recoveryCommissionAmount, 50);
assert.equal(data.summary.recoveryBusinessAmount, 699, '导出总览必须单独展示售后挽回成交额');
assert.equal(data.summary.tierPerformanceAmount, 0, '售后挽回不得进入正式订单阶梯业绩');
assert.equal(data.summary.effectiveCommissionAmount, 180);
assert.equal(data.employeeRows.filter((row) => row.orderPaidAmount === 900).length, 2, '员工可各自查看关联订单实付');
assert.equal(data.employeeRows.length, 2, '员工汇总必须每人一行，不得按角色拆行');
assert.equal(data.employeeRows.find((row) => row.employee === '员工A')?.role, '销售、售后挽回');
assert.equal(data.employeeRows.find((row) => row.employee === '员工A')?.recoveryBusinessAmount, 699);
const initialDetailRows = data.sheets.find((sheet) => sheet.name === '逐笔提成明细')!.rows;
assert.equal(initialDetailRows.find((row) => row.commissionId === 'sales')?.orderPaidAmount, 900, '正式订单逐笔金额必须与源订单一致');
assert.equal(initialDetailRows.find((row) => row.commissionId === 'recovery')?.orderPaidAmount, 699, '售后逐笔金额必须与源挽回单一致');
assert.equal(
  data.sheets.find((sheet) => sheet.name === '异常与口径说明')?.rows.some((row) => row.issue === '正式订单缺少可核验付款明细'),
  true,
  '没有付款明细时可回退展示实付，但必须保留财务异常提示',
);

const recoveryRoundData = buildCommissionMonthlyReportData({
  period: '2026-07', reason: '售后挽回轮次核对', scope: 'all', includeWithdrawn: true,
  generatedAt: '2026-07-31T10:00:00.000Z', actor: { id: 'finance-1', name: '财务甲' },
  commissions: [
    baseCommission({
      id: 'recovery-v1', orderId: 'recovery-round', orderNo: 'RCV-ROUND',
      sourceBusinessType: 'after_sales_recovery', sourceRecoveryOrderId: 'recovery-round',
      settlementVersion: 1, status: '已撤回', commissionAmount: 40,
    }),
    baseCommission({
      id: 'recovery-v2', orderId: 'recovery-round', orderNo: 'RCV-ROUND',
      sourceBusinessType: 'after_sales_recovery', sourceRecoveryOrderId: 'recovery-round',
      settlementVersion: 2, status: '待发放', commissionAmount: 20,
    }),
  ],
  payoutRecords: [], orders: [],
});
assert.equal(recoveryRoundData.summary.recoveryOrderCount, 1);
assert.equal(recoveryRoundData.summary.recoveryCommissionAmount, 20, '月度报告不能把售后挽回历史撤回轮次重复计入');
assert.equal(recoveryRoundData.sheets.find((sheet) => sheet.name === '逐笔提成明细')?.rows.length, 1);

const formalRoundData = buildCommissionMonthlyReportData({
  period: '2026-07', reason: '正式订单重新分账轮次核对', scope: 'all', includeWithdrawn: true,
  generatedAt: '2026-07-31T10:00:00.000Z', actor: { id: 'finance-1', name: '财务甲' },
  commissions: [
    baseCommission({
      id: 'formal-v1', orderId: 'formal-round', orderNo: 'ORD-ROUND',
      settlementVersion: 1, status: '已撤回', commissionAmount: 100,
    }),
    baseCommission({
      id: 'formal-v2', orderId: 'formal-round', orderNo: 'ORD-ROUND',
      settlementVersion: 2, status: '待发放', commissionAmount: 60,
    }),
  ],
  payoutRecords: [], orders: [],
});
assert.equal(formalRoundData.summary.formalOrderCount, 1);
assert.equal(formalRoundData.summary.ordinaryCommissionAmount, 60, '正式订单重新分账后只能统计最新轮次');
assert.deepEqual(
  formalRoundData.sheets.find((sheet) => sheet.name === '逐笔提成明细')?.rows.map((row) => row.commissionId),
  ['formal-v2'],
  '正式订单历史撤回轮次不得重复出现在当前月报明细',
);

const mixedStatusData = buildCommissionMonthlyReportData({
  period: '2026-07', reason: '混合状态核对', scope: 'all', includeWithdrawn: true,
  generatedAt: '2026-07-31T10:00:00.000Z', actor: { id: 'finance-1', name: '财务甲' },
  commissions: [
    baseCommission({
      id: 'handling-row', orderId: 'handling-order', commissionAmount: 80,
      payoutPlanId: undefined, payoutPlanName: undefined, calculationNote: '缺少提成方案，暂不计算', status: '待确认',
    }),
    baseCommission({
      id: 'confirm-row', orderId: 'confirm-order', commissionAmount: 20, payoutPlanId: 'plan-confirm', status: '待确认',
    }),
  ],
  payoutRecords: [], orders: [], recoveryOrders: [],
});
assert.equal(mixedStatusData.summary.pendingHandlingCount, 1);
assert.equal(mixedStatusData.summary.pendingConfirmAmount, 20, '导出不得把待处理临时金额混入待确认');
assert.equal(mixedStatusData.summary.effectiveCommissionAmount, 20);
assert.match(String(mixedStatusData.employeeRows[0].statusDistribution), /待处理1笔/);
assert.match(String(mixedStatusData.employeeRows[0].statusDistribution), /待确认1笔/);

const tiers = [
  { minAmount: 0, maxAmount: 30_000, rate: 8 },
  { minAmount: 30_000, maxAmount: 50_000, rate: 10 },
  { minAmount: 50_000, maxAmount: 100_000, rate: 15 },
  { minAmount: 100_000, rate: 20 },
];
const tierCommissions: Commission[] = [
  baseCommission({
    id: 'tier-1', orderId: 'tier-order-1', orderNo: 'ORD-T1', orderAmount: 30_000, performanceAmount: 30_000,
    commissionAmount: 4_500, commissionRate: 0.15, ruleCalculationType: 'tiered_percentage', payoutPlanId: 'tier-plan',
    payoutPlanName: '销售月度阶梯', payoutPlanVersion: 3,
    payoutPlanSnapshot: { id: 'tier-plan', name: '销售月度阶梯', commissionType: 'tiered_percentage', commissionValue: 0, version: 3, tiers },
    status: '已发放', paidAt: '2026-08-05T03:00:00.000Z',
  }),
  baseCommission({
    id: 'tier-2', orderId: 'tier-order-2', orderNo: 'ORD-T2', orderAmount: 55_610, performanceAmount: 55_610,
    commissionAmount: 4_448.8, commissionRate: 0.08, ruleCalculationType: 'tiered_percentage', payoutPlanId: 'tier-plan',
    payoutPlanName: '销售月度阶梯', payoutPlanVersion: 3,
    payoutPlanSnapshot: { id: 'tier-plan', name: '销售月度阶梯', commissionType: 'tiered_percentage', commissionValue: 0, version: 3, tiers },
  }),
];
const payoutRecord: CommissionPayoutRecord = {
  id: 'payout-1', payoutNo: 'FF-202608-001', period: '2026-08', status: '已撤销', totalCount: 2, totalAmount: 6_600,
  commissionIds: ['tier-1', 'old-june'], commissionSnapshots: [
    tierCommissions[0],
    baseCommission({ id: 'old-june', paymentDate: '2026-06-20T00:00:00.000Z', commissionAmount: 2_100 }),
  ],
  byOwner: [{ ownerId: 'user-a', owner: '员工A', departmentId: 'dept-sales', department: '销售部', count: 2, amount: 4_500 }],
  createdAt: '2026-08-05T03:00:00.000Z', createdById: 'finance-1', createdByName: '财务甲',
  issuedAt: '2026-08-05T03:00:00.000Z', issuedById: 'finance-1', issuedByName: '财务甲', paymentMethod: '银行转账',
  paymentReference: 'BANK-001', reversedAt: '2026-08-06T03:00:00.000Z', reversedById: 'finance-manager', reversedByName: '财务主管', reverseReason: '发放账号错误',
};
const tierData = buildCommissionMonthlyReportData({
  period: '2026-07', reason: '月度财务核对', scope: 'all', includeWithdrawn: true,
  generatedAt: '2026-07-31T10:00:00.000Z', actor: { id: 'finance-1', name: '财务甲' },
  commissions: tierCommissions, payoutRecords: [payoutRecord], orders: [],
});
assert.equal(tierData.summary.tierPerformanceAmount, 85_610);
assert.equal(tierData.summary.tierCommissionAmount, 12_841.5);
const tierSheet = tierData.sheets.find((sheet) => sheet.name === '正式订单阶梯核对')!;
assert.equal(tierSheet.rows[0].tierRate, '15%');
assert.match(String(tierSheet.rows[0].formula), /¥85610\.00 × 15% = ¥12841\.50/);
const payoutSheet = tierData.sheets.find((sheet) => sheet.name === '发放与撤销记录')!;
assert.equal(payoutSheet.rows[0].crossPeriod, '是');
assert.match(String(payoutSheet.rows[0].fundRecoveryStatus), /不代表资金已追回/);
assert.equal(payoutSheet.rows[0].allocatedAmount, 4_500, '本报表只分配归属7月的发放金额');

const buffer = await createCommissionMonthlyReportWorkbook(data);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(buffer);
assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), data.sheets.map((sheet) => sheet.name));

const auditRows: Array<Record<string, unknown>> = [];
const service = createCommissionMonthlyReportService({
  businessRecord: {
    findMany: async ({ where }: { where: { domain: string } }) => {
      if (where.domain === STORAGE_KEYS.COMMISSIONS) return commissions.map((commission) => ({ data: commission }));
      if (where.domain === STORAGE_KEYS.ORDERS) return [{ data: order }];
      return [];
    },
  },
  businessExportAudit: { create: async ({ data: audit }: { data: Record<string, unknown> }) => { auditRows.push(audit); return audit; } },
} as never, { now: () => new Date('2026-07-31T10:00:00.000Z') });
const financeActor = {
  id: 'finance-1', name: '财务甲', account: 'finance', email: '', phone: '', role: '财务', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.FINANCE_PAYOUT_REPORT_EXPORT, actions: ['read'] }],
} as AuthenticatedUser;
const exportResult = await service.exportWorkbook({ period: '2026-07', reason: '月度财务核对', scope: 'all' }, financeActor);
assert.equal(exportResult.code, 0);
assert.equal(auditRows.length, 1, '导出成功必须记录导出人、原因、范围和行数');
assert.equal(auditRows[0].module, 'commission_monthly_report');
assert.equal(auditRows[0].reason, '月度财务核对');
assert.equal(auditRows[0].columnMode, 'finance_report');
assert.ok(String(auditRows[0].columnMode).length <= 20, '审计列模式不得超过数据库 VARCHAR(20)');

const missingReason = await service.exportWorkbook({ period: '2026-07', reason: '  ', scope: 'all' }, financeActor);
assert.equal(missingReason.code, 400);
const unauthorized = await service.exportWorkbook(
  { period: '2026-07', reason: '月度财务核对', scope: 'all' },
  { ...financeActor, permissions: [] },
);
assert.equal(unauthorized.code, 403);

const recoveryBusinessTimeAuditRows: Array<Record<string, unknown>> = [];
const historicalRecoveryCommission = baseCommission({
  id: 'historical-recovery-created-in-july',
  orderId: 'historical-recovery-order',
  orderNo: 'RCV-BUSINESS-IN-JUNE',
  sourceBusinessType: 'after_sales_recovery',
  sourceRecoveryOrderId: 'historical-recovery-order',
  paymentDate: '2026-07-25T12:36:40.000Z',
  createdAt: '2026-07-25T12:36:40.000Z',
});
const recoveryBusinessTimeService = createCommissionMonthlyReportService({
  businessRecord: {
    findMany: async ({ where }: { where: { domain: string } }) => {
      if (where.domain === STORAGE_KEYS.COMMISSIONS) return [{ data: historicalRecoveryCommission }];
      if (where.domain === STORAGE_KEYS.RECOVERY_ORDERS) return [{ data: {
        id: 'historical-recovery-order',
        recoveryAt: '2026-06-15T08:00:00.000Z',
      } }];
      return [];
    },
  },
  businessExportAudit: {
    create: async ({ data: audit }: { data: Record<string, unknown> }) => {
      recoveryBusinessTimeAuditRows.push(audit);
      return audit;
    },
  },
} as never, { now: () => new Date('2026-07-31T10:00:00.000Z') });
const julyRecoveryExport = await recoveryBusinessTimeService.exportWorkbook(
  { period: '2026-07', reason: '核对售后归月', scope: 'all' },
  financeActor,
);
assert.equal(julyRecoveryExport.code, 400, '导出也不得按分账创建月份纳入售后挽回');
const juneRecoveryExport = await recoveryBusinessTimeService.exportWorkbook(
  { period: '2026-06', reason: '核对售后归月', scope: 'all' },
  financeActor,
);
assert.equal(juneRecoveryExport.code, 0, juneRecoveryExport.message);
assert.equal((juneRecoveryExport.data as { summary?: { recoveryOrderCount?: number } })?.summary?.recoveryOrderCount, 1, '导出必须按挽回成交月份纳入售后订单');
assert.equal(recoveryBusinessTimeAuditRows.length, 1, '没有数据的错误月份不能写入导出审计');

console.log('commission monthly report service tests passed');
