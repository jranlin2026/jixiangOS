import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildCommissionMonthlyReportData, createCommissionMonthlyReportService, createCommissionMonthlyReportWorkbook } from './commissionMonthlyReportService';
import type { Commission, CommissionPayoutRecord } from '../../src/types/commission';
import type { Order } from '../../src/types/order';
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
  actualAmount: 1000,
  payments: [{ id: 'payment-1', amount: 1000, paidAt: '2026-07-10T02:00:00.000Z' }],
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
});

assert.deepEqual(data.sheets.map((sheet) => sheet.name), [
  '月度核对总览', '员工提成汇总', '逐笔提成明细', '正式订单阶梯核对', '发放与撤销记录', '异常与口径说明',
]);
assert.equal(data.summary.formalOrderPaidAmount, 1000, '月度总览必须按订单去重实付');
assert.equal(data.summary.recoveryCommissionAmount, 50);
assert.equal(data.summary.tierPerformanceAmount, 0, '售后挽回不得进入正式订单阶梯业绩');
assert.equal(data.summary.effectiveCommissionAmount, 180);
assert.equal(data.employeeRows.filter((row) => row.orderPaidAmount === 1000).length, 2, '员工可各自查看关联订单实付');

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

console.log('commission monthly report service tests passed');
