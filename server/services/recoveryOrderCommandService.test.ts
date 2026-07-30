import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Commission, CommissionPayoutRecord } from '../../src/types/commission';
import type { RecoveryOrder, RecoveryOrderInput } from '../../src/types/recoveryOrder';
import { createRecoveryOrderCommandService } from './recoveryOrderCommandService';

const NOW = '2026-07-12T18:00:00.000Z';
const INLINE_PROOF = `data:image/png;base64,${'A'.repeat(10_000)}`;
const creator: AuthenticatedUser = {
  id: 'user-delivery', name: '交付A', account: 'delivery', email: 'delivery@example.com', phone: '',
  role: '交付工程师', roleId: 'role-delivery', departmentId: 'dept-delivery', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, actions: ['read', 'write'] }],
};
const other: AuthenticatedUser = {
  ...creator, id: 'user-other', name: '交付B', account: 'other', email: 'other@example.com',
};
const outsideDepartmentCreator: AuthenticatedUser = {
  ...creator,
  id: 'user-customer-success',
  name: '客户成功A',
  account: 'customer-success',
  email: 'customer-success@example.com',
  departmentId: 'dept-customer-success',
};
const staleReviewer: AuthenticatedUser = {
  ...creator,
  id: 'user-stale-reviewer',
  name: '非财务审核残留账号',
  account: 'stale-reviewer',
  email: 'stale-reviewer@example.com',
  role: 'customer-success-manager',
  roleId: 'role-stale-reviewer',
  permissions: [
    { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY, actions: ['read'] },
    { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, actions: ['read'] },
  ],
};
const reviewer: AuthenticatedUser = {
  ...creator,
  id: 'user-reviewer',
  name: '售后主管',
  account: 'reviewer',
  email: 'reviewer@example.com',
  role: '售后主管',
  roleId: 'role-reviewer',
  permissions: [
    { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, actions: ['read'] },
    { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE, actions: ['read', 'delete'] },
    { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_CORRECT, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_HISTORY, actions: ['read'] },
  ],
};
const superAdmin: AuthenticatedUser = {
  ...reviewer,
  id: 'user-super-admin',
  name: '超级管理员',
  account: 'admin',
  email: 'admin@example.com',
  role: '超级管理员',
  roleId: 'role-super-admin',
  permissions: [{ module: '全部', actions: ['read', 'write', 'delete', 'admin'] }],
};

function dbUser(user: AuthenticatedUser) {
  return {
    id: user.id, name: user.name, account: user.account, email: user.email, phone: user.phone,
    role: user.role, avatar: null, departmentId: user.departmentId || null, positionId: null,
    positionName: null, roleId: user.roleId || null, passwordHash: null, passwordSalt: null,
    passwordUpdatedAt: null, lastLoginAt: null, isActive: true, employmentStatus: 'active', leftAt: null,
    leftBy: null, createdAt: new Date(NOW), updatedAt: new Date(NOW),
  };
}

function input(overrides: Partial<RecoveryOrderInput> = {}): RecoveryOrderInput {
  return {
    customerName: '张三', thirdPartyOrderNo: 'TP-20260712-001', originalProduct: '899课程',
    originalProductId: 'product-899', originalProductLevel: '899',
    originalAmount: 899, recoveryAmount: 2980, recoveryAt: '2026-07-12T15:30:00.000Z', recoveryUserId: creator.id,
    officialPaymentChannel: '对公银行转账', paymentOrderNo: 'PAY-20260712-001', paymentAt: '2026-07-12T15:20:00.000Z',
    recoveryUserName: '伪造姓名', customerWechat: 'zhangsan', createdBy: other.id, createdByName: other.name, ...overrides,
  };
}

const oldRecord: RecoveryOrder = {
  id: 'recovery-old', recoveryNo: 'RCV-OLD', thirdPartyOrderNo: 'TP-OLD', customerId: '',
  customerName: '历史客户', customerMatchStatus: '手工填写', originalProduct: '历史产品',
  originalAmount: 100, recoveryAmount: 200, recoveryUserId: other.id, recoveryUserName: other.name,
  recoveryAt: '2026-07-10T10:00:00.000Z',
  status: '待审核', settlementStatus: '待处理', commissionIds: [], createdBy: other.id,
  createdByName: other.name, createdAt: NOW, updatedAt: NOW,
  paymentVoucherPreview: INLINE_PROOF,
  chatEvidencePreview: INLINE_PROOF,
  customerPhone: '13800000000',
  customerWechat: 'private-wechat',
  remark: 'finance list must not expose this note',
  importBatchId: 'batch-visible',
  importRowNumber: 2,
  importedById: creator.id,
  importedByName: creator.name,
  importedAt: NOW,
  targetCreatorId: other.id,
  targetCreatorName: other.name,
};
const finance: AuthenticatedUser = {
  ...creator,
  id: 'user-finance',
  name: '财务A',
  account: 'finance',
  email: 'finance@example.com',
  role: '财务专员',
  roleId: 'role-finance',
  departmentId: 'dept-finance',
  permissions: [{ module: PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, actions: ['read', 'write'] }],
};
const outsideDepartmentRecord: RecoveryOrder = {
  ...oldRecord,
  id: 'recovery-outside-department',
  recoveryNo: 'RCV-OUTSIDE-DEPARTMENT',
  thirdPartyOrderNo: 'TP-OUTSIDE-DEPARTMENT',
  recoveryUserId: creator.id,
  recoveryUserName: creator.name,
  recoveryAt: '2026-07-14T10:00:00.000Z',
  createdBy: outsideDepartmentCreator.id,
  createdByName: outsideDepartmentCreator.name,
  importBatchId: 'batch-outside',
  importRowNumber: 3,
};

const key = (domain: string, id: string) => `${domain}\u0000${id}`;
const clone = <T>(value: T): T => structuredClone(value);

function matchesBusinessRecordWhere(row: any, where: any): boolean {
  if (!where) return true;
  if (where.domain !== undefined && row.domain !== where.domain) return false;
  if (where.orderId !== undefined && row.orderId !== where.orderId) return false;
  if (where.recordId?.in && !where.recordId.in.includes(row.recordId)) return false;
  if (where.data?.path && where.data.equals !== undefined) {
    const field = String(where.data.path).replace(/^\$\./, '');
    if (row.data?.[field] !== where.data.equals) return false;
  }
  if (Array.isArray(where.OR) && !where.OR.some((candidate: any) => matchesBusinessRecordWhere(row, candidate))) return false;
  return true;
}

class FakePrisma {
  readonly businessFindManyWheres: any[] = [];
  rows = new Map<string, any>([
    [key(STORAGE_KEYS.RECOVERY_ORDERS, oldRecord.id), {
      id: `${STORAGE_KEYS.RECOVERY_ORDERS}:${oldRecord.id}`, domain: STORAGE_KEYS.RECOVERY_ORDERS,
      recordId: oldRecord.id, status: oldRecord.status, data: clone(oldRecord),
    }],
    [key(STORAGE_KEYS.RECOVERY_ORDERS, outsideDepartmentRecord.id), {
      id: `${STORAGE_KEYS.RECOVERY_ORDERS}:${outsideDepartmentRecord.id}`, domain: STORAGE_KEYS.RECOVERY_ORDERS,
      recordId: outsideDepartmentRecord.id, status: outsideDepartmentRecord.status, data: clone(outsideDepartmentRecord),
    }],
  ]);
  readonly user = { findMany: async () => [dbUser(creator), dbUser(other), dbUser(outsideDepartmentCreator), dbUser(staleReviewer), dbUser(reviewer), dbUser(finance), dbUser(superAdmin)] };
  readonly role = { findMany: async () => [{
    id: 'role-delivery', name: '交付工程师', code: 'delivery_engineer', departmentId: 'dept-delivery',
    permissions: creator.permissions, dataScopes: { recoveryOrderApplications: 'self' }, memberCount: 2,
    isActive: true, createdAt: new Date(NOW), updatedAt: new Date(NOW), description: null,
  }, {
    id: 'role-reviewer', name: '售后主管', code: 'after_sales_manager', departmentId: 'dept-delivery',
    permissions: reviewer.permissions, dataScopes: { recoveryOrderApplications: 'all' }, memberCount: 1,
    isActive: true, createdAt: new Date(NOW), updatedAt: new Date(NOW), description: null,
  }, {
    id: 'role-finance', name: '财务专员', code: 'finance_specialist', departmentId: 'dept-finance',
    permissions: finance.permissions, dataScopes: { recoveryOrders: 'all' }, memberCount: 1,
    isActive: true, createdAt: new Date(NOW), updatedAt: new Date(NOW), description: null,
  }, {
    id: 'role-super-admin', name: '超级管理员', code: 'super_admin', departmentId: null,
    permissions: superAdmin.permissions, dataScopes: { recoveryOrders: 'all', recoveryOrderApplications: 'all' }, memberCount: 1,
    isActive: true, createdAt: new Date(NOW), updatedAt: new Date(NOW), description: null,
  }, {
    id: 'role-stale-reviewer', name: 'customer-success-manager', code: 'customer_success_manager', departmentId: 'dept-delivery',
    permissions: staleReviewer.permissions,
    dataScopes: { recoveryOrders: 'department', recoveryOrderApplications: 'self' },
    memberCount: 1,
    isActive: true, createdAt: new Date(NOW), updatedAt: new Date(NOW), description: null,
  }] };
  readonly department = { findMany: async () => [{
    id: 'dept-delivery', name: '交付部', code: 'DELIVERY', parentId: null, managerId: null,
    memberCount: 2, sortOrder: 1, isActive: true, createdAt: new Date(NOW), updatedAt: new Date(NOW),
  }, {
    id: 'dept-finance', name: '财务部', code: 'FINANCE', parentId: null, managerId: null,
    memberCount: 1, sortOrder: 3, isActive: true, createdAt: new Date(NOW), updatedAt: new Date(NOW),
  }, {
    id: 'dept-customer-success', name: '客户成功部', code: 'CUSTOMER_SUCCESS', parentId: null, managerId: null,
    memberCount: 1, sortOrder: 2, isActive: true, createdAt: new Date(NOW), updatedAt: new Date(NOW),
  }] };
  readonly businessRecord = {
    findMany: async ({ where }: any) => {
      this.businessFindManyWheres.push(clone(where));
      return Array.from(this.rows.values())
        .filter((row: any) => matchesBusinessRecordWhere(row, where))
        .map(clone);
    },
    findUnique: async ({ where }: any) => {
      const target = where.domain_recordId;
      return clone(this.rows.get(key(target.domain, target.recordId)) || null);
    },
  };

  async $transaction<T>(callback: (transaction: any) => Promise<T>): Promise<T> {
    const staged = new Map(Array.from(this.rows.entries()).map(([id, row]) => [id, clone(row)]));
    const tx = { businessRecord: {
      findMany: async ({ where }: any) => {
        this.businessFindManyWheres.push(clone(where));
        return Array.from(staged.values()).filter((row: any) => matchesBusinessRecordWhere(row, where)).map(clone);
      },
      findUnique: async ({ where }: any) => {
        const target = where.domain_recordId;
        return clone(staged.get(key(target.domain, target.recordId)) || null);
      },
      create: async ({ data }: any) => {
        const target = key(data.domain, data.recordId);
        if (staged.has(target)) {
          const error = new Error('unique');
          Object.assign(error, { code: 'P2002' });
          throw error;
        }
        staged.set(target, clone(data));
        return clone(data);
      },
      update: async ({ where, data }: any) => {
        const target = where.domain_recordId;
        const targetKey = key(target.domain, target.recordId);
        const current = staged.get(targetKey);
        if (!current) throw new Error(`missing ${targetKey}`);
        const next = { ...current, ...clone(data) };
        staged.set(targetKey, next);
        return clone(next);
      },
      delete: async ({ where }: any) => {
        const target = where.domain_recordId;
        const targetKey = key(target.domain, target.recordId);
        const current = staged.get(targetKey);
        if (!current) throw new Error(`missing ${targetKey}`);
        staged.delete(targetKey);
        return clone(current);
      },
    },
    $queryRaw: async (query: { values?: unknown[] } | TemplateStringsArray, ...values: unknown[]) => {
      const boundValues = Array.isArray((query as { values?: unknown[] })?.values)
        ? (query as { values: unknown[] }).values
        : values;
      const domain = String(boundValues[0] || '');
      const recordOrOrderId = String(boundValues[1] || '');
      if (domain === STORAGE_KEYS.COMMISSIONS) {
        const rows = Array.from(staged.values())
          .filter((row: any) => row.domain === domain && row.orderId === recordOrOrderId)
          .map((row: any) => ({ recordId: row.recordId, status: row.status, data: clone(row.data) }));
        if (rows.length) return rows;
        const direct = staged.get(key(domain, recordOrOrderId));
        return direct ? [{ recordId: direct.recordId, status: direct.status, data: clone(direct.data) }] : [];
      }
      const row = staged.get(key(domain, recordOrOrderId));
      return row ? [clone(row)] : [];
    } };
    const result = await callback(tx);
    this.rows = staged;
    return result;
  }

