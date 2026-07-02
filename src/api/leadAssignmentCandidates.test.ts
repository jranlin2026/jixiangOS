import assert from 'node:assert/strict';
import { getLeadAssignmentCandidates, NO_LEAD_FLOW_PARTICIPANTS_MARKER } from '../shared/utils/leadAssignment';
import type { LeadFlowConfig } from '../types/lead';
import type { User } from '../types/settings';

const now = '2026-07-02T00:00:00.000Z';

const users: User[] = [
  {
    id: 'user-super-admin',
    name: '超级管理员',
    account: 'admin',
    email: '',
    phone: '',
    role: '超级管理员',
    roleId: 'role-super-admin',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-finance',
    name: '财务',
    account: 'finance',
    email: '',
    phone: '',
    role: '财务专员',
    roleId: 'role-finance',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-left',
    name: '离职员工',
    account: 'left',
    email: '',
    phone: '',
    role: '销售顾问',
    roleId: 'role-sales',
    isActive: true,
    employmentStatus: 'left',
    createdAt: now,
    updatedAt: now,
  },
];

const baseConfig: LeadFlowConfig = {
  id: 'lead-flow-global',
  uniqueKeyMode: 'phone_or_wechat',
  interceptionEnabled: true,
  autoAssignEnabled: true,
  assignmentMode: 'round_robin',
  participantUserIds: [],
  dailyLimitEnabled: false,
  dailyLimit: 200,
  lastAssignedIndex: -1,
  updatedAt: now,
};

assert.deepEqual(
  getLeadAssignmentCandidates(users, baseConfig).map((user) => user.id),
  ['user-super-admin', 'user-finance'],
);

assert.deepEqual(
  getLeadAssignmentCandidates(users, { ...baseConfig, participantUserIds: ['user-super-admin'] }).map((user) => user.id),
  ['user-super-admin'],
);

assert.deepEqual(
  getLeadAssignmentCandidates(users, { ...baseConfig, participantUserIds: [NO_LEAD_FLOW_PARTICIPANTS_MARKER] }).map((user) => user.id),
  [],
);
