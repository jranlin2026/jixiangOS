import assert from 'node:assert/strict';
import { prisma } from '../../server/db/client';
import { createAuthService } from '../../server/services/authService';
import { createPrismaSystemSetupRepository } from '../../server/services/systemSetupRepository';
import { createSystemSetupService } from '../../server/services/systemSetupService';

const databaseUrl = new URL(String(process.env.DATABASE_URL || ''));
const databaseName = databaseUrl.pathname.slice(1);
if (!['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) || !/_test(?:_|$)/.test(databaseName)) {
  throw new Error('SYSTEM_SETUP_QA_REQUIRES_LOOPBACK_TEST_DATABASE');
}

const setupToken = String(process.env.JIXIANG_SETUP_TOKEN || '');
assert.ok(setupToken.length >= 32, 'QA setup token must be configured');
const service = createSystemSetupService({
  repository: createPrismaSystemSetupRepository(prisma, {
    installationId: () => 'qa-installation-id',
    userId: () => 'qa-initial-admin',
  }),
  setupToken,
});

try {
  const initial = await service.status();
  assert.equal(initial.data?.state, 'UNINITIALIZED');

  const denied = await service.initialize({
    setupToken: 'wrong-token', companyName: 'QA企业', adminName: 'QA管理员', adminAccount: 'qa_admin',
    adminEmail: 'qa-admin@example.com', adminPhone: '', adminPassword: 'Strong-password-2026',
    organizationTemplate: 'recommended', includeDemoData: process.env.QA_INCLUDE_DEMO === 'true',
  });
  assert.equal(denied.code, 401);
  assert.equal(await prisma.user.count(), 0);

  const initialized = await service.initialize({
    setupToken, companyName: 'QA企业', adminName: 'QA管理员', adminAccount: 'qa_admin',
    adminEmail: 'qa-admin@example.com', adminPhone: '13800000000', adminPassword: 'Strong-password-2026',
    organizationTemplate: 'recommended', includeDemoData: process.env.QA_INCLUDE_DEMO === 'true',
  });
  assert.equal(initialized.code, 0, initialized.message);
  assert.equal(initialized.data?.state, 'ACTIVE');
  assert.equal(await prisma.user.count(), 1);
  assert.ok(await prisma.role.count() > 1);
  assert.ok(await prisma.department.count() > 1);

  const login = await createAuthService(prisma).login({
    account: 'qa_admin', password: 'Strong-password-2026', remember: false,
  });
  assert.equal(login.code, 0, login.message);
  assert.equal(login.data?.user.roleId, 'role-super-admin');

  const repeated = await service.initialize({
    setupToken, companyName: '重复企业', adminName: '管理员', adminAccount: 'admin2',
    adminEmail: 'admin2@example.com', adminPhone: '', adminPassword: 'Strong-password-2026',
    organizationTemplate: 'minimal', includeDemoData: false,
  });
  assert.equal(repeated.code, 409);

  if (process.env.QA_INCLUDE_DEMO === 'true') {
    assert.ok(await prisma.leadRecord.count() > 0);
    assert.ok(await prisma.businessRecord.count() > 0);
  } else {
    assert.equal(await prisma.leadRecord.count(), 0);
    assert.equal(await prisma.businessRecord.count(), 0);
  }
  console.log('fresh database system setup QA passed');
} finally {
  await prisma.$disconnect();
}
