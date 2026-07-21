import assert from 'node:assert/strict';
import { createSystemSetupService, type SystemInstallationRecord, type SystemSetupRepository } from './systemSetupService';

const baseRecord: SystemInstallationRecord = {
  id: 'primary',
  installationId: 'installation-1',
  state: 'UNINITIALIZED',
  setupVersion: 1,
  companyName: null,
  initializedAt: null,
  lastError: null,
};

function createRepository(initial: SystemInstallationRecord = baseRecord) {
  let record = { ...initial };
  let initializeCalls = 0;
  const repository: SystemSetupRepository = {
    resolve: async () => ({ ...record }),
    initialize: async (input) => {
      initializeCalls += 1;
      if (!['UNINITIALIZED', 'FAILED'].includes(record.state)) {
        throw Object.assign(new Error('系统已经初始化'), { statusCode: 409 });
      }
      record = {
        ...record,
        state: 'ACTIVE',
        companyName: input.companyName,
        initializedAt: new Date('2026-07-21T10:00:00.000Z'),
        lastError: null,
      };
      return { ...record };
    },
  };
  return { repository, initializeCalls: () => initializeCalls };
}

const fresh = createRepository();
const service = createSystemSetupService({
  repository: fresh.repository,
  setupToken: 'one-time-system-setup-token-123456',
});

const status = await service.status();
assert.equal(status.code, 0);
assert.equal(status.data?.state, 'UNINITIALIZED');
assert.equal(status.data?.initialized, false);
assert.equal(status.data?.setupAvailable, true);

for (const state of ['INITIALIZING', 'RESETTING'] as const) {
  const maintenance = createRepository({ ...baseRecord, state });
  const maintenanceStatus = await createSystemSetupService({
    repository: maintenance.repository,
    setupToken: 'one-time-system-setup-token-123456',
  }).status();
  assert.equal(maintenanceStatus.data?.setupAvailable, false, `${state} 状态不得允许重复初始化`);
}

const wrongToken = await service.initialize({
  setupToken: 'wrong-token',
  companyName: '新企业',
  adminName: '系统管理员',
  adminAccount: 'admin',
  adminEmail: 'admin@example.com',
  adminPhone: '13800000000',
  adminPassword: 'Strong-password-2026',
  organizationTemplate: 'minimal',
  includeDemoData: false,
});
assert.equal(wrongToken.code, 401);
assert.equal(fresh.initializeCalls(), 0, '错误初始化码不能触发任何写入');

const initialized = await service.initialize({
  setupToken: 'one-time-system-setup-token-123456',
  companyName: ' 新企业 ',
  adminName: ' 管理员 ',
  adminAccount: ' Admin ',
  adminEmail: 'ADMIN@example.com',
  adminPhone: '13800000000',
  adminPassword: 'Strong-password-2026',
  organizationTemplate: 'recommended',
  includeDemoData: false,
});
assert.equal(initialized.code, 0);
assert.equal(initialized.data?.state, 'ACTIVE');
assert.equal(initialized.data?.companyName, '新企业');
assert.equal(initialized.data?.initialized, true);
assert.equal('setupToken' in (initialized.data as object), false, '状态响应不得泄露初始化码');

const repeated = await service.initialize({
  setupToken: 'one-time-system-setup-token-123456',
  companyName: '另一家企业',
  adminName: '管理员',
  adminAccount: 'admin2',
  adminEmail: 'admin2@example.com',
  adminPhone: '13900000000',
  adminPassword: 'Strong-password-2026',
  organizationTemplate: 'minimal',
  includeDemoData: false,
});
assert.equal(repeated.code, 409);
assert.equal(fresh.initializeCalls(), 1, '初始化完成后必须永久关闭重复入口');

const legacy = createRepository({
  ...baseRecord,
  state: 'ACTIVE',
  companyName: '福建极享信息科技有限公司',
  initializedAt: new Date('2026-07-01T00:00:00.000Z'),
});
const legacyStatus = await createSystemSetupService({
  repository: legacy.repository,
  setupToken: '',
}).status();
assert.equal(legacyStatus.data?.state, 'ACTIVE');
assert.equal(legacyStatus.data?.initialized, true);
assert.equal(legacyStatus.data?.setupAvailable, false);

let capturedInternalError: unknown;
const failedStatus = await createSystemSetupService({
  repository: {
    resolve: async () => { throw new Error('SQL table system_installations is unavailable'); },
    initialize: async () => baseRecord,
  },
  setupToken: 'one-time-system-setup-token-123456',
  onError: (error) => { capturedInternalError = error; },
}).status();
assert.equal(failedStatus.code, 500);
assert.equal(failedStatus.message, '系统初始化失败');
assert.match(String(capturedInternalError), /system_installations/);

console.log('system setup service tests passed');
