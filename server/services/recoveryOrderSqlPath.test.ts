import assert from 'node:assert/strict';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { RecoveryOrder } from '../../src/types/recoveryOrder';
import { createRecoveryOrderCommandService } from './recoveryOrderCommandService';

const NOW = '2026-07-16T08:00:00.000Z';
const INLINE_PROOF = `data:image/png;base64,${'A'.repeat(10_000)}`;
const finance: AuthenticatedUser = {
  id: 'finance-user',
  name: '财务专员',
  account: 'finance',
  email: 'finance@example.com',
  phone: '',
  role: '财务专员',
  roleId: 'finance-role',
  departmentId: 'finance-department',
  isActive: true,
  permissions: [{ module: PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, actions: ['read', 'write'] }],
};

const recovery: RecoveryOrder = {
  id: 'recovery-sql-1',
  recoveryNo: 'RCV-20260716-001',
  thirdPartyOrderNo: 'TP-20260716-001',
  customerId: '',
  customerName: '客户A',
  customerPhone: '13800000000',
  customerWechat: 'private-wechat',
  customerMatchStatus: '手工填写',
  originalProduct: '课程A',
  originalAmount: 100,
  recoveryAmount: 200,
  recoveryUserId: 'sales-user',
  recoveryUserName: '销售A',
  status: '已分账',
  settlementStatus: '已分账' as unknown as RecoveryOrder['settlementStatus'],
  commissionIds: [],
  createdBy: 'sales-user',
  createdByName: '销售A',
  createdAt: NOW,
  updatedAt: NOW,
  paymentVoucherPreview: INLINE_PROOF,
  chatEvidencePreview: INLINE_PROOF,
  remark: '财务列表不应暴露的备注',
};

const sqlStatements: string[] = [];
const sqlValues: unknown[] = [];
const prisma = {
  user: {
    findMany: async () => [{
      id: finance.id,
      name: finance.name,
      account: finance.account,
      email: finance.email,
      phone: finance.phone,
      role: finance.role,
      avatar: null,
      departmentId: finance.departmentId,
      positionId: null,
      positionName: null,
      roleId: finance.roleId,
      passwordHash: null,
      passwordSalt: null,
      passwordUpdatedAt: null,
      lastLoginAt: null,
      isActive: true,
      employmentStatus: 'active',
      leftAt: null,
      leftBy: null,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    }],
  },
  role: {
    findMany: async () => [{
      id: finance.roleId,
      name: finance.role,
      code: 'finance_specialist',
      departmentId: finance.departmentId,
      permissions: finance.permissions,
      dataScopes: { recoveryOrders: 'all' },
      memberCount: 1,
      isActive: true,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
      description: null,
    }],
  },
  department: {
    findMany: async () => [{
      id: finance.departmentId,
      name: '财务部',
      code: 'FINANCE',
      parentId: null,
      managerId: null,
      memberCount: 1,
      sortOrder: 1,
      isActive: true,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    }],
  },
  businessRecord: {
    findMany: async () => { throw new Error('unrestricted production path must use SQL paging'); },
    findUnique: async () => null,
  },
  $transaction: async () => { throw new Error('not used'); },
  $queryRaw: async (query: { strings?: readonly string[]; values?: readonly unknown[] }) => {
    const sql = query.strings?.join('?') || '';
    sqlStatements.push(sql);
    sqlValues.push(...(query.values || []));
    if (sql.includes('GROUP BY settlementStatus')) {
      return [{ settlementStatus: '待发放', count: 1 }];
    }
    if (sql.includes('COUNT(*) AS total')) return [{ total: 1 }];
    if (sql.includes('AS id,') && sql.includes('AS data')) return [{ id: recovery.id, data: recovery }];
    if (sql.includes('AS id')) return [{ id: recovery.id }];
    throw new Error(`unexpected SQL: ${sql}`);
  },
};

const service = createRecoveryOrderCommandService(prisma as any);
const page = await service.list({ search: recovery.recoveryNo, page: 1, pageSize: 10 }, finance);

assert.equal(page.code, 0);
assert.deepEqual(page.data?.items.map((item) => item.id), [recovery.id]);
assert.equal(page.data?.items[0]?.settlementStatus, recovery.settlementStatus);
assert.equal(page.data?.items[0]?.customerPhone, undefined);
assert.equal(page.data?.items[0]?.customerWechat, undefined);
assert.equal(page.data?.items[0]?.remark, undefined);
assert.equal(page.data?.items[0]?.paymentVoucherPreview, undefined);
assert.equal(page.data?.items[0]?.chatEvidencePreview, undefined);

const listSql = sqlStatements.join('\n');
assert.ok(sqlValues.includes('$.recoveryNo'), '生产 SQL 搜索必须支持挽回单号');
assert.match(listSql, /CASE/, '生产 SQL 必须归一化历史分账状态');
assert.match(listSql, /br\.eventAt DESC, br\.createdAt DESC/, '列表必须使用可索引排序');
assert.doesNotMatch(listSql, /COALESCE\(br\.eventAt/, '列表排序不得引入 filesort 表达式');

sqlStatements.length = 0;
sqlValues.length = 0;
const filteredPage = await service.list({ settlementStatuses: ['待发放'], page: 1, pageSize: 10 }, finance);
assert.equal(filteredPage.code, 0);
assert.ok(sqlValues.includes('待发放'));
assert.equal(sqlValues.includes('待处理'), false, 'finance-only SQL must not broaden a selected status tab');

sqlStatements.length = 0;
sqlValues.length = 0;
const counts = await service.settlementCounts({ includeDeleted: false }, finance);
assert.equal(counts.code, 0);
assert.equal(counts.data?.total, 1);
assert.equal(counts.data?.statusCounts['待发放'], 1);
assert.match(sqlStatements.join('\n'), /GROUP BY settlementStatus/);
