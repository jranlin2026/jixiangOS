import assert from 'node:assert/strict';
import { buildPositionGovernanceReadiness, buildPositionMappingPreview, createPositionGovernanceService } from './positionGovernance';

const readiness = buildPositionGovernanceReadiness({
  users: [
    { id: 'bound', name: '已绑定', departmentId: 'dept-sales', positionId: 'position-sales', positionName: '销售顾问', role: '员工' },
    { id: 'invalid', name: '无效绑定', departmentId: 'dept-customer', positionId: 'position-sales', positionName: '销售顾问', role: '员工' },
    { id: 'unique', name: '唯一匹配', departmentId: 'dept-sales', positionId: null, positionName: '销售顾问', role: '员工' },
    { id: 'multiple', name: '多个候选', departmentId: 'dept-sales', positionId: null, positionName: '销售主管', role: '销售主管' },
    { id: 'conflict', name: '部门冲突', departmentId: 'dept-customer', positionId: null, positionName: '销售顾问', role: '员工' },
    { id: 'missing', name: '无匹配', departmentId: 'dept-sales', positionId: null, positionName: '未知岗位', role: '系统管理员' },
  ],
  positions: [
    { id: 'position-sales', name: '销售顾问', departmentId: 'dept-sales', isActive: true },
    { id: 'position-manager-a', name: '销售主管', departmentId: 'dept-sales', isActive: true },
    { id: 'position-manager-b', name: '销售主管', departmentId: 'dept-sales', isActive: true },
  ],
  departments: [
    { id: 'dept-sales', name: '销售部' },
    { id: 'dept-customer', name: '客户成功部' },
  ],
  roles: [{ id: 'role-manager', name: '销售主管' }],
});

assert.deepEqual(readiness.map((item) => [item.employeeId, item.status]), [
  ['bound', 'BOUND_VALID'],
  ['invalid', 'INVALID_BINDING'],
  ['unique', 'UNIQUE_MATCH'],
  ['multiple', 'MULTIPLE_MATCHES'],
  ['conflict', 'DEPARTMENT_CONFLICT'],
  ['missing', 'NO_MATCH'],
]);
assert.deepEqual(readiness.find((item) => item.employeeId === 'multiple')?.warnings, ['ROLE_POSITION_SUSPECTED']);
assert.match(readiness.find((item) => item.employeeId === 'invalid')?.reason || '', /部门/);

const preview = buildPositionMappingPreview({
  users: [
    { id: 'user-unique', name: '张三', departmentId: 'dept-sales', positionName: '销售顾问', positionId: null },
    { id: 'user-conflict', name: '李四', departmentId: 'dept-customer', positionName: '销售顾问', positionId: null },
    { id: 'user-multiple', name: '王五', departmentId: 'dept-sales', positionName: '销售主管', positionId: null },
    { id: 'user-missing', name: '赵六', departmentId: 'dept-sales', positionName: '未知岗位', positionId: null },
    { id: 'user-bound', name: '已绑定', departmentId: 'dept-sales', positionName: '销售顾问', positionId: 'position-sales' },
  ],
  positions: [
    { id: 'position-sales', name: '销售顾问', departmentId: 'dept-sales', isActive: true },
    { id: 'position-manager-a', name: '销售主管', departmentId: 'dept-sales', isActive: true },
    { id: 'position-manager-b', name: '销售主管', departmentId: 'dept-sales', isActive: true },
  ],
  departments: [
    { id: 'dept-sales', name: '销售部' },
    { id: 'dept-customer', name: '客户成功部' },
  ],
});

assert.equal(preview.length, 4);
assert.deepEqual(preview.map((item) => [item.employeeId, item.matchStatus, item.suggestedPositionId]), [
  ['user-unique', 'UNIQUE_MATCH', 'position-sales'],
  ['user-conflict', 'DEPARTMENT_CONFLICT', undefined],
  ['user-multiple', 'MULTIPLE_MATCHES', undefined],
  ['user-missing', 'NO_MATCH', undefined],
]);
assert.deepEqual(preview[2].candidatePositionIds, ['position-manager-a', 'position-manager-b']);

const storedBatches: any[] = [];
const storedItems: any[] = [];
let employeeWriteCount = 0;
const service = createPositionGovernanceService({
  $transaction: async (work: (tx: any) => Promise<any>) => work({
    positionMappingBatch: {
      create: async ({ data }: any) => { storedBatches.push(data); return data; },
    },
    positionMappingItem: {
      createMany: async ({ data }: any) => { storedItems.push(...data); return { count: data.length }; },
    },
  }),
  user: {
    findMany: async () => [{
      id: 'user-preview', name: '预览员工', departmentId: 'dept-sales', positionId: null,
      positionName: '销售顾问', employmentStatus: 'active', updatedAt: new Date('2026-07-29T00:00:00.000Z'),
    }],
    update: async () => { employeeWriteCount += 1; },
  },
  position: { findMany: async () => [{ id: 'position-sales', name: '销售顾问', departmentId: 'dept-sales', isActive: true }] },
  department: { findMany: async () => [{ id: 'dept-sales', name: '销售部' }] },
  role: { findMany: async () => [{ id: 'role-employee', name: '员工' }] },
  positionMappingBatch: {
    create: async ({ data }: any) => { storedBatches.push(data); return data; },
  },
  positionMappingItem: {
    createMany: async ({ data }: any) => { storedItems.push(...data); return { count: data.length }; },
  },
} as any);

