import type { Department } from '../../../types/department';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const mockDepartments: Department[] = [
  { id: 'dept-001', name: '销售部', code: 'SALES', managerId: 'user-003', memberCount: 4, isActive: true, createdAt: daysAgo(365), updatedAt: daysAgo(5) },
  { id: 'dept-002', name: '运营部', code: 'OPS', managerId: 'user-006', memberCount: 2, isActive: true, createdAt: daysAgo(300), updatedAt: daysAgo(10) },
  { id: 'dept-003', name: '交付部', code: 'DELIVERY', parentId: 'dept-002', memberCount: 3, isActive: true, createdAt: daysAgo(280), updatedAt: daysAgo(8) },
  { id: 'dept-004', name: '财务部', code: 'FINANCE', managerId: 'user-007', memberCount: 2, isActive: true, createdAt: daysAgo(365), updatedAt: daysAgo(3) },
  { id: 'dept-005', name: '技术部', code: 'TECH', memberCount: 5, isActive: true, createdAt: daysAgo(350), updatedAt: daysAgo(7) },
  { id: 'dept-006', name: '市场部', code: 'MARKET', memberCount: 3, isActive: true, createdAt: daysAgo(200), updatedAt: daysAgo(12) },
];
