import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { RecoveryOrder, RecoveryOrderInput } from '../../src/types/recoveryOrder';
import { createRecoveryOrderCommandService } from './recoveryOrderCommandService';

const NOW = '2026-07-12T18:00:00.000Z';
const creator: AuthenticatedUser = {
  id: 'user-delivery', name: '交付A', account: 'delivery', email: 'delivery@example.com', phone: '',
  role: '交付工程师', roleId: 'role-delivery', departmentId: 'dept-delivery', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, actions: ['read', 'write'] }],
};
const other: AuthenticatedUser = {
  ...creator, id: 'user-other', name: '交付B', account: 'other', email: 'other@example.com',
};
const staleReviewer: AuthenticatedUser = {
  ...creator,
  id: 'user-stale-reviewer',
  name: '非财务审核残留账号',
  account: 'stale-reviewer',
  email: 'stale-reviewer@example.com',
  permissions: [{ module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, actions: ['read', 'write'] }],
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
    { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, actions: ['read', 'write'] },
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
    recoveryUserName: '伪造姓名', createdBy: other.id, createdByName: other.name, ...overrides,
  };
}

const oldRecord: RecoveryOrder = {
  id: 'recovery-old', recoveryNo: 'RCV-OLD', thirdPartyOrderNo: 'TP-OLD', customerId: '',
  customerName: '历史客户', customerMatchStatus: '手工填写', originalProduct: '历史产品',
  originalAmount: 100, recoveryAmount: 200, recoveryUserId: other.id, recoveryUserName: other.name,
  status: '待审核', settlementStatus: '未分账', commissionIds: [], createdBy: other.id,
  createdByName: other.name, createdAt: NOW, updatedAt: NOW,
};

const key = (domain: string, id: string) => `${domain}\u0000${id}`;
const clone = <T>(value: T): T => structuredClone(value);

class FakePrisma {
  rows = new Map([[key(STORAGE_KEYS.RECOVERY_ORDERS, oldRecord.id), {
    id: `${STORAGE_KEYS.RECOVERY_ORDERS}:${oldRecord.id}`, domain: STORAGE_KEYS.RECOVERY_ORDERS,
    recordId: oldRecord.id, status: oldRecord.status, data: clone(oldRecord),
  }]]);
  readonly user = { findMany: async () => [dbUser(creator), dbUser(other), dbUser(reviewer)] };
  readonly role = { findMany: async () => [{
    id: 'role-delivery', name: '交付工程师', code: 'delivery_engineer', departmentId: 'dept-delivery',
    permissions: creator.permissions, dataScopes: { recoveryOrderApplications: 'self' }, memberCount: 2,
    isActive: true, createdAt: new Date(NOW), updatedAt: new Date(NOW), description: null,
  }, {
    id: 'role-reviewer', name: '售后主管', code: 'after_sales_manager', departmentId: 'dept-delivery',
    permissions: reviewer.permissions, dataScopes: { recoveryOrderApplications: 'self' }, memberCount: 1,
    isActive: true, createdAt: new Date(NOW), updatedAt: new Date(NOW), description: null,
  }] };
  readonly department = { findMany: async () => [{
    id: 'dept-delivery', name: '交付部', code: 'DELIVERY', parentId: null, managerId: null,
    memberCount: 2, sortOrder: 1, isActive: true, createdAt: new Date(NOW), updatedAt: new Date(NOW),
  }] };
  readonly businessRecord = {
    findMany: async ({ where }: any) => Array.from(this.rows.values())
      .filter((row: any) => row.domain === where.domain)
      .map(clone),
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
const reviewerList = await service.list({ page: 1, pageSize: 20 }, reviewer);
assert.equal(reviewerList.data?.pagination.total, 2, '财务审核人必须从数据库看到全部待审核订单');

const replayed = await service.create(input(), creator);
assert.equal(replayed.code, 0);
assert.equal(replayed.data?.id, created.data?.id);
assert.equal(prisma.records().length, 2, '重试必须幂等');

const forgedAssignment = await service.create(input({
  thirdPartyOrderNo: 'TP-20260712-002', recoveryUserId: other.id, recoveryUserName: other.name,
}), creator);
assert.equal(forgedAssignment.code, 403, 'self scope 不得为其他人创建挪回单');
assert.equal(prisma.records().length, 2);

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
