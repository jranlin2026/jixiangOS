import assert from 'node:assert/strict';
import { createPrismaSystemSetupRepository } from './systemSetupRepository';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';

function createResolvePrisma(options: {
  installation?: any;
  userCount?: number;
  businessRecordCount?: number;
  leadRecordCount?: number;
  initializedMarker?: unknown;
  companyName?: string;
} = {}) {
  let installation = options.installation || null;
  return {
    systemInstallation: {
      findUnique: async () => installation,
      create: async ({ data }: any) => {
        installation = { ...data, createdAt: new Date(), updatedAt: new Date() };
        return installation;
      },
    },
    user: { count: async () => options.userCount || 0 },
    businessRecord: { count: async () => options.businessRecordCount || 0 },
    leadRecord: { count: async () => options.leadRecordCount || 0 },
    appStorage: {
      findUnique: async ({ where }: any) => {
        if (where.key === STORAGE_KEYS.INITIALIZED && options.initializedMarker !== undefined) {
          return { key: where.key, value: options.initializedMarker };
        }
        if (where.key === STORAGE_KEYS.ORGANIZATION_PROFILE && options.companyName) {
          return { key: where.key, value: { companyName: options.companyName } };
        }
        return null;
      },
    },
  } as any;
}

const fresh = createPrismaSystemSetupRepository(createResolvePrisma(), {
  installationId: () => 'fresh-installation',
  now: () => new Date('2026-07-21T00:00:00.000Z'),
});
const freshRecord = await fresh.resolve();
assert.equal(freshRecord.state, 'UNINITIALIZED');
assert.equal(freshRecord.installationId, 'fresh-installation');
assert.equal(freshRecord.companyName, null);

const legacy = createPrismaSystemSetupRepository(createResolvePrisma({
  userCount: 1,
  companyName: '原有企业',
}), {
  installationId: () => 'legacy-installation',
  now: () => new Date('2026-07-21T00:00:00.000Z'),
});
const legacyRecord = await legacy.resolve();
assert.equal(legacyRecord.state, 'ACTIVE', '已有账号的生产库必须自动识别为已初始化');
assert.equal(legacyRecord.companyName, '原有企业');
assert.equal(legacyRecord.initializedAt?.toISOString(), '2026-07-21T00:00:00.000Z');

const markerOnly = createPrismaSystemSetupRepository(createResolvePrisma({ initializedMarker: true }), {
  installationId: () => 'marker-installation',
});
assert.equal((await markerOnly.resolve()).state, 'ACTIVE', '旧版初始化标记必须兼容');

function createInitializationPrisma() {
  let installation: any = {
    id: 'primary', installationId: 'installation-1', state: 'UNINITIALIZED', setupVersion: 1,
    companyName: null, initializedAt: null, lastError: null,
  };
  const users: any[] = [];
  const roles: any[] = [];
  const departments: any[] = [];
  const positions: any[] = [];
  const storage = new Map<string, unknown>();
  const client: any = {
    systemInstallation: {
      findUnique: async () => installation,
      updateMany: async ({ where, data }: any) => {
        if (!where.state.in.includes(installation.state)) return { count: 0 };
        installation = { ...installation, ...data };
        return { count: 1 };
      },
      update: async ({ data }: any) => {
        installation = { ...installation, ...data };
        return installation;
      },
    },
    user: {
      count: async () => users.length,
      create: async ({ data }: any) => {
        users.push(data);
        return data;
      },
    },
    businessRecord: { count: async () => 0 },
    leadRecord: { count: async () => 0 },
    department: { upsert: async ({ create }: any) => departments.push(create) },
    position: { upsert: async ({ create }: any) => positions.push(create) },
    role: { upsert: async ({ create }: any) => roles.push(create) },
    appStorage: {
      findUnique: async ({ where }: any) => storage.has(where.key) ? { key: where.key, value: storage.get(where.key) } : null,
      upsert: async ({ where, create, update }: any) => {
        storage.set(where.key, storage.has(where.key) ? update.value : create.value);
      },
    },
  };
  client.$transaction = async (callback: (tx: any) => Promise<any>) => callback(client);
  return { client, users, roles, departments, positions, storage, installation: () => installation };
}

const initializing = createInitializationPrisma();
const initializationRepository = createPrismaSystemSetupRepository(initializing.client, {
  now: () => new Date('2026-07-21T10:00:00.000Z'),
  userId: () => 'initial-admin-id',
});
const active = await initializationRepository.initialize({
  companyName: '新客户企业',
  adminName: '首位管理员',
  adminAccount: 'admin',
  adminEmail: 'admin@example.com',
  adminPhone: '13800000000',
  adminPassword: 'Strong-password-2026',
  organizationTemplate: 'recommended',
  includeDemoData: false,
});
assert.equal(active.state, 'ACTIVE');
assert.equal(active.companyName, '新客户企业');
assert.equal(initializing.users.length, 1);
assert.equal(initializing.users[0].id, 'initial-admin-id');
assert.notEqual(initializing.users[0].passwordHash, 'Strong-password-2026');
assert.ok(initializing.users[0].passwordSalt);
assert.equal(initializing.users[0].roleId, 'role-super-admin');
assert.ok(initializing.roles.some((role) => role.code === 'super_admin'));
assert.ok(initializing.departments.length > 0);
assert.equal(initializing.storage.get(STORAGE_KEYS.INITIALIZED), true);

await assert.rejects(
  initializationRepository.initialize({
    companyName: '重复企业', adminName: '管理员', adminAccount: 'admin2', adminEmail: 'admin2@example.com',
    adminPhone: '', adminPassword: 'Strong-password-2026', organizationTemplate: 'minimal', includeDemoData: false,
  }),
  (error: any) => error?.statusCode === 409,
  '同一实例只能成功初始化一次',
);

console.log('system setup repository resolve tests passed');
