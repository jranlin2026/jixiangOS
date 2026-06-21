import type { User } from '../../../types/settings';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const mockUsers: User[] = [
  {
    id: 'user-001', name: '张伟', email: 'zhangwei@company.com', phone: '13800001001',
    role: '销售顾问', roleId: 'role-sales-consultant', departmentId: 'dept-sales', positionId: 'pos-sales-consultant', positionName: '销售顾问', isActive: true, createdAt: daysAgo(120), updatedAt: daysAgo(5),
  },
  {
    id: 'user-002', name: '李娜', email: 'lina@company.com', phone: '13900002002',
    role: '销售顾问', roleId: 'role-sales-consultant', departmentId: 'dept-sales', positionId: 'pos-sales-consultant', positionName: '销售顾问', isActive: true, createdAt: daysAgo(100), updatedAt: daysAgo(3),
  },
  {
    id: 'user-003', name: '王磊', email: 'wanglei@company.com', phone: '13700003003',
    role: '销售经理', roleId: 'role-sales-manager', departmentId: 'dept-sales', positionId: 'pos-sales-manager', positionName: '销售经理', isActive: true, createdAt: daysAgo(90), updatedAt: daysAgo(7),
  },
  {
    id: 'user-004', name: '赵敏', email: 'zhaomin@company.com', phone: '13600004004',
    role: '销售顾问', roleId: 'role-sales-consultant', departmentId: 'dept-sales', positionId: 'pos-sales-consultant', positionName: '销售顾问', isActive: true, createdAt: daysAgo(80), updatedAt: daysAgo(2),
  },
  {
    id: 'user-005', name: '刘强', email: 'liuqiang@company.com', phone: '13500005005',
    role: '超级管理员', roleId: 'role-super-admin', departmentId: 'dept-general', positionId: 'pos-general-manager', positionName: '总经理', isActive: true, createdAt: daysAgo(200), updatedAt: daysAgo(1),
  },
  {
    id: 'user-006', name: '陈芳', email: 'chenfang@company.com', phone: '13400006006',
    role: '运营管理员', roleId: 'role-ops-admin', departmentId: 'dept-ops', positionId: 'pos-ops-admin', positionName: '运营管理员', isActive: true, createdAt: daysAgo(60), updatedAt: daysAgo(10),
  },
  {
    id: 'user-007', name: '黄明', email: 'huangming@company.com', phone: '13300007007',
    role: '财务专员', roleId: 'role-finance-specialist', departmentId: 'dept-finance', positionId: 'pos-finance-specialist', positionName: '财务专员', isActive: true, createdAt: daysAgo(150), updatedAt: daysAgo(8),
  },
  {
    id: 'user-008', name: '孙丽', email: 'sunli@company.com', phone: '13200008008',
    role: '超级管理员', roleId: 'role-super-admin', departmentId: 'dept-general', positionId: 'pos-general-manager', positionName: '总经理', isActive: true, createdAt: daysAgo(365), updatedAt: daysAgo(1),
  },
  {
    id: 'user-009', name: '周杰', email: 'zhoujie@company.com', phone: '13100009009',
    role: '市场专员', roleId: 'role-market-specialist', departmentId: 'dept-market', positionId: 'pos-market-specialist', positionName: '市场专员', isActive: false, createdAt: daysAgo(90), updatedAt: daysAgo(30),
  },
  {
    id: 'user-010', name: '吴英', email: 'wuying@company.com', phone: '13000010010',
    role: '客户成功', roleId: 'role-customer-success', departmentId: 'dept-success', positionId: 'pos-customer-success', positionName: '客户成功', isActive: true, createdAt: daysAgo(45), updatedAt: daysAgo(5),
  },
];