  records(): RecoveryOrder[] {
    return Array.from(this.rows.values())
      .filter((row: any) => row.domain === STORAGE_KEYS.RECOVERY_ORDERS)
      .map((row: any) => clone(row.data));
  }
}

const prisma = new FakePrisma();
const service = createRecoveryOrderCommandService(prisma as any, { now: () => new Date(NOW) });

const paidPrisma = new FakePrisma();
const paidOrder: RecoveryOrder = {
  ...oldRecord,
  id: 'recovery-paid-correction',
  recoveryNo: 'RCV-PAID-CORRECTION',
  thirdPartyOrderNo: 'TP-PAID-CORRECTION',
  customerName: '更正前客户',
  originalProduct: '更正前产品',
  originalProductLevel: 'AI产品',
  recoveryAmount: 599,
  recoveryAt: '2026-07-24T12:42:00.000Z',
  status: '审核通过',
  settlementStatus: '待发放',
  settlementPaidAt: undefined,
  recoveryUserId: finance.id,
  recoveryUserName: finance.name,
  assistUserId: finance.id,
  assistUserName: finance.name,
  commissionIds: ['commission-paid-correction', 'commission-paid-correction-later'],
};
const paidCommission: Commission & { payoutRecordId: string } = {
  id: 'commission-paid-correction',
  orderId: paidOrder.id,
  orderNo: paidOrder.recoveryNo,
  customerName: paidOrder.customerName,
  productLevel: 'AI产品',
  orderAmount: 599,
  performanceAmount: 599,
  commissionRate: 0,
  commissionAmount: 60,
  role: '挽回人员',
  owner: finance.name,
  ownerId: finance.id,
  department: '财务部',
  departmentId: 'dept-finance',
  paymentDate: paidOrder.recoveryAt,
  status: '已发放',
  commissionType: 'recovery',
  sourceRecoveryOrderId: paidOrder.id,
  sourceBusinessType: 'after_sales_recovery',
  isRecoveryBonus: true,
  batchId: 'payout-paid-correction',
  payoutRecordId: 'payout-paid-correction',
  paidAt: '2026-07-30T01:44:00.000Z',
  createdAt: '2026-07-24T12:45:00.000Z',
  updatedAt: '2026-07-30T01:44:00.000Z',
};
const laterPaidCommission: Commission & { payoutRecordId: string } = {
  ...paidCommission,
  id: 'commission-paid-correction-later',
  role: '协助人员',
  paidAt: '2026-07-30T03:44:00.000Z',
  payoutRecordId: 'payout-paid-correction-later',
};
const paidPayoutRecord = (commission: Commission): CommissionPayoutRecord => ({
  id: commission.payoutRecordId || `payout-${commission.id}`,
  payoutNo: `FF-${commission.id}`,
  period: String(commission.paymentDate).slice(0, 7),
  status: '已发放',
  totalCount: 1,
  totalAmount: commission.commissionAmount,
  commissionIds: [commission.id],
  commissionSnapshots: [clone(commission)],
  byOwner: [{
    ownerId: commission.ownerId,
    owner: commission.owner,
    departmentId: commission.departmentId,
    department: commission.department,
    count: 1,
    amount: commission.commissionAmount,
  }],
  createdAt: commission.paidAt || NOW,
  createdById: superAdmin.id,
  createdByName: superAdmin.name,
  issuedAt: commission.paidAt || NOW,
  issuedById: superAdmin.id,
  issuedByName: superAdmin.name,
});
paidPrisma.rows.set(key(STORAGE_KEYS.RECOVERY_ORDERS, paidOrder.id), {
  id: `${STORAGE_KEYS.RECOVERY_ORDERS}:${paidOrder.id}`,
  domain: STORAGE_KEYS.RECOVERY_ORDERS,
  recordId: paidOrder.id,
  status: paidOrder.status,
  orderId: paidOrder.id,
  eventAt: new Date(paidOrder.recoveryAt!),
  data: clone(paidOrder),
});
paidPrisma.rows.set(key(STORAGE_KEYS.COMMISSIONS, paidCommission.id), {
  id: `${STORAGE_KEYS.COMMISSIONS}:${paidCommission.id}`,
  domain: STORAGE_KEYS.COMMISSIONS,
  recordId: paidCommission.id,
  status: paidCommission.status,
  owner: paidCommission.owner,
  orderId: paidOrder.id,
  amount: paidCommission.commissionAmount,
  eventAt: new Date(paidCommission.paymentDate!),
  data: clone(paidCommission),
});
paidPrisma.rows.set(key(STORAGE_KEYS.COMMISSIONS, laterPaidCommission.id), {
  id: `${STORAGE_KEYS.COMMISSIONS}:${laterPaidCommission.id}`,
  domain: STORAGE_KEYS.COMMISSIONS,
  recordId: laterPaidCommission.id,
  status: laterPaidCommission.status,
  owner: laterPaidCommission.owner,
  orderId: paidOrder.id,
  amount: laterPaidCommission.commissionAmount,
  eventAt: new Date(laterPaidCommission.paymentDate!),
  data: clone(laterPaidCommission),
});
for (const payout of [paidPayoutRecord(paidCommission), paidPayoutRecord(laterPaidCommission)]) {
  paidPrisma.rows.set(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, payout.id), {
    id: `${STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES}:${payout.id}`,
    domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
    recordId: payout.id,
    status: payout.status,
    orderId: paidOrder.id,
    eventAt: new Date(payout.issuedAt),
    data: clone(payout),
  });
}
const paidService = createRecoveryOrderCommandService(paidPrisma as any, { now: () => new Date(NOW) });
const reviewerPaidPrecheck = await paidService.precheckCorrection(paidOrder.id, reviewer);
assert.equal(reviewerPaidPrecheck.data?.allowed, false, '非超级管理员不得更正已发放售后挽回订单');
const adminPaidPrecheck = await paidService.precheckCorrection(paidOrder.id, superAdmin);
assert.equal(adminPaidPrecheck.data?.allowed, true, adminPaidPrecheck.message);
assert.equal(adminPaidPrecheck.data?.requiresImpactPreview, true, '已发放更正必须先做影响预览');
const paidCorrectionInput = {
  reason: '原挽回成交时间和业务资料录入错误',
  data: input({
    customerName: '更正后客户',
    thirdPartyOrderNo: paidOrder.thirdPartyOrderNo,
    originalProduct: '更正后产品',
    originalProductLevel: '软件服务',
    originalAmount: 899,
    recoveryAmount: 699,
    recoveryAt: '2026-06-05T06:51:00.000Z',
    recoveryUserId: finance.id,
    assistUserId: finance.id,
  }),
};
const reviewerPaidPreview = await paidService.previewCorrection(paidOrder.id, paidCorrectionInput, reviewer);
assert.equal(reviewerPaidPreview.code, 403, '非超管不得预览已发放更正影响');
const reviewerPaidCorrect = await paidService.correct(paidOrder.id, paidCorrectionInput, reviewer);
assert.equal(reviewerPaidCorrect.code, 403, '非超管不得执行已发放更正');
const paidPreview = await paidService.previewCorrection(paidOrder.id, paidCorrectionInput, superAdmin);
assert.equal(paidPreview.code, 0, paidPreview.message);
assert.equal(paidPreview.data?.supplementAmount, 0, '仅更正业务时间不应伪造补发差额');
const immutablePaidPayoutSnapshots = [paidCommission, laterPaidCommission]
  .map((commission) => clone(paidPrisma.rows.get(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, commission.payoutRecordId!))?.data));
const correctedPaidOrder = await paidService.correct(paidOrder.id, {
  ...paidCorrectionInput,
  expectedImpactHash: paidPreview.data!.impactHash,
}, superAdmin);
assert.equal(correctedPaidOrder.code, 0, correctedPaidOrder.message);
assert.equal(correctedPaidOrder.data?.settlementStatus, '已发放', '发放后业务更正不得回退发放状态');
assert.equal(correctedPaidOrder.data?.settlementPaidAt, laterPaidCommission.paidAt, '历史结算状态滞后时应取最后一笔实际发放时间');
assert.equal(correctedPaidOrder.data?.recoveryAt, '2026-06-05T06:51:00.000Z');
assert.match(correctedPaidOrder.data?.changeHistory?.[0]?.summary || '', /保留原发放记录/);
const correctedPaidCommission = paidPrisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, paidCommission.id))?.data as Commission & { payoutRecordId?: string };
assert.equal(correctedPaidCommission.status, '已发放');
assert.equal(correctedPaidCommission.commissionAmount, 60, '发放后业务资料更正不得覆盖原发放金额');
assert.equal(correctedPaidCommission.ownerId, finance.id, '发放后业务资料更正不得覆盖原提成人员');
assert.equal(correctedPaidCommission.paidAt, paidCommission.paidAt);
assert.equal(correctedPaidCommission.payoutRecordId, paidCommission.payoutRecordId);
assert.equal(correctedPaidCommission.customerName, '更正后客户');
assert.equal(correctedPaidCommission.productLevel, '软件服务');
assert.equal(correctedPaidCommission.orderAmount, 699);
assert.equal(correctedPaidCommission.performanceAmount, 699);
assert.equal(correctedPaidCommission.paymentDate, '2026-06-05T06:51:00.000Z', '员工月报归属时间必须同步到更正后的挽回成交时间');
assert.equal(
  paidPrisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, paidCommission.id))?.eventAt?.toISOString(),
  '2026-06-05T06:51:00.000Z',
  '数据库事件时间必须同步更新，避免筛选和月报口径不一致',
);
assert.deepEqual(
  [paidCommission, laterPaidCommission]
    .map((commission) => paidPrisma.rows.get(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, commission.payoutRecordId!))?.data),
  immutablePaidPayoutSnapshots,
  '更正不得修改不可变发放单及其逐笔快照',
);
const pendingCommission: Commission = {
  ...paidCommission,
  id: 'commission-pending-correction',
  role: '挽回人员',
  roleCode: 'recovery_owner',
  ruleCalculationType: 'percentage',
  commissionRate: 0.1,
  commissionAmount: 69.9,
  performanceAmount: 699,
  orderAmount: 699,
  status: '待发放',
  batchId: undefined,
  paidAt: undefined,
  payoutRecordId: undefined,
};
paidPrisma.rows.set(key(STORAGE_KEYS.COMMISSIONS, pendingCommission.id), {
  id: `${STORAGE_KEYS.COMMISSIONS}:${pendingCommission.id}`,
  domain: STORAGE_KEYS.COMMISSIONS,
  recordId: pendingCommission.id,
  status: pendingCommission.status,
  owner: pendingCommission.owner,
  orderId: paidOrder.id,
  amount: pendingCommission.commissionAmount,
  eventAt: new Date(pendingCommission.paymentDate!),
  data: clone(pendingCommission),
});
const mixedCorrectionInput = {
  reason: '分批发放期间继续更正业务时间',
  data: input({
    customerName: '更正后客户',
    thirdPartyOrderNo: paidOrder.thirdPartyOrderNo,
    originalProduct: '更正后产品',
    originalProductLevel: '软件服务',
    originalAmount: 899,
    recoveryAmount: 799,
    recoveryAt: '2026-06-06T06:51:00.000Z',
    recoveryUserId: finance.id,
    assistUserId: finance.id,
  }),
};
const mixedPreview = await paidService.previewCorrection(paidOrder.id, mixedCorrectionInput, superAdmin);
assert.equal(mixedPreview.code, 409, '历史已发与当前待发并存时必须先由财务撤回，不得在业务更正中改写待发金额');
assert.match(mixedPreview.message, /财务.*撤回/);
const pendingRow = paidPrisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, pendingCommission.id))!;
pendingRow.status = '已撤回';
pendingRow.data = { ...pendingCommission, status: '已撤回' };
const ownerTransferInput = {
  ...mixedCorrectionInput,
  reason: '更正实际挽回人员',
  data: { ...mixedCorrectionInput.data, recoveryUserId: creator.id },
};
const ownerTransferPreview = await paidService.previewCorrection(paidOrder.id, ownerTransferInput, superAdmin);
assert.equal(ownerTransferPreview.code, 0, ownerTransferPreview.message);
assert.equal(ownerTransferPreview.data?.impacts.some((impact) => impact.action === '人员调整'), true, '挽回人员变更必须预览原人追回与新人补发');
assert.equal(ownerTransferPreview.data?.legs.some((leg) => leg.kind === '补发' && leg.ownerId === creator.id), true);
assert.equal(ownerTransferPreview.data?.legs.some((leg) => leg.kind === '追回' && leg.ownerId === finance.id), true);
const ownerTransferred = await paidService.correct(paidOrder.id, {
  ...ownerTransferInput,
  expectedImpactHash: ownerTransferPreview.data!.impactHash,
}, superAdmin);
assert.equal(ownerTransferred.code, 0, ownerTransferred.message);
assert.equal(
  (paidPrisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, paidCommission.id))?.data as Commission).ownerId,
  finance.id,
  '人员更正不得改写原已发放提成人员',
);
assert.equal(
  Array.from(paidPrisma.rows.values()).some((row: any) => (
    row.domain === STORAGE_KEYS.COMMISSION_CORRECTIONS
    && row.data?.legs?.some((leg: any) => leg.kind === '追回' && leg.ownerId === finance.id)
    && row.data?.legs?.some((leg: any) => leg.kind === '补发' && leg.ownerId === creator.id)
  )),
  true,
  '人员转移必须落更正记录及双向差额',
);
const stackedCorrectionPreview = await paidService.previewCorrection(paidOrder.id, {
  ...ownerTransferInput,
  reason: '继续更正其他业务字段',
  data: { ...ownerTransferInput.data, recoveryAt: '2026-06-07T06:51:00.000Z' },
}, superAdmin);
assert.equal(stackedCorrectionPreview.code, 409, '同源已有差额时必须阻断叠加更正，避免重复补发或追回');
assert.match(stackedCorrectionPreview.message, /当前已有差额更正|财务.*撤回/);

