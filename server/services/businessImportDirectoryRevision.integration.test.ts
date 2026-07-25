import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { BusinessImportJobExecution, BusinessImportJobRow } from '../../src/types/businessImport';
import { createPrismaBusinessImportRowExecutor, loadBusinessImportDirectoryRevision } from './businessImportExecutionAdapter';

if (!process.env.DATABASE_URL) {
  console.log('business import directory revision integration skipped: DATABASE_URL is not set');
} else {
  const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
  const queries: string[] = [];
  prisma.$on('query', (event) => queries.push(event.query));
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const old = new Date('2000-01-01T00:00:00.000Z');
  const newer = new Date('2001-01-01T00:00:00.000Z');
  const ids = {
    user: `bir-user-${suffix}`, userSentinel: `bir-user-s-${suffix}`,
    authorityUser: `bir-authority-user-${suffix}`,
    role: `bir-role-${suffix}`, roleSentinel: `bir-role-s-${suffix}`,
    authorityRole: `bir-authority-role-${suffix}`,
    department: `bir-dept-${suffix}`, departmentSentinel: `bir-dept-s-${suffix}`,
    storage: `bir-storage-${suffix}`, storageSentinel: `bir-storage-s-${suffix}`,
    customer: `bir-customer-${suffix}`, customerSentinel: `bir-customer-s-${suffix}`,
  };
  try {
    await prisma.user.createMany({ data: [
      { id: ids.user, name: '待删除员工', email: `${ids.user}@example.test`, phone: '13000000001', role: '员工', createdAt: old, updatedAt: old },
      { id: ids.userSentinel, name: '员工哨兵', email: `${ids.userSentinel}@example.test`, phone: '13000000002', role: '员工', createdAt: newer, updatedAt: newer },
      { id: ids.authorityUser, name: '导入权限测试员', email: `${ids.authorityUser}@example.test`, phone: '13000000003', role: '导入权限测试', roleId: ids.authorityRole },
    ] });
    await prisma.role.createMany({ data: [
      { id: ids.role, name: '待删除角色', normalizedName: ids.role, code: ids.role, permissions: [], createdAt: old, updatedAt: old },
      { id: ids.roleSentinel, name: '角色哨兵', normalizedName: ids.roleSentinel, code: ids.roleSentinel, permissions: [], createdAt: newer, updatedAt: newer },
      { id: ids.authorityRole, name: '导入权限测试', normalizedName: '导入权限测试', code: ids.authorityRole, permissions: [{ module: '订单/订单列表/导入订单', actions: ['read', 'write'] }] },
    ] });
    await prisma.department.createMany({ data: [
      { id: ids.department, name: '待删除部门', code: ids.department, createdAt: old, updatedAt: old },
      { id: ids.departmentSentinel, name: '部门哨兵', code: ids.departmentSentinel, createdAt: newer, updatedAt: newer },
    ] });
    await prisma.appStorage.createMany({ data: [
      { key: ids.storage, value: { values: ['待删除配置'] }, createdAt: old, updatedAt: old },
      { key: ids.storageSentinel, value: { values: ['配置哨兵'] }, createdAt: newer, updatedAt: newer },
    ] });
    await prisma.businessRecord.createMany({ data: [
      { id: ids.customer, domain: 'aaos_customers', recordId: ids.customer, data: { id: ids.customer }, createdAt: old, updatedAt: old },
      { id: ids.customerSentinel, domain: 'aaos_customers', recordId: ids.customerSentinel, data: { id: ids.customerSentinel }, createdAt: newer, updatedAt: newer },
    ] });

    let revision = await loadBusinessImportDirectoryRevision(prisma);
    const assertDeleteInvalidates = async (remove: () => Promise<unknown>, label: string) => {
      await remove();
      const next = await loadBusinessImportDirectoryRevision(prisma);
      assert.notEqual(next, revision, `删除非最新${label}也必须使目录版本失效`);
      revision = next;
    };
    await assertDeleteInvalidates(() => prisma.user.delete({ where: { id: ids.user } }), '员工');
    await assertDeleteInvalidates(() => prisma.role.delete({ where: { id: ids.role } }), '角色');
    await assertDeleteInvalidates(() => prisma.department.delete({ where: { id: ids.department } }), '组织');
    await assertDeleteInvalidates(() => prisma.appStorage.delete({ where: { key: ids.storage } }), '配置');
    await assertDeleteInvalidates(() => prisma.businessRecord.delete({ where: { id: ids.customer } }), '客户');

    let submissions = 0;
    const executor = createPrismaBusinessImportRowExecutor({
      prisma,
      loadExecutionSnapshot: async () => ({ actor: {} as any, directory: {
        products: [{ id: 'product', name: '训练营', level: '899' }], orderTypes: [{ id: 'type', name: '新购' }],
        paymentChannels: ['企业微信转账'], users: [{ id: ids.authorityUser, name: '导入权限测试员' }, { id: 'sales', name: '销售甲' }],
        recoveryPlatforms: [], recoveryShops: [], existingOrderNumbers: new Set(), existingRecoveryOrderNumbers: new Set(),
        customerMatchesByContact: new Map([['phone:+8613800000000', [{ id: 'customer', name: '客户', inScope: true }]]]),
      } }),
      orderApplications: { submitImported: async () => { submissions += 1; return { code: 0, data: { id: `record-${submissions}` } }; } },
      recoveryOrders: { createImported: async () => { throw new Error('wrong module'); } },
    });
    const job: BusinessImportJobExecution = { id: `job-${suffix}`, batchId: `batch-${suffix}`, type: 'orders', status: 'running', actorId: ids.authorityUser, actorName: '导入权限测试员', totalCount: 2, successCount: 0, failedCount: 0, leaseOwner: 'worker', leaseEpoch: 1 };
    const row = (rowNumber: number): BusinessImportJobRow => ({ rowNumber, status: 'ready', reason: '可导入', customerId: 'customer', executionStatus: 'queued', normalized: { rowNumber, customerName: '客户', customerPhone: '13800000000', customerWechat: '', productName: '训练营', orderType: '新购', paymentChannel: '企业微信转账', paymentAmount: 1, paidAt: '2026-07-25', salesUserName: '销售甲', creatorName: '', thirdPartyOrderNo: `AUTH-${rowNumber}`, remark: '' } });
    queries.length = 0;
    await executor.execute(job, row(2));
    await prisma.role.update({ where: { id: ids.authorityRole }, data: { permissions: [] } });
    await assert.rejects(() => executor.execute(job, row(3)), /权限已变化/, '角色撤权后下一行必须立即阻断');
    assert.equal(submissions, 1, '撤权后不得多提交一行');
    const authorityQueries = queries.filter((query) => /^SELECT\b/i.test(query.trim()) && /FROM users u/i.test(query));
    assert.equal(authorityQueries.length, 2, '每行只用一条 users+role 权威查询');
  } finally {
    await prisma.businessRecord.deleteMany({ where: { id: { in: [ids.customer, ids.customerSentinel] } } });
    await prisma.appStorage.deleteMany({ where: { key: { in: [ids.storage, ids.storageSentinel] } } });
    await prisma.department.deleteMany({ where: { id: { in: [ids.department, ids.departmentSentinel] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.user, ids.userSentinel, ids.authorityUser] } } });
    await prisma.role.deleteMany({ where: { id: { in: [ids.role, ids.roleSentinel, ids.authorityRole] } } });
    await prisma.$disconnect();
  }
  console.log('business import directory revision integration: ok');
}
