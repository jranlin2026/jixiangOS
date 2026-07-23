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
    originalAmount: 899, recoveryAmount: 2980, recoveryAt: '2026-07-12T15:30:00.000Z', recoveryUserId: creator.id,
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
assert.equal(tooManyProofsResult.message, '挽回凭证最多上传 8 张');

const created = await service.create(input(), creator);
assert.equal(created.code, 0, '只有 create 权限的角色应能通过记录级命令新增');
assert.equal(created.data?.createdBy, creator.id, '操作人必须由会话确定');
assert.equal(created.data?.createdByName, creator.name);
assert.equal(created.data?.recoveryUserName, creator.name, '姓名必须从员工目录解析');
assert.equal(created.data?.recoveryAt, '2026-07-12T15:30:00.000Z', '挽回时间必须按提交值保存');
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