const deltaPrisma = new FakePrisma();
const deltaOrder: RecoveryOrder = {
  ...paidOrder,
  id: 'recovery-paid-delta',
  recoveryNo: 'RCV-PAID-DELTA',
  thirdPartyOrderNo: 'TP-PAID-DELTA',
  recoveryAmount: 1000,
  recoveryAt: '2026-07-10T12:42:00.000Z',
  recoveryUserId: creator.id,
  recoveryUserName: creator.name,
  assistUserId: undefined,
  assistUserName: undefined,
  commissionIds: ['commission-paid-delta'],
};
const deltaCommission: Commission = {
  ...paidCommission,
  id: 'commission-paid-delta',
  orderId: deltaOrder.id,
  orderNo: deltaOrder.recoveryNo,
  orderAmount: 1000,
  performanceAmount: 1000,
  commissionRate: 0.1,
  commissionAmount: 100,
  ruleCalculationType: 'percentage',
  ownerId: creator.id,
  owner: creator.name,
  payoutRecordId: 'payout-paid-delta',
  paymentDate: '2026-07-10T12:42:00.000Z',
};
const deltaPayout = paidPayoutRecord(deltaCommission);
deltaPrisma.rows.set(key(STORAGE_KEYS.RECOVERY_ORDERS, deltaOrder.id), {
  id: `${STORAGE_KEYS.RECOVERY_ORDERS}:${deltaOrder.id}`,
  domain: STORAGE_KEYS.RECOVERY_ORDERS,
  recordId: deltaOrder.id,
  status: deltaOrder.status,
  orderId: deltaOrder.id,
  eventAt: new Date(deltaOrder.recoveryAt!),
  data: clone(deltaOrder),
});
deltaPrisma.rows.set(key(STORAGE_KEYS.COMMISSIONS, deltaCommission.id), {
  id: `${STORAGE_KEYS.COMMISSIONS}:${deltaCommission.id}`,
  domain: STORAGE_KEYS.COMMISSIONS,
  recordId: deltaCommission.id,
  status: deltaCommission.status,
  owner: deltaCommission.owner,
  orderId: deltaOrder.id,
  amount: deltaCommission.commissionAmount,
  eventAt: new Date(deltaCommission.paymentDate!),
  data: clone(deltaCommission),
});
const deltaPendingAssist: Commission = {
  ...deltaCommission,
  id: 'commission-pending-assist-removal',
  role: '协助人员',
  roleCode: 'recovery_assistant',
  ownerId: finance.id,
  owner: finance.name,
  departmentId: finance.departmentId,
  department: '财务部',
  commissionAmount: 20,
  status: '待发放',
  payoutRecordId: undefined,
  batchId: undefined,
  paidAt: undefined,
};
deltaPrisma.rows.set(key(STORAGE_KEYS.COMMISSIONS, deltaPendingAssist.id), {
  id: `${STORAGE_KEYS.COMMISSIONS}:${deltaPendingAssist.id}`,
  domain: STORAGE_KEYS.COMMISSIONS,
  recordId: deltaPendingAssist.id,
  status: deltaPendingAssist.status,
  owner: deltaPendingAssist.owner,
  orderId: deltaOrder.id,
  amount: deltaPendingAssist.commissionAmount,
  eventAt: new Date(deltaPendingAssist.paymentDate!),
  data: clone(deltaPendingAssist),
});
deltaPrisma.rows.set(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, deltaPayout.id), {
  id: `${STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES}:${deltaPayout.id}`,
  domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
  recordId: deltaPayout.id,
  status: deltaPayout.status,
  orderId: deltaOrder.id,
  eventAt: new Date(deltaPayout.issuedAt),
  data: clone(deltaPayout),
});
let deltaNow = NOW;
const deltaService = createRecoveryOrderCommandService(deltaPrisma as any, { now: () => new Date(deltaNow) });
const removePendingAssistInput = {
  reason: '更正协助人员录入错误',
  data: input({
    customerName: deltaOrder.customerName,
    thirdPartyOrderNo: deltaOrder.thirdPartyOrderNo,
    originalProduct: deltaOrder.originalProduct,
    originalProductLevel: deltaOrder.originalProductLevel,
    originalAmount: deltaOrder.originalAmount,
    recoveryAmount: deltaOrder.recoveryAmount,
    recoveryAt: deltaOrder.recoveryAt,
    recoveryUserId: creator.id,
    assistUserId: undefined,
    remark: '已核实本单没有协助人员',
  }),
};
const blockedPendingAssistPreview = await deltaService.previewCorrection(deltaOrder.id, removePendingAssistInput, superAdmin);
assert.equal(blockedPendingAssistPreview.code, 409, '历史已发订单的待发协助提成必须先由财务撤回');
assert.match(blockedPendingAssistPreview.message, /财务.*撤回/);
const pendingAssistRow = deltaPrisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, deltaPendingAssist.id))!;
pendingAssistRow.status = '已撤回';
pendingAssistRow.data = { ...deltaPendingAssist, status: '已撤回' };
const removePendingAssistPreview = await deltaService.previewCorrection(deltaOrder.id, removePendingAssistInput, superAdmin);
assert.equal(removePendingAssistPreview.code, 0, removePendingAssistPreview.message);
assert.equal(removePendingAssistPreview.data?.supplementAmount, 0);
assert.equal(removePendingAssistPreview.data?.recoverAmount, 0);
const removedPendingAssist = await deltaService.correct(deltaOrder.id, {
  ...removePendingAssistInput,
  expectedImpactHash: removePendingAssistPreview.data!.impactHash,
}, superAdmin);
assert.equal(removedPendingAssist.code, 0, removedPendingAssist.message);
assert.equal(
  (deltaPrisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, deltaPendingAssist.id))?.data as Commission).status,
  '已撤回',
  '发放后移除尚未发放的协助人员时应撤回对应待发提成',
);
assert.equal(removedPendingAssist.data?.settlementStatus, '已发放', '撤回最后一条待发明细后整单应恢复为已发放');
assert.equal(removedPendingAssist.data?.settlementPaidAt, deltaCommission.paidAt, '整单恢复已发放时应保留实际发放时间');
const cleanedDeltaOrder = removedPendingAssist.data!;
const deltaInput = {
  reason: '更正挽回成交金额',
  data: input({
    customerName: cleanedDeltaOrder.customerName,
    thirdPartyOrderNo: cleanedDeltaOrder.thirdPartyOrderNo,
    originalProduct: cleanedDeltaOrder.originalProduct,
    originalProductLevel: cleanedDeltaOrder.originalProductLevel,
    originalAmount: cleanedDeltaOrder.originalAmount,
    recoveryAmount: 1200,
    recoveryAt: cleanedDeltaOrder.recoveryAt,
    recoveryUserId: creator.id,
  }),
};
const deltaPayoutKey = key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, deltaPayout.id);
const immutableDeltaPayoutRow = clone(deltaPrisma.rows.get(deltaPayoutKey));
deltaPrisma.rows.delete(deltaPayoutKey);
const missingSnapshotPreview = await deltaService.previewCorrection(deltaOrder.id, deltaInput, superAdmin);
assert.equal(missingSnapshotPreview.code, 409, '已发放提成缺少不可变发放快照时必须拒绝更正');
assert.match(missingSnapshotPreview.message, /缺少逐笔发放快照/);
deltaPrisma.rows.set(deltaPayoutKey, immutableDeltaPayoutRow);
const deltaPreview = await deltaService.previewCorrection(deltaOrder.id, deltaInput, superAdmin);
assert.equal(deltaPreview.code, 0, deltaPreview.message);
assert.equal(deltaPreview.data?.supplementAmount, 20, '按比例提成应预览更正后 +20 元补发差额');
assert.equal(deltaPreview.data?.recoverAmount, 0);
const missingImpactConfirmation = await deltaService.correct(deltaOrder.id, deltaInput, superAdmin);
assert.equal(missingImpactConfirmation.code, 409, '已发放更正未确认最新影响哈希时必须拒绝');
const staleDelta = await deltaService.correct(deltaOrder.id, {
  ...deltaInput,
  data: { ...deltaInput.data, recoveryAmount: 1300 },
  expectedImpactHash: deltaPreview.data!.impactHash,
}, superAdmin);
assert.equal(staleDelta.code, 409, '预览后修改更正内容必须因影响哈希过期被拒绝');
deltaNow = '2026-07-12T18:01:00.000Z';
const deltaCorrected = await deltaService.correct(deltaOrder.id, {
  ...deltaInput,
  expectedImpactHash: deltaPreview.data!.impactHash,
}, superAdmin);
assert.equal(deltaCorrected.code, 0, deltaCorrected.message);
const persistedDeltaCommission = deltaPrisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, deltaCommission.id))?.data as Commission;
assert.equal(persistedDeltaCommission.commissionAmount, 100, '原已发提成金额必须保持不变');
assert.equal(persistedDeltaCommission.ownerId, creator.id, '原已发提成人员必须保持不变');
assert.equal(persistedDeltaCommission.status, '已发放');
assert.equal(persistedDeltaCommission.paidAt, deltaCommission.paidAt);
assert.equal(persistedDeltaCommission.payoutRecordId, deltaCommission.payoutRecordId);
const deltaCorrectionRecords = Array.from(deltaPrisma.rows.values())
  .filter((row: any) => row.domain === STORAGE_KEYS.COMMISSION_CORRECTIONS);
assert.equal(deltaCorrectionRecords.length, 2, '每次发放后更正都必须保留独立的更正与差额记录');
const supplementalDelta = Array.from(deltaPrisma.rows.values())
  .map((row: any) => row.data as Commission)
  .find((commission) => commission?.correctionDeltaType === '补发');
assert.equal(supplementalDelta?.commissionAmount, 20, '正差额必须生成新的待确认补发提成');
assert.equal(supplementalDelta?.status, '待确认');

