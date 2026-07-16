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
  ],
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
    originalAmount: 899, recoveryAmount: 2980, recoveryUserId: creator.id,
    recoveryUserName: '伪造姓名', customerWechat: 'zhangsan', createdBy: other.id, createdByName: other.name, ...overrides,
  };
}

const oldRecord: RecoveryOrder = {
  id: 'recovery-old', recoveryNo: 'RCV-OLD', thirdPartyOrderNo: 'TP-OLD', customerId: '',
  customerName: '历史客户', customerMatchStatus: '手工填写', originalProduct: '历史产品',
  originalAmount: 100, recoveryAmount: 200, recoveryUserId: other.id, recoveryUserName: other.name,
  status: '待审核', settlementStatus: '待处理', commissionIds: [], createdBy: other.id,
  createdByName: other.name, createdAt: NOW, updatedAt: NOW,
  paymentVoucherPreview: INLINE_PROOF,
  chatEvidencePreview: INLINE_PROOF,
  customerPhone: '13800000000',
  customerWechat: 'private-wechat',
  remark: 'finance list must not expose this note',
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
  createdBy: outsideDepartmentCreator.id,
  createdByName: outsideDepartmentCreator.name,
};

const key = (domain: string, id: string) => `${domain}\u0000${id}`;
const clone = <T>(value: T): T => structuredClone(value);

