import type { Role } from '../../../types/role';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const mockRoles: Role[] = [
  {
    id: 'role-001', name: '超级管理员', code: 'super_admin', departmentId: 'dept-005',
    permissions: [{ module: '全部', actions: ['read', 'write', 'delete', 'admin'] }],
    memberCount: 1, isActive: true, createdAt: daysAgo(365), updatedAt: daysAgo(5),
  },
  {
    id: 'role-002', name: '销售经理', code: 'sales_manager', departmentId: 'dept-001',
    permissions: [
      { module: '线索', actions: ['read', 'write', 'delete'] },
      { module: '商机', actions: ['read', 'write', 'delete'] },
      { module: '客户', actions: ['read', 'write'] },
      { module: '订单', actions: ['read', 'write', 'delete'] },
      { module: '提成', actions: ['read'] },
      { module: '数据', actions: ['read'] },
    ],
    memberCount: 1, isActive: true, createdAt: daysAgo(300), updatedAt: daysAgo(8),
  },
  {
    id: 'role-003', name: '销售顾问', code: 'sales_consultant', departmentId: 'dept-001',
    permissions: [
      { module: '线索', actions: ['read', 'write'] },
      { module: '商机', actions: ['read', 'write'] },
      { module: '客户', actions: ['read', 'write'] },
      { module: '订单', actions: ['read', 'write'] },
    ],
    memberCount: 3, isActive: true, createdAt: daysAgo(280), updatedAt: daysAgo(6),
  },
  {
    id: 'role-004', name: '运营专员', code: 'ops_specialist', departmentId: 'dept-002',
    permissions: [
      { module: '数据', actions: ['read'] },
      { module: '客户画像', actions: ['read'] },
      { module: 'AI助手', actions: ['read', 'write'] },
    ],
    memberCount: 2, isActive: true, createdAt: daysAgo(250), updatedAt: daysAgo(10),
  },
  {
    id: 'role-005', name: '交付工程师', code: 'delivery_engineer', departmentId: 'dept-003',
    permissions: [
      { module: '交付', actions: ['read', 'write'] },
      { module: '订单', actions: ['read'] },
    ],
    memberCount: 3, isActive: true, createdAt: daysAgo(200), updatedAt: daysAgo(7),
  },
  {
    id: 'role-006', name: '财务专员', code: 'finance_specialist', departmentId: 'dept-004',
    permissions: [
      { module: '财务', actions: ['read', 'write'] },
      { module: '提成', actions: ['read', 'write'] },
      { module: '订单', actions: ['read'] },
    ],
    memberCount: 2, isActive: true, createdAt: daysAgo(365), updatedAt: daysAgo(3),
  },
  {
    id: 'role-007', name: '市场专员', code: 'market_specialist', departmentId: 'dept-006',
    permissions: [
      { module: '线索', actions: ['read'] },
      { module: '商机', actions: ['read'] },
      { module: '数据', actions: ['read'] },
      { module: '渠道', actions: ['read', 'write'] },
    ],
    memberCount: 3, isActive: true, createdAt: daysAgo(180), updatedAt: daysAgo(9),
  },
];