const crossTierPrisma = new FakePrisma();
const crossTierOrder: RecoveryOrder = {
  ...paidOrder,
  id: 'recovery-cross-tier-source',
  recoveryNo: 'RCV-CROSS-TIER-SOURCE',
  thirdPartyOrderNo: 'TP-CROSS-TIER-SOURCE',
  recoveryAmount: 5_000,
  recoveryAt: '2026-07-10T08:00:00.000Z',
  recoveryUserId: creator.id,
  recoveryUserName: creator.name,
  assistUserId: undefined,
  assistUserName: undefined,
  settlementStatus: '待发放',
  settlementPaidAt: undefined,
  commissionIds: ['commission-cross-tier-source'],
};
const crossTierPlan = {
  id: 'plan-recovery-cross-tier',
  name: '售后月度阶梯',
  version: 1,
  commissionType: 'tiered_percentage' as const,
  commissionValue: 0,
  tiers: [{ minAmount: 0, maxAmount: 30_000, rate: 8 }, { minAmount: 30_000, rate: 10 }],
};
const crossTierSourceCommission: Commission = {
  ...paidCommission,
  id: 'commission-cross-tier-source',
  orderId: crossTierOrder.id,
  orderNo: crossTierOrder.recoveryNo,
  sourceRecoveryOrderId: crossTierOrder.id,
  ownerId: creator.id,
  owner: creator.name,
  departmentId: creator.departmentId,
  department: '交付部',
  orderAmount: 5_000,
  performanceAmount: 5_000,
  commissionAmount: 400,
  commissionRate: 0.08,
  ruleCalculationType: 'tiered_percentage',
  payoutPlanId: crossTierPlan.id,
  payoutPlanName: crossTierPlan.name,
  payoutPlanVersion: crossTierPlan.version,
  payoutPlanSnapshot: crossTierPlan,
  paymentDate: crossTierOrder.recoveryAt,
  status: '待发放',
  payoutRecordId: undefined,
  batchId: undefined,
  paidAt: undefined,
};
const crossTierOtherPaid: Commission = {
  ...crossTierSourceCommission,
  id: 'commission-cross-tier-other-paid',
  orderId: 'recovery-cross-tier-other',
  orderNo: 'RCV-CROSS-TIER-OTHER',
  sourceRecoveryOrderId: 'recovery-cross-tier-other',
  orderAmount: 20_000,
  performanceAmount: 20_000,
  commissionAmount: 1_600,
  status: '已发放',
  payoutRecordId: 'payout-cross-tier-other',
  batchId: 'payout-cross-tier-other',
  paidAt: '2026-07-25T08:00:00.000Z',
};
const crossTierPayout = paidPayoutRecord(crossTierOtherPaid);
for (const [domain, value, status, orderId] of [
  [STORAGE_KEYS.RECOVERY_ORDERS, crossTierOrder, crossTierOrder.status, crossTierOrder.id],
  [STORAGE_KEYS.COMMISSIONS, crossTierSourceCommission, crossTierSourceCommission.status, crossTierOrder.id],
  [STORAGE_KEYS.COMMISSIONS, crossTierOtherPaid, crossTierOtherPaid.status, crossTierOtherPaid.orderId],
  [STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, crossTierPayout, crossTierPayout.status, crossTierOtherPaid.orderId],
] as const) {
  crossTierPrisma.rows.set(key(domain, value.id), {
    id: `${domain}:${value.id}`,
    domain,
    recordId: value.id,
    status,
    orderId,
    eventAt: new Date((value as any).paymentDate || (value as any).issuedAt || NOW),
    data: clone(value),
  });
}
const crossTierService = createRecoveryOrderCommandService(crossTierPrisma as any, { now: () => new Date(NOW) });
const crossTierInput = {
  reason: '更正挽回成交金额并核对月度阶梯联动',
  data: input({
    customerName: crossTierOrder.customerName,
    thirdPartyOrderNo: crossTierOrder.thirdPartyOrderNo,
    originalProduct: crossTierOrder.originalProduct,
    originalProductLevel: crossTierOrder.originalProductLevel,
    originalAmount: crossTierOrder.originalAmount,
    recoveryAmount: 15_000,
    recoveryAt: crossTierOrder.recoveryAt,
    recoveryUserId: creator.id,
    assistUserId: undefined,
  }),
};
const crossTierAdminPrecheck = await crossTierService.precheckCorrection(crossTierOrder.id, superAdmin);
assert.equal(crossTierAdminPrecheck.data?.requiresImpactPreview, true, '超管更正未发放售后单也必须先测算跨订单阶梯影响');
const crossTierReviewerPreview = await crossTierService.previewCorrection(crossTierOrder.id, crossTierInput, reviewer);
assert.equal(crossTierReviewerPreview.code, 403, '非超管不得预览跨订单已发提成影响');
const crossTierPreview = await crossTierService.previewCorrection(crossTierOrder.id, crossTierInput, superAdmin);
assert.equal(crossTierPreview.code, 0, crossTierPreview.message);
assert.equal(crossTierPreview.data?.supplementAmount, 400, '5千更正为1.5万后应使同月另一笔2万已发提成从8%补到10%');
assert.equal(
  crossTierPreview.data?.impacts.some((impact) => impact.sourceCommissionId === crossTierOtherPaid.id && impact.deltaAmount === 400),
  true,
  '预览必须明确指出被联动的另一张已发提成',
);
const crossTierReviewerCorrect = await crossTierService.correct(crossTierOrder.id, crossTierInput, reviewer);
assert.equal(crossTierReviewerCorrect.code, 403, '非超管不得提交会联动已发提成的售后更正');
const crossTierMissingConfirmation = await crossTierService.correct(crossTierOrder.id, crossTierInput, superAdmin);
assert.equal(crossTierMissingConfirmation.code, 409, '跨订单阶梯影响未确认哈希时不得提交');
const crossTierCorrected = await crossTierService.correct(crossTierOrder.id, {
  ...crossTierInput,
  expectedImpactHash: crossTierPreview.data!.impactHash,
}, superAdmin);
assert.equal(crossTierCorrected.code, 0, crossTierCorrected.message);
assert.equal(crossTierCorrected.data?.settlementStatus, '待发放', '跨订单预览按更正后阶梯计算时，源单未发分账也必须按同一口径保留');
const correctedCrossTierSource = crossTierPrisma.rows.get(
  key(STORAGE_KEYS.COMMISSIONS, crossTierSourceCommission.id),
)?.data as Commission;
assert.equal(correctedCrossTierSource.status, '待发放');
assert.equal(correctedCrossTierSource.performanceAmount, 15_000);
assert.equal(correctedCrossTierSource.commissionAmount, 1_500, '源单未发提成必须与预览一样按更正后的10%阶梯重算');
assert.equal(
  (crossTierPrisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, crossTierOtherPaid.id))?.data as Commission).commissionAmount,
  1_600,
  '被联动的另一张原已发提成必须保持不可变',
);
assert.equal(
  Array.from(crossTierPrisma.rows.values()).some((row: any) => (
    row.domain === STORAGE_KEYS.COMMISSIONS
    && row.data?.correctionDeltaType === '补发'
    && row.data?.commissionAmount === 400
  )),
  true,
  '跨订单阶梯正差额必须生成独立补发提成',
);

const realtimeSettlementOrder: RecoveryOrder = {
  ...oldRecord,
  id: 'recovery-realtime-settlement',
  recoveryNo: 'RCV-REALTIME',
  thirdPartyOrderNo: 'TP-REALTIME',
  status: '待分账',
  settlementStatus: '待处理',
  commissionIds: [],
};
prisma.rows.set(key(STORAGE_KEYS.RECOVERY_ORDERS, realtimeSettlementOrder.id), {
  id: `${STORAGE_KEYS.RECOVERY_ORDERS}:${realtimeSettlementOrder.id}`,
  domain: STORAGE_KEYS.RECOVERY_ORDERS,
  recordId: realtimeSettlementOrder.id,
  status: realtimeSettlementOrder.status,
  data: clone(realtimeSettlementOrder),
});
const settledRealtime = await service.settle(realtimeSettlementOrder.id, [{
  role: '售后',
  ownerId: finance.id,
  payoutPlanName: '自定义金额',
  commissionAmount: 30,
  performanceAmount: 200,
  ruleCalculationType: 'fixed',
}, {
  role: '挽回人员',
  ownerId: finance.id,
  payoutPlanId: 'plan-recovery-tiered',
  payoutPlanName: '售后挽回阶梯奖',
  payoutPlanVersion: 3,
  payoutPlanSnapshot: {
    id: 'plan-recovery-tiered',
    name: '售后挽回阶梯奖',
    version: 3,
    commissionType: 'tiered_percentage',
    commissionValue: 0,
    tiers: [{ minAmount: 0, maxAmount: 10000, rate: 5 }, { minAmount: 10000, rate: 8 }],
  },
  tierSnapshot: {
    tiers: [{ minAmount: 0, maxAmount: 10000, rate: 5 }, { minAmount: 10000, rate: 8 }],
    baseAmount: 200,
    gapToNext: 9800,
  },
  commissionAmount: 0,
  performanceAmount: 200,
  ruleCalculationType: 'tiered_percentage',
}], '测试实时保存', finance);
assert.equal(settledRealtime.code, 0);
assert.equal(settledRealtime.data?.settlementStatus, '待确认');
assert.equal(settledRealtime.data?.settlementHandledBy, finance.name);
assert.equal(settledRealtime.data?.settlementHandledAt, NOW);
const tieredRecoveryCommission = Array.from(prisma.rows.values())
  .map((row: any) => row.data)
  .find((row: any) => row?.payoutPlanId === 'plan-recovery-tiered');
assert.equal(tieredRecoveryCommission?.role, '挽回人员');
assert.equal(tieredRecoveryCommission?.commissionAmount, 0, '月度阶梯在月度汇总前不应按固定金额结算');
assert.equal(tieredRecoveryCommission?.payoutPlanSnapshot?.version, 3, '售后挽回提成必须保留方案版本快照');
assert.equal(
  (await service.list({ settlementStatuses: ['待确认'], page: 1, pageSize: 20 }, finance))
    .data?.items.some((item) => item.id === realtimeSettlementOrder.id),
  true,
  '保存分账后后端列表必须立即显示待确认',
);
const confirmedRealtime = await service.confirmSettlement(realtimeSettlementOrder.id, finance);
assert.equal(confirmedRealtime.code, 0);
assert.equal(confirmedRealtime.data?.settlementStatus, '待发放');
assert.equal(confirmedRealtime.data?.settlementConfirmedBy, finance.name);
assert.equal(confirmedRealtime.data?.settlementConfirmedAt, NOW);
const withdrawnRealtime = await service.withdrawSettlement(realtimeSettlementOrder.id, '测试实时撤回', finance);
assert.equal(withdrawnRealtime.code, 0);
assert.equal(withdrawnRealtime.data?.settlementStatus, '已撤回');
assert.equal(withdrawnRealtime.data?.settlementWithdrawnBy, finance.name);
assert.equal(withdrawnRealtime.data?.settlementWithdrawnAt, NOW);
assert.equal(withdrawnRealtime.data?.settlementWithdrawReason, '测试实时撤回');
assert.equal(
  (await service.list({ settlementStatuses: ['已撤回'], page: 1, pageSize: 20 }, finance))
    .data?.items.some((item) => item.id === realtimeSettlementOrder.id),
  true,
  '撤回成功后后端列表必须立即显示已撤回，不能继续显示待发放',
);
const realtimeCommission = Array.from(prisma.rows.values())
  .find((row: any) => row.domain === STORAGE_KEYS.COMMISSIONS && row.data?.sourceRecoveryOrderId === realtimeSettlementOrder.id);
assert.equal(
  realtimeCommission?.data.paymentDate,
  realtimeSettlementOrder.recoveryAt,
  '售后挽回提成必须按挽回成交时间归属员工提成月报，不能按审核或分账时间',
);
assert.equal(realtimeCommission?.data.status, '已撤回', '撤回必须同时更新关联提成状态');
assert.equal((await service.reopenSettlement(realtimeSettlementOrder.id, '', finance)).code, 400, '重新分账必须填写原因');
const reopenedRealtime = await service.reopenSettlement(realtimeSettlementOrder.id, '重新核对售后分账', finance);
assert.equal(reopenedRealtime.code, 0, reopenedRealtime.message);
assert.equal(reopenedRealtime.data?.settlementStatus, '待处理');
assert.equal(reopenedRealtime.data?.settlementVersion, 2, '历史未标记轮次的撤回分账应从第一轮递增到第二轮');
const resettledRealtime = await service.settle(realtimeSettlementOrder.id, [{
  role: '售后', ownerId: finance.id, payoutPlanName: '自定义金额', commissionAmount: 35,
  performanceAmount: 200, ruleCalculationType: 'fixed',
}], '重新分账保存', finance);
assert.equal(resettledRealtime.code, 0, resettledRealtime.message);
const recoveryRounds = Array.from(prisma.rows.values())
  .filter((row: any) => row.domain === STORAGE_KEYS.COMMISSIONS && row.data?.sourceRecoveryOrderId === realtimeSettlementOrder.id)
  .map((row: any) => row.data);
assert.equal(recoveryRounds.some((item: any) => item.status === '已撤回' && item.settlementVersion === 1), true, '旧轮次必须保留');
assert.equal(recoveryRounds.some((item: any) => item.status === '待确认' && item.settlementVersion === 2), true, '下一次保存必须创建新轮次');
const resetResettledRealtime = await service.resetSettlement(realtimeSettlementOrder.id, '重置第二轮', finance);
assert.equal(resetResettledRealtime.code, 0, resetResettledRealtime.message);
const recoveryRoundsAfterReset = Array.from(prisma.rows.values())
  .filter((row: any) => row.domain === STORAGE_KEYS.COMMISSIONS && row.data?.sourceRecoveryOrderId === realtimeSettlementOrder.id)
  .map((row: any) => row.data);
assert.equal(recoveryRoundsAfterReset.some((item: any) => item.status === '已撤回' && item.settlementVersion === 1), true, '重置当前轮次不得删除旧轮次');
assert.equal(recoveryRoundsAfterReset.some((item: any) => item.status === '待确认'), false, '重置当前轮次必须删除当前待确认明细');
prisma.rows.delete(key(STORAGE_KEYS.RECOVERY_ORDERS, realtimeSettlementOrder.id));
for (const row of recoveryRounds) prisma.rows.delete(key(STORAGE_KEYS.COMMISSIONS, row.id));

const missingContact = await service.create(input({
  thirdPartyOrderNo: 'TP-NO-CONTACT', customerPhone: '', customerWechat: '',
}), creator);
assert.equal(missingContact.code, 400);
assert.equal(missingContact.message, '手机号或微信至少填写一项');

const invalidPaymentChannel = await service.create(input({
  thirdPartyOrderNo: 'TP-BAD-PAYMENT-CHANNEL', officialPaymentChannel: '私人收款码' as any,
}), creator);
assert.equal(invalidPaymentChannel.code, 400);
assert.equal(invalidPaymentChannel.message, '官方收款渠道无效');