class FakePrisma {
  rows = new Map([
    [key(STORAGE_KEYS.RECOVERY_ORDERS, oldRecord.id), {
      id: `${STORAGE_KEYS.RECOVERY_ORDERS}:${oldRecord.id}`, domain: STORAGE_KEYS.RECOVERY_ORDERS,
      recordId: oldRecord.id, status: oldRecord.status, data: clone(oldRecord),
    }],
    [key(STORAGE_KEYS.RECOVERY_ORDERS, outsideDepartmentRecord.id), {
      id: `${STORAGE_KEYS.RECOVERY_ORDERS}:${outsideDepartmentRecord.id}`, domain: STORAGE_KEYS.RECOVERY_ORDERS,
      recordId: outsideDepartmentRecord.id, status: outsideDepartmentRecord.status, data: clone(outsideDepartmentRecord),
    }],
  ]);
  readonly user = { findMany: async () => [dbUser(creator), dbUser(other), dbUser(outsideDepartmentCreator), dbUser(staleReviewer), dbUser(reviewer), dbUser(finance)] };
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
    findMany: async ({ where }: any) => Array.from(this.rows.values())
      .filter((row: any) => row.domain === where.domain)
      .map(clone),
    findUnique: async ({ where }: any) => {
      const target = where.domain_recordId;
      return clone(this.rows.get(key(target.domain, target.recordId)) || null);
    },
  };

  async $transaction<T>(callback: (transaction: any) => Promise<T>): Promise<T> {
    const staged = new Map(Array.from(this.rows.entries()).map(([id, row]) => [id, clone(row)]));
    const tx = { businessRecord: {
      findMany: async ({ where }: any) => Array.from(staged.values()).filter((row: any) => row.domain === where.domain).map(clone),
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
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      const row = staged.get(key(String(values[0] || ''), String(values[1] || '')));
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
const missingContact = await service.create(input({
  thirdPartyOrderNo: 'TP-NO-CONTACT', customerPhone: '', customerWechat: '',
}), creator);
assert.equal(missingContact.code, 400);
assert.equal(missingContact.message, '手机号或微信至少填写一项');

const tooManyProofs = Array.from({ length: 9 }, (_, index) => ({
  id: `proof-${index}`, name: `${index}.png`, mimeType: 'image/png', size: 100,
  category: 'recovery-payment-proof' as const, uploadedById: creator.id,
  uploadedByName: creator.name, uploadedAt: NOW,
}));
const tooManyProofsResult = await service.create(input({
  thirdPartyOrderNo: 'TP-TOO-MANY-PROOFS', paymentAttachments: tooManyProofs,
}), creator);
assert.equal(tooManyProofsResult.code, 400);
assert.equal(tooManyProofsResult.message, '收款凭证最多上传 8 张');

const created = await service.create(input(), creator);
assert.equal(created.code, 0, '只有 create 权限的角色应能通过记录级命令新增');
assert.equal(created.data?.createdBy, creator.id, '操作人必须由会话确定');
assert.equal(created.data?.createdByName, creator.name);
assert.equal(created.data?.recoveryUserName, creator.name, '姓名必须从员工目录解析');
assert.ok(prisma.records().some((item) => item.id === oldRecord.id), '新增不得覆盖或删除其他记录');

const creatorList = await service.list({ page: 1, pageSize: 20 }, creator);
assert.equal(creatorList.code, 0);
assert.deepEqual(
  creatorList.data?.items.map((item) => item.id),
  [created.data!.id],
  '切换账号后必须从数据库读取，并且普通员工只能看到自己提交的售后挽回订单',
);
const reviewerList = await service.list({
  scopeDomain: 'recoveryOrderApplications', page: 1, pageSize: 20,
}, reviewer);
assert.equal(reviewerList.data?.pagination.total, 3, '审核台全部范围必须从数据库看到所有部门的待审核订单');
const listedOldRecord = reviewerList.data?.items.find((item) => item.id === oldRecord.id);
assert.equal(listedOldRecord?.paymentVoucherPreview, undefined);
assert.equal(listedOldRecord?.chatEvidencePreview, undefined);
const oldRecordDetail = await service.get(oldRecord.id, reviewer, 'recoveryOrderApplications');
assert.equal(oldRecordDetail.data?.paymentVoucherPreview, INLINE_PROOF);
assert.equal(oldRecordDetail.data?.chatEvidencePreview, INLINE_PROOF);

const unauthorizedReviewList = await service.list({
  scopeDomain: 'recoveryOrderApplications', page: 1, pageSize: 20,
}, creator);
assert.equal(unauthorizedReviewList.code, 403, '没有审核列表权限不得从接口读取审核台数据');

const staleReviewerList = await service.list({
  scopeDomain: 'recoveryOrders', page: 1, pageSize: 20,
}, staleReviewer);
assert.equal(
  staleReviewerList.data?.pagination.total,
  2,
  'recovery order list must honor department data scope',
);
const settlementPage = await service.list({
  scopeDomain: 'recoveryOrders', settlementStatuses: ['待处理'], page: 1, pageSize: 20,
}, staleReviewer);
assert.deepEqual(settlementPage.data?.items.map((item) => item.id), [oldRecord.id]);
const settlementCounts = await service.settlementCounts({ includeDeleted: true }, staleReviewer);
assert.equal(settlementCounts.data?.total, 1);
assert.equal(settlementCounts.data?.statusCounts['待处理'], 1);
const financeList = await service.list({}, finance);
assert.equal(financeList.code, 0);
assert.deepEqual(
  financeList.data?.items.map((item) => item.id).sort(),
  [oldRecord.id, outsideDepartmentRecord.id].sort(),
  'finance-only access must be limited to settlement-ready orders',
);
financeList.data?.items.forEach((item) => {
  assert.equal(item.paymentVoucherPreview, undefined);
  assert.equal(item.chatEvidencePreview, undefined);
  assert.equal(item.customerPhone, undefined);
  assert.equal(item.customerWechat, undefined);
  assert.equal(item.remark, undefined);
});
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

const deleted = await service.softDelete(returnedSource.data!.id, '重复录入', reviewer);
assert.equal(deleted.code, 0);
assert.equal(deleted.data?.deletedBy, reviewer.name);
assert.equal(deleted.data?.deleteReason, '重复录入');
assert.equal(
  (await service.get(returnedSource.data!.id, reviewer, 'recoveryOrderApplications')).code,
  404,
  'soft-deleted recovery evidence must not be readable by id',
);
