import assert from 'node:assert/strict';
import { createSettingsService } from './settingsService';

const now = new Date('2026-07-17T00:00:00.000Z');
const userRow = (id: string, employmentStatus = 'active') => ({
  id,
  name: `姓名-${id}`,
  account: id,
  email: `${id}@example.com`,
  phone: '',
  role: '候选人',
  avatar: null,
  departmentId: id === 'user-other-dept' ? 'dept-other' : 'dept-sales',
  positionId: null,
  positionName: '销售',
  roleId: null,
  passwordHash: 'secret-hash',
  passwordSalt: 'secret-salt',
  passwordUpdatedAt: null,
  lastLoginAt: null,
  isActive: true,
  employmentStatus,
  leftAt: null,
  leftBy: null,
  createdAt: now,
  updatedAt: now,
});

const users = [
  userRow('user-actor'),
  userRow('user-peer'),
  userRow('user-other-dept'),
  userRow('user-left', 'left'),
];
const directory = {
  user: { findMany: async ({ where }: any = {}) => users.filter((user) => (
    (where?.isActive === undefined || user.isActive === where.isActive)
    && (where?.employmentStatus === undefined || user.employmentStatus === where.employmentStatus)
  )) },
  role: { findMany: async () => [] },
  department: { findMany: async () => [] },
  position: { findMany: async () => [] },
  authSession: { deleteMany: async () => ({ count: 0 }) },
  businessRecord: { findMany: async () => [] },
  leadRecord: { findMany: async () => [] },
};

const service = createSettingsService(directory as any);
const result = await service.listAssignableUsers();
assert.equal(result.code, 0);
assert.deepEqual(
  (result.data || []).map((user) => user.id),
  ['user-actor', 'user-peer', 'user-other-dept'],
  '线索、交付和售后共享候选目录不得被 customer data scope 缩小',
);
assert.equal('passwordHash' in (result.data?.[0] || {}), false);
assert.equal('passwordSalt' in (result.data?.[0] || {}), false);

const sharedDirectory = await service.listAssignableDirectory();
assert.deepEqual(
  sharedDirectory.data?.users.map((user) => user.id),
  ['user-actor', 'user-peer', 'user-other-dept'],
  '共享 assignable-directory 同样不得被 customer scope 缩小',
);

console.log('shared assignable users tests passed');