const tooManyProofs = Array.from({ length: 9 }, (_, index) => ({
  id: `proof-${index}`, name: `${index}.png`, mimeType: 'image/png', size: 100,
  category: 'recovery-payment-proof' as const, uploadedById: creator.id,
  uploadedByName: creator.name, uploadedAt: NOW,
}));
const tooManyProofsResult = await service.create(input({
  thirdPartyOrderNo: 'TP-TOO-MANY-PROOFS', recoveryAttachments: tooManyProofs,
}), creator);
assert.equal(tooManyProofsResult.code, 400);
assert.equal(tooManyProofsResult.message, '挽回凭证最多上传 8 张');

const legacyChatProofs = tooManyProofs.slice(0, 4).map((item, index) => ({
  ...item,
  id: `chat-${index}`,
  category: 'recovery-chat-evidence' as const,
}));
const tooManyLegacyProofsResult = await service.create(input({
  thirdPartyOrderNo: 'TP-TOO-MANY-LEGACY-PROOFS',
  paymentAttachments: tooManyProofs.slice(0, 5),
  chatAttachments: legacyChatProofs,
}), creator);
assert.equal(tooManyLegacyProofsResult.code, 400);
assert.equal(tooManyLegacyProofsResult.message, '挽回凭证最多上传 8 张');

const created = await service.create(input(), creator);
assert.equal(created.code, 0, '只有 create 权限的角色应能通过记录级命令新增');
assert.equal(created.data?.createdBy, creator.id, '操作人必须由会话确定');
assert.equal(created.data?.createdByName, creator.name);
assert.equal(created.data?.recoveryUserName, creator.name, '姓名必须从员工目录解析');
assert.equal(created.data?.recoveryAt, '2026-07-12T15:30:00.000Z', '挽回时间必须按提交值保存');
assert.equal(created.data?.originalProductId, 'product-899');
assert.equal(created.data?.originalProductLevel, '899', '原产品等级必须作为成交快照保存');
assert.equal(created.data?.officialPaymentChannel, '对公银行转账');
assert.equal(created.data?.paymentOrderNo, 'PAY-20260712-001');
assert.equal(created.data?.paymentAt, '2026-07-12T15:20:00.000Z');
assert.ok(prisma.records().some((item) => item.id === oldRecord.id), '新增不得覆盖或删除其他记录');

const creatorList = await service.list({ page: 1, pageSize: 20 }, creator);
assert.equal(creatorList.code, 0);
assert.deepEqual(
  creatorList.data?.items.map((item) => item.id),
  [outsideDepartmentRecord.id, created.data!.id].sort(),
  '普通员工应能看到自己提交或由自己负责挽回的售后挽回订单',
);
assert.equal(
  (await service.get(outsideDepartmentRecord.id, creator)).code,
  0,
  '挽回人员从列表进入后应能读取订单详情',
);
const assistedRecord: RecoveryOrder = {
  ...oldRecord,
  id: 'recovery-assisted-by-creator',
  recoveryNo: 'RCV-ASSISTED-BY-CREATOR',
  thirdPartyOrderNo: 'TP-ASSISTED-BY-CREATOR',
  createdBy: outsideDepartmentCreator.id,
  createdByName: outsideDepartmentCreator.name,
  recoveryUserId: other.id,
  recoveryUserName: other.name,
  assistUserId: creator.id,
  assistUserName: creator.name,
};
prisma.rows.set(key(STORAGE_KEYS.RECOVERY_ORDERS, assistedRecord.id), {
  id: `${STORAGE_KEYS.RECOVERY_ORDERS}:${assistedRecord.id}`,
  domain: STORAGE_KEYS.RECOVERY_ORDERS,
  recordId: assistedRecord.id,
  status: assistedRecord.status,
  data: clone(assistedRecord),
});
assert.equal(
  (await service.list({ page: 1, pageSize: 20 }, creator)).data?.items.some((item) => item.id === assistedRecord.id),
  true,
  '协助人员应能看到自己参与的售后挽回订单',
);
prisma.rows.delete(key(STORAGE_KEYS.RECOVERY_ORDERS, assistedRecord.id));
const reviewerList = await service.list({
  scopeDomain: 'recoveryOrderApplications', page: 1, pageSize: 20,
}, reviewer);
assert.equal(reviewerList.data?.pagination.total, 3, '审核台全部范围必须从数据库看到所有部门的待审核订单');
assert.deepEqual(
  (await service.list({
    scopeDomain: 'recoveryOrderApplications',
    importBatchId: 'batch-visible',
    page: 1,
    pageSize: 20,
  }, reviewer)).data?.items.map((item) => item.id),
  [oldRecord.id],
  '售后审核台必须在服务端按导入批次筛选',
);
const recoveryTimeDesc = await service.list({
  scopeDomain: 'recoveryOrderApplications', sortBy: 'recoveryAt', sortDirection: 'desc', page: 1, pageSize: 20,
}, reviewer);
assert.deepEqual(
  recoveryTimeDesc.data?.items.map((item) => item.id),
  [outsideDepartmentRecord.id, created.data!.id, oldRecord.id],
  '售后挽回订单应支持按挽回成交时间倒序',
);
const recoveryDateFiltered = await service.list({
  scopeDomain: 'recoveryOrderApplications', recoveryStartDate: '2026-07-12', recoveryEndDate: '2026-07-12', page: 1, pageSize: 20,
}, reviewer);
assert.deepEqual(recoveryDateFiltered.data?.items.map((item) => item.id), [created.data!.id]);
const recoveryOwnerFiltered = await service.list({
  scopeDomain: 'recoveryOrderApplications', recoveryUserId: creator.id, page: 1, pageSize: 20,
}, reviewer);
assert.equal(recoveryOwnerFiltered.data?.items.length, 2);
assert.equal(
  recoveryOwnerFiltered.data?.items.every((item) => item.recoveryUserId === creator.id),
  true,
  '挽回人员筛选只能匹配 recoveryUserId，不能混入提交人或协助人员',
);
const listedOldRecord = reviewerList.data?.items.find((item) => item.id === oldRecord.id);
assert.equal(listedOldRecord?.paymentVoucherPreview, undefined);
assert.equal(listedOldRecord?.chatEvidencePreview, undefined);
const oldRecordDetail = await service.get(oldRecord.id, reviewer, 'recoveryOrderApplications');
assert.equal(oldRecordDetail.data?.paymentVoucherPreview, INLINE_PROOF);
assert.equal(oldRecordDetail.data?.chatEvidencePreview, INLINE_PROOF);
const updatedOldRecord = await service.update(oldRecord.id, input({
  customerName: oldRecord.customerName,
  customerPhone: oldRecord.customerPhone,
  customerWechat: oldRecord.customerWechat,
  thirdPartyOrderNo: oldRecord.thirdPartyOrderNo,
  originalProduct: oldRecord.originalProduct,
  originalAmount: oldRecord.originalAmount,
  recoveryAmount: oldRecord.recoveryAmount,
  recoveryUserId: oldRecord.recoveryUserId,
  remark: oldRecord.remark,
  recoveryAttachments: [],
}), reviewer);
assert.equal(updatedOldRecord.code, 0);
assert.equal(updatedOldRecord.data?.paymentVoucherPreview, INLINE_PROOF, '编辑历史订单不得清空旧版付款凭证');
assert.equal(updatedOldRecord.data?.chatEvidencePreview, INLINE_PROOF, '编辑历史订单不得清空旧版聊天凭证');

const unauthorizedReviewList = await service.list({
  scopeDomain: 'recoveryOrderApplications', page: 1, pageSize: 20,
}, creator);
assert.equal(unauthorizedReviewList.code, 403, '没有审核列表权限不得从接口读取审核台数据');

const staleReviewerList = await service.list({
  scopeDomain: 'recoveryOrders', page: 1, pageSize: 20,
}, staleReviewer);
assert.equal(
  staleReviewerList.data?.pagination.total,
  3,
  '售后挽回列表应按提交人、挽回人员和协助人员共同匹配部门数据范围',
);
const settlementPage = await service.list({
  scopeDomain: 'recoveryOrders', settlementStatuses: ['待处理'], page: 1, pageSize: 20,
}, staleReviewer);
assert.deepEqual(settlementPage.data?.items.map((item) => item.id), [oldRecord.id, outsideDepartmentRecord.id]);
const settlementCounts = await service.settlementCounts({ includeDeleted: true }, staleReviewer);
assert.equal(settlementCounts.data?.total, 2);
assert.equal(settlementCounts.data?.statusCounts['待处理'], 2);
const financeList = await service.list({}, finance);
assert.equal(financeList.code, 0);
assert.deepEqual(
  financeList.data?.items.map((item) => item.id).sort(),
  [oldRecord.id, outsideDepartmentRecord.id].sort(),
  'finance-only access must be limited to settlement-ready orders',
);
const financeOwnerCounts = await service.settlementCounts({ includeDeleted: true, recoveryUserId: creator.id }, finance);
assert.equal(financeOwnerCounts.data?.total, 1, '财务分账数量必须与挽回人员筛选后的列表一致');
financeList.data?.items.forEach((item) => {
  assert.equal(item.paymentVoucherPreview, undefined);
  assert.equal(item.chatEvidencePreview, undefined);
  assert.equal(item.customerPhone, undefined);
  assert.equal(item.customerWechat, undefined);
  assert.equal(item.remark, undefined);
});
const financeDetail = await service.get(oldRecord.id, finance, 'recoveryOrders');
assert.equal(financeDetail.code, 0, '财务分账角色必须能从订单号查看售后挽回订单完整资料');
assert.equal(financeDetail.data?.customerPhone, oldRecord.customerPhone);
assert.equal(financeDetail.data?.remark, oldRecord.remark);
const oldRecordKey = key(STORAGE_KEYS.RECOVERY_ORDERS, oldRecord.id);
const activeOldRecordRow = clone(prisma.rows.get(oldRecordKey)!);
prisma.rows.set(oldRecordKey, {
  ...activeOldRecordRow,
  data: { ...(activeOldRecordRow as any).data, deletedAt: NOW, deletedBy: reviewer.name },
});
assert.equal(
  (await service.get(oldRecord.id, finance, 'recoveryOrders')).code,
  0,
  '财务列表中的已删除源挽回单仍须支持查看留存资料',
);
prisma.rows.set(oldRecordKey, activeOldRecordRow);
assert.equal(
  (await service.list({ settlementStatuses: ['待确认'] }, finance)).data?.pagination.total,
  0,
  'finance-only status tabs must keep their requested settlement filter',
);
assert.equal((await service.settlementCounts({ includeDeleted: true }, finance)).code, 0);
const staleReviewerAuditList = await service.list({
  scopeDomain: 'recoveryOrderApplications', page: 1, pageSize: 20,
}, staleReviewer);
assert.equal(
  staleReviewerAuditList.data?.pagination.total,
  0,
  'recovery review table must independently honor self data scope',
);

const replayed = await service.create(input(), creator);
assert.equal(replayed.code, 0);
assert.equal(replayed.data?.id, created.data?.id);
assert.equal(prisma.records().length, 3, '重试必须幂等');

const importedPrisma = new FakePrisma();
const importedService = createRecoveryOrderCommandService(importedPrisma as any, { now: () => new Date(NOW) });
const manualCollision = await importedService.create(input({ thirdPartyOrderNo: 'TP-MANUAL-COLLISION' }), creator);
assert.equal(manualCollision.code, 0);
const importedOverManual = await importedService.createImported(
  input({ thirdPartyOrderNo: 'TP-MANUAL-COLLISION' }), creator,
  {
    importBatchId: 'batch-over-manual', importRowNumber: 2, importedById: creator.id, importedByName: creator.name,
    importedAt: NOW, targetCreatorId: other.id, targetCreatorName: other.name,
  },
  { id: '', matchStatus: '售后临时客户' },
);
assert.equal(importedOverManual.code, 409, 'an artificial/manual record with the same number is never accepted as this import replay');
const imported = await importedService.createImported(
  input({ thirdPartyOrderNo: 'TP-IMPORTED-CREATOR' }),
  creator,
  {
    importBatchId: 'batch-recovery-1', importRowNumber: 2,
    importedById: creator.id, importedByName: creator.name, importedAt: NOW,
    targetCreatorId: other.id, targetCreatorName: other.name,
  },
  { id: '', matchStatus: '售后临时客户' },
);
assert.equal(imported.code, 0, imported.message);
assert.equal(imported.data?.createdBy, creator.id, '待审阶段编辑人必须是实际导入人');
assert.equal(imported.data?.customerMatchStatus, '售后临时客户');
const otherBatchReplay = await importedService.createImported(
  input({ thirdPartyOrderNo: 'TP-IMPORTED-CREATOR' }), creator,
  {
    importBatchId: 'batch-recovery-other', importRowNumber: 2,
    importedById: creator.id, importedByName: creator.name, importedAt: NOW,
    targetCreatorId: other.id, targetCreatorName: other.name,
  },
  { id: '', matchStatus: '售后临时客户' },
);
assert.equal(otherBatchReplay.code, 409, 'another import batch cannot claim an existing imported recovery record');

