import { PrismaClient, Prisma } from '@prisma/client';
import { STORAGE_KEYS } from '../src/shared/utils/constants';
import { createPasswordSalt, hashPassword } from '../src/shared/utils/auth';
import {
  assertSafeCloneDatabaseUrl,
  customerAlias,
  maskedEmail,
  maskedPhone,
  sanitizeBusinessValue,
  sanitizeCustomerValue,
} from './lib/cloneSanitizer';

const databaseUrl = String(process.env.DATABASE_URL || '');
assertSafeCloneDatabaseUrl(databaseUrl);

const apply = process.argv.includes('--apply');
const confirmation = process.argv.find((arg) => arg.startsWith('--confirm='))?.slice('--confirm='.length);
if (apply && confirmation !== 'SANITIZE_PRODUCTION_CLONE') throw new Error('apply 必须同时传入 --confirm=SANITIZE_PRODUCTION_CLONE');
if (apply && !String(process.env.LOCAL_CLONE_ADMIN_PASSWORD || '').trim()) throw new Error('apply 前必须设置 LOCAL_CLONE_ADMIN_PASSWORD');

const prisma = new PrismaClient();

try {
  const [users, sessions, aiProviders, leads, records] = await Promise.all([
    prisma.user.findMany(),
    prisma.authSession.count(),
    prisma.aiProviderConfig.count(),
    prisma.leadRecord.findMany(),
    prisma.businessRecord.findMany(),
  ]);
  const customers = records.filter((row) => row.domain === STORAGE_KEYS.CUSTOMERS);
  const customerNames = new Map(customers.map((row) => [row.recordId, customerAlias(row.recordId)]));
  const report = {
    mode: apply ? 'apply' : 'dry-run', users: users.length, sessions, aiProviders,
    leads: leads.length, customers: customers.length, businessRecords: records.length,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!apply) process.exitCode = 0;
  else {
    await prisma.$transaction(async (tx) => {
      await tx.authSession.deleteMany();
      await tx.aiProviderConfig.updateMany({ data: { apiKey: '', enabled: false } });
      await tx.appStorage.deleteMany({ where: { key: STORAGE_KEYS.AI_SESSIONS } });

      for (const [index, user] of users.entries()) {
        await tx.user.update({ where: { id: user.id }, data: {
          name: `测试员工-${String(index + 1).padStart(3, '0')}`,
          account: `disabled-${user.id}`.slice(0, 100),
          email: `disabled-${user.id}@example.invalid`.slice(0, 200),
          phone: '', avatar: null, passwordHash: null, passwordSalt: null,
          passwordUpdatedAt: null, mustChangePassword: true, lastLoginAt: null, isActive: false,
        } });
      }

      const adminId = 'local-clone-admin';
      const salt = createPasswordSalt(adminId);
      await tx.user.upsert({
        where: { id: adminId },
        create: {
          id: adminId, name: '本地测试管理员', account: 'localadmin', email: 'localadmin@example.invalid', phone: '',
          role: '超级管理员', roleId: 'role-super-admin', departmentId: 'dept-general', positionId: 'pos-general-manager',
          positionName: '总经理', passwordSalt: salt,
          passwordHash: hashPassword(String(process.env.LOCAL_CLONE_ADMIN_PASSWORD), salt), passwordUpdatedAt: new Date(),
          mustChangePassword: false, lastLoginAt: null, isActive: true, employmentStatus: 'active',
        },
        update: {
          name: '本地测试管理员', account: 'localadmin', email: 'localadmin@example.invalid', phone: '',
          passwordSalt: salt, passwordHash: hashPassword(String(process.env.LOCAL_CLONE_ADMIN_PASSWORD), salt),
          passwordUpdatedAt: new Date(), mustChangePassword: false, lastLoginAt: null, isActive: true, employmentStatus: 'active',
        },
      });

      for (const lead of leads) {
        const alias = customerAlias(lead.id);
        const sanitizedData = sanitizeBusinessValue(lead.data, lead.id, new Map([[lead.id, alias]]));
        await tx.leadRecord.update({ where: { id: lead.id }, data: {
          name: alias, company: lead.company ? `测试企业-${lead.id.slice(-8)}` : lead.company,
          phone: lead.phone ? maskedPhone(lead.id) : lead.phone,
          wechat: lead.wechat ? `wx_test_${lead.id.slice(-10)}` : lead.wechat,
          data: sanitizedData as Prisma.InputJsonValue,
        } });
      }

      for (const row of records) {
        const data = row.domain === STORAGE_KEYS.CUSTOMERS
          ? sanitizeCustomerValue(row.data, row.recordId)
          : sanitizeBusinessValue(row.data, row.recordId, customerNames);
        const title = row.domain === STORAGE_KEYS.CUSTOMERS ? customerAlias(row.recordId) : row.title;
        await tx.businessRecord.update({ where: { id: row.id }, data: { title, data: data as Prisma.InputJsonValue } });
      }
    }, { maxWait: 10_000, timeout: 300_000 });
    console.log(JSON.stringify({ status: 'completed', database: 'jixiang_os_prod_clone_test' }));
  }
} finally {
  await prisma.$disconnect();
}
