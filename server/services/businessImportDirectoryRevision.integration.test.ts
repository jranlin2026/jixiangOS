import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { loadBusinessImportDirectoryRevision } from './businessImportExecutionAdapter';

if (!process.env.DATABASE_URL) {
  console.log('business import directory revision integration skipped: DATABASE_URL is not set');
} else {
  const prisma = new PrismaClient();
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const old = new Date('2000-01-01T00:00:00.000Z');
  const newer = new Date('2001-01-01T00:00:00.000Z');
  const ids = {
    user: `bir-user-${suffix}`, userSentinel: `bir-user-s-${suffix}`,
    role: `bir-role-${suffix}`, roleSentinel: `bir-role-s-${suffix}`,
    department: `bir-dept-${suffix}`, departmentSentinel: `bir-dept-s-${suffix}`,
    storage: `bir-storage-${suffix}`, storageSentinel: `bir-storage-s-${suffix}`,
    customer: `bir-customer-${suffix}`, customerSentinel: `bir-customer-s-${suffix}`,
  };
  try {
    await prisma.user.createMany({ data: [
      { id: ids.user, name: '待删除员工', email: `${ids.user}@example.test`, phone: '13000000001', role: '员工', createdAt: old, updatedAt: old },
      { id: ids.userSentinel, name: '员工哨兵', email: `${ids.userSentinel}@example.test`, phone: '13000000002', role: '员工', createdAt: newer, updatedAt: newer },
    ] });
    await prisma.role.createMany({ data: [
      { id: ids.role, name: '待删除角色', normalizedName: ids.role, code: ids.role, permissions: [], createdAt: old, updatedAt: old },
      { id: ids.roleSentinel, name: '角色哨兵', normalizedName: ids.roleSentinel, code: ids.roleSentinel, permissions: [], createdAt: newer, updatedAt: newer },
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
  } finally {
    await prisma.businessRecord.deleteMany({ where: { id: { in: [ids.customer, ids.customerSentinel] } } });
    await prisma.appStorage.deleteMany({ where: { key: { in: [ids.storage, ids.storageSentinel] } } });
    await prisma.department.deleteMany({ where: { id: { in: [ids.department, ids.departmentSentinel] } } });
    await prisma.role.deleteMany({ where: { id: { in: [ids.role, ids.roleSentinel] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.user, ids.userSentinel] } } });
    await prisma.$disconnect();
  }
  console.log('business import directory revision integration: ok');
}