const deletedCollisionPrisma = new FakePrisma();
const deletedCollisionService = createRecoveryOrderCommandService(deletedCollisionPrisma as any, { now: () => new Date(NOW) });
const deletedOriginal = await deletedCollisionService.create(
  input({ thirdPartyOrderNo: 'TP-DELETED-REIMPORT' }), creator,
);
assert.equal(deletedOriginal.code, 0, deletedOriginal.message);
const deletedOriginalKey = key(STORAGE_KEYS.RECOVERY_ORDERS, deletedOriginal.data!.id);
const deletedOriginalRow = deletedCollisionPrisma.rows.get(deletedOriginalKey)!;
deletedCollisionPrisma.rows.set(deletedOriginalKey, {
  ...deletedOriginalRow,
  data: { ...deletedOriginalRow.data, deletedAt: NOW, deletedBy: reviewer.name },
});
const reimportedAfterDelete = await deletedCollisionService.createImported(
  input({ thirdPartyOrderNo: 'TP-DELETED-REIMPORT' }), creator,
  {
    importBatchId: 'batch-after-delete', importRowNumber: 3,
    importedById: creator.id, importedByName: creator.name, importedAt: NOW,
    targetCreatorId: other.id, targetCreatorName: other.name,
  },
  { id: '', matchStatus: '售后临时客户' },
);
assert.equal(reimportedAfterDelete.code, 0, `已删除的售后挽回单必须允许重新导入：${reimportedAfterDelete.message}`);
assert.notEqual(reimportedAfterDelete.data?.id, deletedOriginal.data?.id, '重新导入必须生成新的活动记录，保留已删除历史');
assert.equal(
  deletedCollisionPrisma.records().filter((item) => item.thirdPartyOrderNo === 'TP-DELETED-REIMPORT').length,
  2,
  '已删除历史和重新导入的新记录必须同时保留',
);

const staleIdCollisionPrisma = new FakePrisma();
const staleIdCollisionService = createRecoveryOrderCommandService(staleIdCollisionPrisma as any, { now: () => new Date(NOW) });
const staleIdOriginal = await staleIdCollisionService.create(
  input({ thirdPartyOrderNo: 'TP-STALE-ID' }), creator,
);
assert.equal(staleIdOriginal.code, 0, staleIdOriginal.message);
const staleIdOriginalKey = key(STORAGE_KEYS.RECOVERY_ORDERS, staleIdOriginal.data!.id);
const staleIdOriginalRow = staleIdCollisionPrisma.rows.get(staleIdOriginalKey)!;
staleIdCollisionPrisma.rows.set(staleIdOriginalKey, {
  ...staleIdOriginalRow,
  data: { ...staleIdOriginalRow.data, thirdPartyOrderNo: 'TP-SANITIZED-DIFFERENT-NUMBER' },
});
const importedAcrossStaleId = await staleIdCollisionService.createImported(
  input({ thirdPartyOrderNo: 'TP-STALE-ID' }), creator,
  {
    importBatchId: 'batch-stale-id', importRowNumber: 4,
    importedById: creator.id, importedByName: creator.name, importedAt: NOW,
    targetCreatorId: other.id, targetCreatorName: other.name,
  },
  { id: '', matchStatus: '售后临时客户' },
);
assert.equal(importedAcrossStaleId.code, 0, '第三方订单号未重复时，历史记录 ID 冲突不能阻止导入');
assert.notEqual(importedAcrossStaleId.data?.id, staleIdOriginal.data?.id, '记录 ID 冲突时必须选择新的安全 ID');
const importedApproved = await importedService.approve(imported.data!.id, reviewer);
assert.equal(importedApproved.code, 0, importedApproved.message);
assert.equal(importedApproved.data?.createdBy, other.id, '审核通过后必须切换为目标正式创建人');

const blindMatchPrisma = new FakePrisma();
let approvalSyncMode: 'customer' | 'lead' | 'conflict' = 'customer';
const blindMatchService = createRecoveryOrderCommandService(blindMatchPrisma as any, {
  now: () => new Date(NOW),
  crmBridge: {
    resolve: async () => ({ status: '已匹配客户', customerId: 'crm-customer-secret' }),
    resolveAndSyncLead: async () => approvalSyncMode === 'customer'
      ? { customerId: 'crm-customer-secret', crmIdentityStatus: '已匹配客户', leadSyncStatus: '不需要' }
      : approvalSyncMode === 'lead'
        ? { customerId: '', linkedLeadId: 'lead-recovery-new', crmIdentityStatus: '已创建线索', leadSyncStatus: '已创建' }
        : { customerId: '', crmIdentityStatus: '身份冲突', leadSyncStatus: '失败' },
  },
});
const blindMatched = await blindMatchService.create(input({
  thirdPartyOrderNo: 'TP-BLIND-MATCH', customerName: '售后现场称呼', customerPhone: '13800000000',
}), creator);
assert.equal(blindMatched.code, 0);
assert.equal(blindMatched.data?.customerName, '售后现场称呼', '盲匹配不得用 CRM 标准名称覆盖售后原始填报');
assert.equal(blindMatched.data?.submittedCustomerName, '售后现场称呼');
assert.equal(blindMatched.data?.customerId, '', '创建响应不得向售后人员泄露 CRM 客户 ID');
assert.equal(blindMatchPrisma.records().find((item) => item.id === blindMatched.data?.id)?.customerId, 'crm-customer-secret', '内部记录仍须保留盲匹配结果');
assert.equal(blindMatched.data?.crmIdentityStatus, '已匹配客户');
const invalidRecoveryPhone = await blindMatchService.create(input({
  thirdPartyOrderNo: 'TP-INVALID-PHONE', customerPhone: '12345', customerWechat: '',
}), creator);
assert.equal(invalidRecoveryPhone.code, 400, '手工售后单也必须在建立 CRM 身份前校验手机号');
const oversizedRecoveryName = await blindMatchService.create(input({
  thirdPartyOrderNo: 'TP-OVERSIZED-NAME', customerName: '客'.repeat(121),
}), creator);
assert.equal(oversizedRecoveryName.code, 400, '应在提交时拦截无法写入 LeadRecord 的超长客户姓名');
const missingOriginalAmount = await blindMatchService.create(input({
  thirdPartyOrderNo: 'TP-MISSING-ORIGINAL-AMOUNT', originalAmount: 0,
}), creator);
assert.equal(missingOriginalAmount.code, 400, '原付款金额必须是有效正数');
assert.match(missingOriginalAmount.message, /原付款金额/);
const futureRecoveryTime = await blindMatchService.create(input({
  thirdPartyOrderNo: 'TP-FUTURE-RECOVERY', recoveryAt: '2026-07-12T19:00:00.000Z',
}), creator);
assert.equal(futureRecoveryTime.code, 400, '挽回成交时间不得晚于当前时间');
assert.match(futureRecoveryTime.message, /不能晚于当前时间/);
const futurePaymentTime = await blindMatchService.create(input({
  thirdPartyOrderNo: 'TP-FUTURE-PAYMENT', paymentAt: '2026-07-12T19:00:00.000Z',
}), creator);
assert.equal(futurePaymentTime.code, 400, '付款时间不得晚于当前时间');
assert.match(futurePaymentTime.message, /付款时间不能晚于当前时间/);
const blindMatchedEdited = await blindMatchService.update(blindMatched.data!.id, input({
  thirdPartyOrderNo: 'TP-BLIND-MATCH', customerName: '售后修正称呼', customerPhone: '13800000001',
}), reviewer);
assert.equal(blindMatchedEdited.code, 0);
assert.equal(blindMatchedEdited.data?.submittedCustomerName, '售后修正称呼', '编辑后应同步保留最新售后填报名称');

approvalSyncMode = 'lead';
const leadBackflow = await blindMatchService.create(input({
  thirdPartyOrderNo: 'TP-LEAD-BACKFLOW', customerName: '外部新客', customerPhone: '13600000000',
}), creator);
const leadBackflowApproved = await blindMatchService.approve(leadBackflow.data!.id, reviewer);
assert.equal(leadBackflowApproved.code, 0);
assert.equal(leadBackflowApproved.data?.linkedLeadId, undefined, '审核响应不得泄露 CRM 线索 ID');
assert.equal(blindMatchPrisma.records().find((item) => item.id === leadBackflow.data?.id)?.linkedLeadId, 'lead-recovery-new', '内部记录仍须保留线索关联');
assert.equal(leadBackflowApproved.data?.crmIdentityStatus, '已创建线索');
assert.equal(leadBackflowApproved.data?.leadSyncStatus, '已创建');
const safeBlindDetail = await blindMatchService.get(blindMatched.data!.id, reviewer, 'recoveryOrderApplications');
assert.equal(safeBlindDetail.data?.customerId, '', '售后详情响应不得下发内部 CRM 客户 ID');
assert.equal(safeBlindDetail.data?.linkedLeadId, undefined, '售后详情响应不得下发内部 CRM 线索 ID');

approvalSyncMode = 'conflict';
const conflicted = await blindMatchService.create(input({ thirdPartyOrderNo: 'TP-IDENTITY-CONFLICT' }), creator);
const conflictApproval = await blindMatchService.approve(conflicted.data!.id, reviewer);
assert.equal(conflictApproval.code, 409, '审核时重新查重发现身份冲突必须阻止进入分账');
assert.match(conflictApproval.message, /退回修改联系方式/);

const legacyRetryPrisma = new FakePrisma();
let legacyRetryNow = new Date('2026-07-12T18:00:00.000Z');
const legacyRetryService = createRecoveryOrderCommandService(legacyRetryPrisma as any, { now: () => legacyRetryNow });
const legacyRetryInput = input({ thirdPartyOrderNo: 'TP-LEGACY-RETRY', recoveryAt: undefined });
const legacyFirst = await legacyRetryService.create(legacyRetryInput, creator);
legacyRetryNow = new Date('2026-07-12T18:01:00.000Z');
const legacyReplayed = await legacyRetryService.create(legacyRetryInput, creator);
assert.equal(legacyReplayed.code, 0, '旧客户端未传挽回时间时重复提交仍须幂等');
assert.equal(legacyReplayed.data?.id, legacyFirst.data?.id);

const forgedAssignment = await service.create(input({
  thirdPartyOrderNo: 'TP-20260712-002', recoveryUserId: other.id, recoveryUserName: other.name,
}), creator);
assert.equal(forgedAssignment.code, 403, 'self scope 不得为其他人创建挪回单');
assert.equal(prisma.records().length, 3);

const updated = await service.update(created.data!.id, input({
  customerName: '张三（已核对）',
  recoveryAmount: 3980,
}), reviewer);
assert.equal(updated.code, 0);
assert.equal(updated.data?.customerName, '张三（已核对）');
assert.equal(updated.data?.updatedAt, NOW);

const approved = await service.approve(created.data!.id, reviewer);
assert.equal(approved.code, 0);
assert.equal(approved.data?.status, '审核通过');
assert.equal(approved.data?.auditorId, reviewer.id);
assert.equal((await service.approve(created.data!.id, reviewer)).code, 0, '重复审核应幂等');

const metadataEdited = await service.editMetadata(created.data!.id, {
  paymentOrderNo: 'PAY-METADATA-UPDATED',
  remark: '补充售后资料',
}, reviewer);
assert.equal(metadataEdited.code, 0, metadataEdited.message);
assert.equal(metadataEdited.data?.paymentOrderNo, 'PAY-METADATA-UPDATED');
assert.equal(metadataEdited.data?.sourcePlatform, approved.data?.sourcePlatform, 'PATCH 未传来源平台时必须保留原值');
assert.equal(metadataEdited.data?.sourceShopName, approved.data?.sourceShopName, 'PATCH 未传来源店铺时必须保留原值');
assert.equal(metadataEdited.data?.recoveryAmount, approved.data?.recoveryAmount, '资料编辑不得改变挽回成交金额');
assert.equal(metadataEdited.data?.status, '审核通过', '资料编辑不得改变审核状态');
assert.equal(metadataEdited.data?.settlementStatus, '待处理', '资料编辑不得改变分账状态');
assert.equal(metadataEdited.data?.changeHistory?.[0]?.action, 'edit');
const detailWithoutHistoryPermission = await service.get(created.data!.id, creator, 'recoveryOrders');
assert.equal(detailWithoutHistoryPermission.code, 0);
assert.equal(detailWithoutHistoryPermission.data?.changeHistory, undefined, '无修改记录权限时详情接口不得下发 changeHistory');

