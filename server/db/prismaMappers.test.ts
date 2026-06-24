import assert from 'node:assert/strict';
import { mapPrismaRole, mapPrismaUser } from './prismaMappers';

const now = new Date('2026-06-24T00:00:00.000Z');

const role = mapPrismaRole({
  id: 'role-super-admin',
  name: '超级管理员',
  code: 'super_admin',
  description: '拥有全部权限',
  departmentId: null,
  permissions: [{ module: '全部', actions: ['admin'] }],
  dataScopes: { leads: 'all' },
  memberCount: 1,
  isActive: true,
  createdAt: now,
  updatedAt: now,
});

assert.equal(role.id, 'role-super-admin');
assert.equal(role.permissions[0]?.module, '全部');
assert.equal(role.dataScopes?.leads, 'all');

const user = mapPrismaUser({
  id: 'user-admin',
  name: '系统管理员',
  account: 'admin',
  email: 'admin@company.com',
  phone: '',
  role: '超级管理员',
  avatar: null,
  departmentId: 'dept-general',
  positionId: 'pos-general-manager',
  positionName: '总经理',
  roleId: 'role-super-admin',
  passwordHash: 'mock-hash',
  passwordSalt: 'mock-salt',
  passwordUpdatedAt: now,
  lastLoginAt: null,
  isActive: true,
  employmentStatus: 'active',
  leftAt: null,
  leftBy: null,
  createdAt: now,
  updatedAt: now,
});

assert.equal(user.account, 'admin');
assert.equal(user.passwordHash, 'mock-hash');
assert.equal(user.createdAt, '2026-06-24T00:00:00.000Z');