const persistedPreview = await service.createPreview({}, { id: 'admin', name: '管理员' });
assert.equal(persistedPreview.code, 0);
assert.equal(persistedPreview.data?.items.length, 1);
assert.equal(storedBatches.length, 1);
assert.equal(storedItems.length, 1);
assert.equal(employeeWriteCount, 0, '生成预览不得修改员工');

const readinessResult = await service.getReadiness({ page: 1, pageSize: 1, status: 'UNIQUE_MATCH' });
assert.equal(readinessResult.code, 0);
assert.equal(readinessResult.data?.total, 1);
assert.equal(readinessResult.data?.items[0].employeeId, 'user-preview');
assert.equal(readinessResult.data?.summary.total, 1);
assert.equal(readinessResult.data?.summary.uniqueMatch, 1);
assert.equal(storedBatches.length, 1, '只读盘点不得创建映射批次');
assert.equal(storedItems.length, 1, '只读盘点不得创建映射明细');

const employee = {
  id: 'user-apply', name: '回填员工', departmentId: 'dept-sales', positionId: null, positionName: '销售顾问',
  updatedAt: new Date('2026-07-29T00:00:00.000Z'),
};
const applyBatch: any = {
  id: 'batch-apply', status: 'PREVIEW', totalCount: 1, matchedCount: 1, conflictCount: 0, appliedCount: 0, failedCount: 0,
  createdAt: new Date('2026-07-29T00:00:00.000Z'), confirmedAt: null,
  items: [{
    id: 'item-apply', employeeId: employee.id, employeeName: employee.name, originalPositionName: employee.positionName,
    originalDepartmentId: employee.departmentId, originalDepartmentName: '销售部', employeeUpdatedAtSnapshot: employee.updatedAt,
    suggestedPositionId: 'position-sales', candidatePositionIds: ['position-sales'], confirmedPositionId: null,
    matchStatus: 'UNIQUE_MATCH', applyStatus: 'PENDING', failureReason: null,
  }],
};
const histories: any[] = [];
const batchUpdatePayloads: any[] = [];
const applyPrisma: any = {
  positionMappingBatch: {
    findUnique: async () => applyBatch,
    update: async ({ data }: any) => {
      batchUpdatePayloads.push(data);
      const nextData = { ...data };
      if (typeof nextData.appliedCount === 'object' && nextData.appliedCount?.increment) {
        nextData.appliedCount = applyBatch.appliedCount + nextData.appliedCount.increment;
      }
      return Object.assign(applyBatch, nextData);
    },
  },
  user: {
    findUnique: async () => employee,
    updateMany: async ({ where, data }: any) => {
      if (employee.id !== where.id || employee.positionId !== where.positionId || employee.updatedAt.getTime() !== where.updatedAt.getTime()) {
        return { count: 0 };
      }
      Object.assign(employee, data);
      return { count: 1 };
    },
  },
  position: { findUnique: async () => ({ id: 'position-sales', name: '销售顾问', departmentId: 'dept-sales', isActive: true }) },
  department: { findUnique: async () => ({ id: 'dept-sales', name: '销售部' }) },
  employeePositionHistory: { create: async ({ data }: any) => { histories.push(data); return data; } },
  positionMappingItem: {
    findUnique: async () => applyBatch.items[0],
    updateMany: async ({ where, data }: any) => {
      if (applyBatch.items[0].id !== where.id || applyBatch.items[0].applyStatus !== where.applyStatus) return { count: 0 };
      Object.assign(applyBatch.items[0], data);
      return { count: 1 };
    },
    update: async ({ data }: any) => Object.assign(applyBatch.items[0], data),
  },
};
applyPrisma.$transaction = async (work: (tx: any) => Promise<void>) => work(applyPrisma);
const applyService = createPositionGovernanceService(applyPrisma);
const duplicateSelection = await applyService.applyBatch('batch-apply', [
  { employeeId: employee.id, positionId: 'position-sales' },
  { employeeId: employee.id, positionId: 'position-sales' },
], { id: 'admin', name: '管理员' });
assert.notEqual(duplicateSelection.code, 0);
assert.match(duplicateSelection.message || '', /重复/);
const applied = await applyService.applyBatch('batch-apply', [{ employeeId: employee.id, positionId: 'position-sales' }], { id: 'admin', name: '管理员' });
assert.equal(applied.code, 0);
assert.equal(employee.positionId, 'position-sales');
assert.equal(histories.length, 1);
assert.deepEqual(batchUpdatePayloads[0].appliedCount, { increment: 1 }, '批次进度必须原子累加');
const replayed = await applyService.applyBatch('batch-apply', [{ employeeId: employee.id, positionId: 'position-sales' }], { id: 'admin', name: '管理员' });
assert.equal(replayed.code, 0);
assert.equal(histories.length, 1, '重复确认不得重复写入变更历史');