const correctionCommissionId = 'commission-recovery-correction';
const approvedRowKey = key(STORAGE_KEYS.RECOVERY_ORDERS, created.data!.id);
const approvedRow = prisma.rows.get(approvedRowKey)!;
approvedRow.status = '待分账';
approvedRow.data = {
  ...approvedRow.data,
  status: '待分账',
  settlementStatus: '待确认',
  commissionIds: [correctionCommissionId],
};
prisma.rows.set(key(STORAGE_KEYS.COMMISSIONS, correctionCommissionId), {
  id: `${STORAGE_KEYS.COMMISSIONS}:${correctionCommissionId}`,
  domain: STORAGE_KEYS.COMMISSIONS,
  recordId: correctionCommissionId,
  orderId: created.data!.id,
  status: '待确认',
  data: {
    id: correctionCommissionId,
    orderId: created.data!.id,
    sourceRecoveryOrderId: created.data!.id,
    status: '待确认',
    commissionAmount: 88,
  },
});
const correctionPrecheck = await service.precheckCorrection(created.data!.id, reviewer);
assert.equal(correctionPrecheck.code, 0, correctionPrecheck.message);
assert.equal(correctionPrecheck.data?.allowed, true);
assert.equal(correctionPrecheck.data?.commissionCount, 1);
const corrected = await service.correct(created.data!.id, {
  reason: '修正挽回成交金额',
  data: input({
    customerName: metadataEdited.data!.customerName,
    customerPhone: metadataEdited.data!.customerPhone,
    customerWechat: metadataEdited.data!.customerWechat,
    thirdPartyOrderNo: metadataEdited.data!.thirdPartyOrderNo,
    originalProduct: metadataEdited.data!.originalProduct,
    originalProductId: metadataEdited.data!.originalProductId,
    originalProductLevel: metadataEdited.data!.originalProductLevel,
    originalAmount: metadataEdited.data!.originalAmount,
    recoveryAmount: 3180,
    recoveryUserId: metadataEdited.data!.recoveryUserId,
    paymentOrderNo: metadataEdited.data!.paymentOrderNo,
  }),
}, reviewer);
assert.equal(corrected.code, 0, corrected.message);
assert.equal(corrected.data?.recoveryAmount, 3180);
assert.equal(corrected.data?.settlementStatus, '待处理');
assert.deepEqual(corrected.data?.commissionIds, []);
assert.equal(corrected.data?.changeHistory?.[0]?.action, 'correct');
assert.equal(corrected.data?.changeHistory?.[0]?.reason, '修正挽回成交金额');
assert.equal(
  prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, correctionCommissionId))?.data?.status,
  '已撤回',
  '更正应自动撤回尚未发放的售后分账',
);
const resettledAfterCorrection = await service.settle(created.data!.id, [{
  role: '挽回人员',
  ownerId: finance.id,
  payoutPlanName: '自定义金额',
  commissionAmount: 30,
  performanceAmount: 3180,
  ruleCalculationType: 'fixed',
}], '更正后重新分账', finance);
assert.equal(resettledAfterCorrection.code, 0, resettledAfterCorrection.message);
assert.equal(resettledAfterCorrection.data?.settlementStatus, '待确认', '已撤回历史分账不得阻止重新分账');
assert.equal(
  prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, correctionCommissionId))?.data?.status,
  '已撤回',
  '重新分账必须保留更正前的已撤回提成留痕',
);

const sourceLinkedPaidSource = await service.create(input({ thirdPartyOrderNo: 'TP-SOURCE-LINKED-PAID-CORRECTION' }), creator);
assert.equal((await service.approve(sourceLinkedPaidSource.data!.id, reviewer)).code, 0);
prisma.rows.set(key(STORAGE_KEYS.COMMISSIONS, 'commission-source-linked-paid'), {
  id: `${STORAGE_KEYS.COMMISSIONS}:commission-source-linked-paid`,
  domain: STORAGE_KEYS.COMMISSIONS,
  recordId: 'commission-source-linked-paid',
  orderId: null,
  status: '已发放',
  data: {
    id: 'commission-source-linked-paid',
    sourceRecoveryOrderId: sourceLinkedPaidSource.data!.id,
    status: '已发放',
    commissionAmount: 66,
  },
});
const sourceLinkedPaidPrecheck = await service.precheckCorrection(sourceLinkedPaidSource.data!.id, reviewer);
assert.equal(sourceLinkedPaidPrecheck.data?.allowed, false, '历史 sourceRecoveryOrderId 关联的已发放提成必须阻止更正');
assert.equal(sourceLinkedPaidPrecheck.data?.reasonCode, 'payout_started');

const paidSource = await service.create(input({ thirdPartyOrderNo: 'TP-PAID-CORRECTION-BLOCK' }), creator);
assert.equal((await service.approve(paidSource.data!.id, reviewer)).code, 0);
const paidRowKey = key(STORAGE_KEYS.RECOVERY_ORDERS, paidSource.data!.id);
const paidRow = prisma.rows.get(paidRowKey)!;
paidRow.status = '已分账';
paidRow.data = { ...paidRow.data, status: '已分账', settlementStatus: '已发放' };
const paidPrecheck = await service.precheckCorrection(paidSource.data!.id, reviewer);
assert.equal(paidPrecheck.code, 0);
assert.equal(paidPrecheck.data?.allowed, false, '已发放售后分账必须阻止直接更正');
assert.equal(paidPrecheck.data?.reasonCode, 'payout_started');

assert.equal(
  (await service.approve(oldRecord.id, staleReviewer)).code,
  403,
  '非财务账号即使残留审核写权限，也不能执行审核',
);

const returnedSource = await service.create(input({ thirdPartyOrderNo: 'TP-RETURN' }), creator);
const returned = await service.returnForChanges(returnedSource.data!.id, '请补充凭证', reviewer);
assert.equal(returned.code, 0);
assert.equal(returned.data?.status, '退回修改');
const resubmitted = await service.update(returnedSource.data!.id, input({
  thirdPartyOrderNo: 'TP-RETURN', remark: '已补充凭证',
}), creator);
assert.equal(resubmitted.code, 0, 'create-only 创建人可重提退回单');
assert.equal(resubmitted.data?.status, '待审核');

const rejectedSource = await service.create(input({ thirdPartyOrderNo: 'TP-REJECT' }), creator);
const rejected = await service.reject(rejectedSource.data!.id, '凭证无效', reviewer);
assert.equal(rejected.code, 0);
assert.equal(rejected.data?.status, '审核驳回');
const rejectedResubmit = await service.update(rejectedSource.data!.id, input({
  thirdPartyOrderNo: 'TP-REJECT', remark: '补齐资料后重新提交',
}), creator);
assert.equal(rejectedResubmit.code, 409, '审核驳回是终态，创建人不能修改或重新提交');
assert.match(rejectedResubmit.message, /审核驳回.*不能修改或重新提交/);
const rejectedPersisted = prisma.rows.get(key(STORAGE_KEYS.RECOVERY_ORDERS, rejectedSource.data!.id))!;
assert.equal(rejectedPersisted.status, '审核驳回', '失败重提不得改变审核驳回状态');
assert.equal((rejectedPersisted.data as RecoveryOrder).auditReason, '凭证无效', '失败重提不得覆盖原驳回审计原因');
const rejectedEditAttempt = await service.update(rejectedSource.data!.id, input({
  thirdPartyOrderNo: 'TP-REJECT', remark: '普通编辑权限尝试修改已驳回记录',
}), reviewer);
assert.equal(rejectedEditAttempt.code, 409, '普通编辑权限也不能修改审核驳回记录');
assert.match(rejectedEditAttempt.message, /审核驳回.*不能修改或重新提交/);

const withdrawnSource = await service.create(input({ thirdPartyOrderNo: 'TP-WITHDRAWN-DELETE' }), creator);
const withdrawnRow = prisma.rows.get(key(STORAGE_KEYS.RECOVERY_ORDERS, withdrawnSource.data!.id))!;
withdrawnRow.status = '已分账';
withdrawnRow.data = {
  ...withdrawnRow.data,
  status: '已分账',
  settlementStatus: '已撤回',
  commissionIds: ['commission-withdrawn-history'],
};
prisma.rows.set(key(STORAGE_KEYS.COMMISSIONS, 'commission-withdrawn-history'), {
  id: `${STORAGE_KEYS.COMMISSIONS}:commission-withdrawn-history`,
  domain: STORAGE_KEYS.COMMISSIONS,
  recordId: 'commission-withdrawn-history',
  orderId: withdrawnSource.data!.id,
  status: '已撤回',
  data: {
    id: 'commission-withdrawn-history',
    orderId: withdrawnSource.data!.id,
    sourceRecoveryOrderId: withdrawnSource.data!.id,
    status: '已撤回',
  },
});
const withdrawnDeleted = await service.softDelete(withdrawnSource.data!.id, '已撤回后清理', reviewer);
assert.equal(withdrawnDeleted.code, 0, '已撤回分账只保留历史关联，不应阻止售后挽回订单删除');
assert.equal(withdrawnDeleted.data?.deletedBy, reviewer.name);
assert.equal(
  (await service.get(withdrawnSource.data!.id, finance, 'recoveryOrders')).code,
  0,
  '财务中心必须继续读取已软删售后挽回订单的撤回留痕',
);
assert.equal(
  prisma.rows.has(key(STORAGE_KEYS.COMMISSIONS, 'commission-withdrawn-history')),
  true,
  '删除源售后挽回订单必须保留已撤回分账留痕',
);

assert.equal(
  (await (service as any).cleanupDeletedSettlement(withdrawnSource.data!.id, '清理废弃财务分账', reviewer)).code,
  403,
  '非超级管理员不得清理废弃财务分账',
);
const cleanedSettlement = await (service as any).cleanupDeletedSettlement(
  withdrawnSource.data!.id,
  '清理废弃财务分账',
  superAdmin,
);
assert.equal(cleanedSettlement.code, 0, '超级管理员应能清理源单已删除的财务分账留痕');
assert.equal(cleanedSettlement.data?.settlementCleanedById, superAdmin.id);
assert.equal(cleanedSettlement.data?.settlementCleanedBy, superAdmin.name);
assert.equal(cleanedSettlement.data?.settlementCleanupReason, '清理废弃财务分账');
assert.equal(prisma.rows.has(key(STORAGE_KEYS.RECOVERY_ORDERS, withdrawnSource.data!.id)), true, '清理只隐藏财务列表，不物理删除审计数据');
const financeListAfterCleanup = await service.list({
  scopeDomain: 'recoveryOrders',
  includeDeleted: true,
  settlementStatuses: ['已撤回'],
  page: 1,
  pageSize: 100,
}, superAdmin);
assert.equal(
  financeListAfterCleanup.data?.items.some((item) => item.id === withdrawnSource.data!.id),
  false,
  '已清理的废弃分账必须从财务售后分账列表移除',
);

const inconsistentWithdrawnSource = await service.create(input({ thirdPartyOrderNo: 'TP-WITHDRAWN-ACTIVE-COMMISSION' }), creator);
const inconsistentWithdrawnRow = prisma.rows.get(key(STORAGE_KEYS.RECOVERY_ORDERS, inconsistentWithdrawnSource.data!.id))!;
inconsistentWithdrawnRow.status = '已分账';
inconsistentWithdrawnRow.data = {
  ...inconsistentWithdrawnRow.data,
  status: '已分账',
  settlementStatus: '已撤回',
  commissionIds: ['commission-still-active'],
};
prisma.rows.set(key(STORAGE_KEYS.COMMISSIONS, 'commission-still-active'), {
  id: `${STORAGE_KEYS.COMMISSIONS}:commission-still-active`,
  domain: STORAGE_KEYS.COMMISSIONS,
  recordId: 'commission-still-active',
  orderId: inconsistentWithdrawnSource.data!.id,
  status: '待发放',
  data: {
    id: 'commission-still-active',
    orderId: inconsistentWithdrawnSource.data!.id,
    sourceRecoveryOrderId: inconsistentWithdrawnSource.data!.id,
    status: '待发放',
  },
});
const inconsistentDelete = await service.softDelete(inconsistentWithdrawnSource.data!.id, '尝试删除', reviewer);
assert.equal(inconsistentDelete.code, 409, '仍有关联活动提成时必须禁止删除');
assert.match(inconsistentDelete.message, /活动提成|处理分账/);
inconsistentWithdrawnRow.data = {
  ...inconsistentWithdrawnRow.data,
  deletedAt: NOW,
  deletedBy: '历史管理员',
  deleteReason: '模拟历史脏数据',
};
const cleanupWithActiveCommission = await service.cleanupDeletedSettlement(
  inconsistentWithdrawnSource.data!.id,
  '不应隐藏活动提成',
  superAdmin,
);
assert.equal(cleanupWithActiveCommission.code, 409, '关联提成仍在发放链路时不得清理隐藏');
assert.equal(inconsistentWithdrawnRow.data.settlementCleanedAt, undefined);
assert.equal(
  prisma.businessFindManyWheres.some((where) => (
    where.domain === STORAGE_KEYS.COMMISSIONS
    && where.OR?.some((candidate: any) => candidate.orderId === inconsistentWithdrawnSource.data!.id)
    && where.OR?.some((candidate: any) => candidate.recordId?.in?.includes('commission-still-active'))
  )),
  true,
  '删除校验必须按订单和历史提成 ID 查询关联分账',
);

