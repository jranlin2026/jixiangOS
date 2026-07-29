import assert from 'node:assert/strict';
import { buildPositionMappingPreview, createPositionGovernanceService } from './positionGovernance';

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
  user: {
    findMany: async () => [{
      id: 'user-preview', name: '预览员工', departmentId: 'dept-sales', positionId: null,
      positionName: '销售顾问', employmentStatus: 'active', updatedAt: new Date('2026-07-29T00:00:00.000Z'),
    }],
    update: async () => { employeeWriteCount += 1; },
  },
  position: { findMany: async () => [{ id: 'position-sales', name: '销售顾问', departmentId: 'dept-sales', isActive: true }] },
  department: { findMany: async () => [{ id: 'dept-sales', name: '销售部' }] },
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
const applyPrisma: any = {
  positionMappingBatch: {
    findUnique: async () => applyBatch,
    update: async ({ data }: any) => Object.assign(applyBatch, data),
  },
  user: {
    findUnique: async () => employee,
    update: async ({ data }: any) => Object.assign(employee, data),
  },
  position: { findUnique: async () => ({ id: 'position-sales', name: '销售顾问', departmentId: 'dept-sales', isActive: true }) },
  department: { findUnique: async () => ({ id: 'dept-sales', name: '销售部' }) },
  employeePositionHistory: { create: async ({ data }: any) => { histories.push(data); return data; } },
  positionMappingItem: { update: async ({ data }: any) => Object.assign(applyBatch.items[0], data) },
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
const replayed = await applyService.applyBatch('batch-apply', [{ employeeId: employee.id, positionId: 'position-sales' }], { id: 'admin', name: '管理员' });
assert.equal(replayed.code, 0);
assert.equal(histories.length, 1, '重复确认不得重复写入变更历史');
