import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
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
prisma.rows.delete(key(STORAGE_KEYS.RECOVERY_ORDERS, realtimeSettlementOrder.id));
if (realtimeCommission) prisma.rows.delete(key(STORAGE_KEYS.COMMISSIONS, realtimeCommission.recordId));

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
assert.equal(approved.data?.status, '待分账');
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
assert.equal(metadataEdited.data?.status, '待分账', '资料编辑不得改变审核状态');
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
assert.equal(rejectedResubmit.code, 0, '创建人可以修改并重新提交审核驳回记录');
assert.equal(rejectedResubmit.data?.status, '待审核');

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