const sourceLinkedOrder = await service.create(input({ thirdPartyOrderNo: 'TP-SOURCE-LINKED-COMMISSION' }), creator);
const sourceLinkedRow = prisma.rows.get(key(STORAGE_KEYS.RECOVERY_ORDERS, sourceLinkedOrder.data!.id))!;
sourceLinkedRow.status = '已分账';
sourceLinkedRow.data = {
  ...sourceLinkedRow.data,
  status: '已分账',
  settlementStatus: '已撤回',
  commissionIds: [],
};
prisma.rows.set(key(STORAGE_KEYS.COMMISSIONS, 'commission-source-linked'), {
  id: `${STORAGE_KEYS.COMMISSIONS}:commission-source-linked`,
  domain: STORAGE_KEYS.COMMISSIONS,
  recordId: 'commission-source-linked',
  orderId: 'legacy-mismatched-order-id',
  status: '待确认',
  data: {
    id: 'commission-source-linked',
    orderId: 'legacy-mismatched-order-id',
    sourceRecoveryOrderId: sourceLinkedOrder.data!.id,
    status: '待确认',
  },
});
const sourceLinkedDelete = await service.softDelete(sourceLinkedOrder.data!.id, '尝试删除', reviewer);
assert.equal(sourceLinkedDelete.code, 409, '仅通过 sourceRecoveryOrderId 关联的活动提成也必须阻止删除');

const rejectedCleanupSource = await service.create(input({ thirdPartyOrderNo: 'TP-REJECTED-CLEANUP' }), creator);
assert.equal((await service.reject(rejectedCleanupSource.data!.id, '审核驳回', reviewer)).code, 0);
const cleanedRejectedReview = await service.cleanupDeletedReview(
  rejectedCleanupSource.data!.id,
  '清理已驳回测试申请',
  superAdmin,
);
assert.equal(cleanedRejectedReview.code, 0, '超级管理员必须可以清理已驳回售后挽回申请');
assert.equal(cleanedRejectedReview.data?.reviewCleanedAt, NOW);
assert.equal(cleanedRejectedReview.data?.reviewCleanupReason, '清理已驳回测试申请');
assert.equal(
  prisma.rows.has(key(STORAGE_KEYS.RECOVERY_ORDERS, rejectedCleanupSource.data!.id)),
  true,
  '已驳回售后申请清理后仍须保留审计留痕',
);

const deleted = await service.softDelete(returnedSource.data!.id, '重复录入', reviewer);
assert.equal(deleted.code, 0);
assert.equal(deleted.data?.deletedBy, reviewer.name);
assert.equal(deleted.data?.deleteReason, '重复录入');
assert.equal(
  (await service.cleanupDeletedReview(returnedSource.data!.id, '清理审核台残留', reviewer)).code,
  403,
  '只有超级管理员可以清理售后审核台记录',
);
assert.equal(
  (await service.cleanupDeletedReview(returnedSource.data!.id, '', superAdmin)).code,
  400,
  '清理售后审核台记录必须填写原因',
);
const cleanedReview = await service.cleanupDeletedReview(returnedSource.data!.id, '清理审核台残留', superAdmin);
assert.equal(cleanedReview.code, 0);
assert.equal(cleanedReview.data?.reviewCleanedBy, superAdmin.name);
assert.equal(cleanedReview.data?.reviewCleanupReason, '清理审核台残留');
assert.equal(prisma.rows.has(key(STORAGE_KEYS.RECOVERY_ORDERS, returnedSource.data!.id)), true, '财务追溯记录不能物理删除');
const formalListWithDeletedRequested = await service.list({
  scopeDomain: 'recoveryOrders',
  includeDeleted: true,
  page: 1,
  pageSize: 100,
}, staleReviewer);
assert.equal(
  formalListWithDeletedRequested.data?.items.some((item) => item.id === returnedSource.data!.id),
  false,
  'formal recovery list must ignore includeDeleted even when a caller sets it directly',
);
const dualPermissionActor: AuthenticatedUser = {
  ...staleReviewer,
  permissions: [
    ...staleReviewer.permissions,
    { module: PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, actions: ['read', 'write'] },
  ],
};
const formalListWithFakeFinanceFilter = await service.list({
  scopeDomain: 'recoveryOrders',
  includeDeleted: true,
  settlementStatus: '全部',
  page: 1,
  pageSize: 100,
}, dualPermissionActor);
assert.equal(
  formalListWithFakeFinanceFilter.data?.items.some((item) => item.id === returnedSource.data!.id),
  false,
  'settlementStatus=全部 must not bypass deleted-record protection for dual-permission users',
);
const permanentReviewHistory = await service.list({
  scopeDomain: 'recoveryOrderApplications',
  includeDeleted: true,
  page: 1,
  pageSize: 100,
}, reviewer);
assert.equal(
  permanentReviewHistory.data?.items.some((item) => item.id === returnedSource.data!.id),
  false,
  '清理后的售后审核记录必须从审核台移除',
);
assert.equal(
  (await service.get(returnedSource.data!.id, reviewer, 'recoveryOrderApplications')).code,
  404,
  '清理后的售后审核记录详情也必须从审核台隐藏',
);
assert.notEqual(
  (await service.get(returnedSource.data!.id, reviewer, 'recoveryOrders')).code,
  0,
  'soft-deleted recovery evidence must stay hidden from the formal business list',
);

const payoutContextPrisma = new FakePrisma();
const payoutContextOrder: RecoveryOrder = {
  ...oldRecord,
  id: 'recovery-payout-context',
  recoveryNo: 'RCV-PAYOUT-CONTEXT',
  thirdPartyOrderNo: 'TP-PAYOUT-CONTEXT',
  status: '审核通过',
  settlementStatus: '已撤回',
  commissionIds: [],
  recoveryUserId: finance.id,
  recoveryUserName: finance.name,
};
const payoutContextCommission: Commission = {
  ...paidCommission,
  id: 'commission-payout-context',
  orderId: payoutContextOrder.id,
  orderNo: payoutContextOrder.recoveryNo,
  sourceRecoveryOrderId: payoutContextOrder.id,
  payoutRecordId: 'payout-context-record',
};
const payoutContextRecord = paidPayoutRecord(payoutContextCommission);
const activePayoutContextCommission: Commission = {
  ...payoutContextCommission,
  id: 'commission-payout-context-active',
  status: '待发放',
  payoutRecordId: undefined,
  paidAt: undefined,
};
payoutContextPrisma.rows.set(key(STORAGE_KEYS.RECOVERY_ORDERS, payoutContextOrder.id), {
  id: `${STORAGE_KEYS.RECOVERY_ORDERS}:${payoutContextOrder.id}`,
  domain: STORAGE_KEYS.RECOVERY_ORDERS,
  recordId: payoutContextOrder.id,
  status: payoutContextOrder.status,
  orderId: payoutContextOrder.id,
  eventAt: new Date(payoutContextOrder.recoveryAt!),
  data: clone(payoutContextOrder),
});
payoutContextPrisma.rows.set(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, payoutContextRecord.id), {
  id: `${STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES}:${payoutContextRecord.id}`,
  domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
  recordId: payoutContextRecord.id,
  status: payoutContextRecord.status,
  orderId: payoutContextOrder.id,
  eventAt: new Date(payoutContextRecord.issuedAt),
  data: clone(payoutContextRecord),
});
payoutContextPrisma.rows.set(key(STORAGE_KEYS.COMMISSIONS, activePayoutContextCommission.id), {
  id: `${STORAGE_KEYS.COMMISSIONS}:${activePayoutContextCommission.id}`,
  domain: STORAGE_KEYS.COMMISSIONS,
  recordId: activePayoutContextCommission.id,
  status: activePayoutContextCommission.status,
  orderId: payoutContextOrder.id,
  owner: activePayoutContextCommission.owner,
  amount: activePayoutContextCommission.commissionAmount,
  eventAt: new Date(activePayoutContextCommission.paymentDate!),
  data: clone(activePayoutContextCommission),
});
const payoutContextService = createRecoveryOrderCommandService(payoutContextPrisma as any, { now: () => new Date(NOW) });
const validPayoutContext = {
  payoutRecordId: payoutContextRecord.id,
  commissionId: payoutContextCommission.id,
};
const ordinaryPayoutHistoryPrecheck = await payoutContextService.precheckCorrection(
  payoutContextOrder.id,
  superAdmin,
);
assert.equal(
  ordinaryPayoutHistoryPrecheck.data?.allowed,
  false,
  '普通更正入口也必须自动识别历史发放，不能靠 payoutContext 才阻止重复支付',
);
assert.equal(ordinaryPayoutHistoryPrecheck.data?.mode, 'post_payout');
assert.match(ordinaryPayoutHistoryPrecheck.data?.message || '', /财务.*撤回/);
const payoutContextPrecheck = await payoutContextService.precheckCorrection(
  payoutContextOrder.id,
  superAdmin,
  validPayoutContext,
);
assert.equal(payoutContextPrecheck.data?.allowed, false, '当前仍有待发放分账时不得通过历史发放上下文重复付款');
assert.equal(payoutContextPrecheck.data?.mode, 'post_payout');
assert.match(payoutContextPrecheck.data?.message || '', /财务.*撤回/);
const activePayoutContextRow = payoutContextPrisma.rows.get(
  key(STORAGE_KEYS.COMMISSIONS, activePayoutContextCommission.id),
);
assert.ok(activePayoutContextRow);
activePayoutContextRow.status = '已撤回';
activePayoutContextRow.data = { ...activePayoutContextRow.data, status: '已撤回' };
const withdrawnPayoutContextPrecheck = await payoutContextService.precheckCorrection(
  payoutContextOrder.id,
  superAdmin,
  validPayoutContext,
);
assert.equal(withdrawnPayoutContextPrecheck.code, 0, withdrawnPayoutContextPrecheck.message);
assert.equal(withdrawnPayoutContextPrecheck.data?.allowed, true);
assert.equal(withdrawnPayoutContextPrecheck.data?.mode, 'post_payout', '当前分账撤回后应恢复已发放更正模式');
assert.equal(withdrawnPayoutContextPrecheck.data?.requiresImpactPreview, true);
payoutContextPrisma.rows.delete(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, payoutContextRecord.id));
const invalidPayoutContextPrecheck = await payoutContextService.precheckCorrection(
  payoutContextOrder.id,
  superAdmin,
  { ...validPayoutContext, commissionId: 'missing-commission' },
);
assert.equal(invalidPayoutContextPrecheck.data?.mode, 'standard', '无效发放快照不得触发已发放更正模式');
const snapshotOnlyRecord: CommissionPayoutRecord = {
  ...payoutContextRecord,
  id: 'payout-context-snapshot-only',
  commissionIds: [],
};
payoutContextPrisma.rows.set(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, snapshotOnlyRecord.id), {
  id: `${STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES}:${snapshotOnlyRecord.id}`,
  domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
  recordId: snapshotOnlyRecord.id,
  status: snapshotOnlyRecord.status,
  orderId: payoutContextOrder.id,
  eventAt: new Date(snapshotOnlyRecord.issuedAt),
  data: clone(snapshotOnlyRecord),
});
const snapshotOnlyPrecheck = await payoutContextService.precheckCorrection(
  payoutContextOrder.id,
  superAdmin,
  { payoutRecordId: snapshotOnlyRecord.id, commissionId: payoutContextCommission.id },
);
assert.equal(
  snapshotOnlyPrecheck.data?.mode,
  'standard',
  '仅 commissionSnapshots 存在但不在 payout.commissionIds 中的记录不得解锁已发放更正',
);
const legacyPayoutContextCommission: Commission = {
  ...payoutContextCommission,
  id: 'commission-payout-context-legacy',
  sourceBusinessType: undefined,
};
const legacyPayoutContextRecord = paidPayoutRecord(legacyPayoutContextCommission);
payoutContextPrisma.rows.set(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, legacyPayoutContextRecord.id), {
  id: `${STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES}:${legacyPayoutContextRecord.id}`,
  domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
  recordId: legacyPayoutContextRecord.id,
  status: legacyPayoutContextRecord.status,
  orderId: payoutContextOrder.id,
  eventAt: new Date(legacyPayoutContextRecord.issuedAt),
  data: clone(legacyPayoutContextRecord),
});
const legacyPayoutContextPrecheck = await payoutContextService.precheckCorrection(
  payoutContextOrder.id,
  superAdmin,
  {
    payoutRecordId: legacyPayoutContextRecord.id,
    commissionId: legacyPayoutContextCommission.id,
  },
);
assert.equal(
  legacyPayoutContextPrecheck.data?.mode,
  'post_payout',
  '已经关联源挽回单的历史发放快照必须支持售后挽回更正',
);
