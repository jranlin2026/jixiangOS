import assert from 'node:assert/strict';
import { createBrowserScriptLibraryService, DEFAULT_SCRIPT_LIBRARY } from './scriptLibraryService';
import { STORAGE_KEYS } from '../../../src/shared/utils/constants';

let row: { key: string; value: any; updatedAt: Date } | null = null;
const historyRows = new Map<string, any>();
let forceConcurrentConflict = false;
const prisma = {
  appStorage: {
    async findUnique() { return row; },
    async create({ data }: any) {
      if (row) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
      row = { ...data, updatedAt: new Date() };
      return row;
    },
    async updateMany({ where, data }: any) {
      if (forceConcurrentConflict) return { count: 0 };
      if (!row || row.key !== where.key || row.value.revision !== where.value.equals) return { count: 0 };
      row = { ...row, ...data, updatedAt: new Date() };
      return { count: 1 };
    },
    async upsert({ where, create, update }: any) {
      historyRows.set(where.key, historyRows.has(where.key) ? update.value : create.value);
      return { key: where.key, value: historyRows.get(where.key), updatedAt: new Date() };
    },
  },
} as any;

const agent = {
  id: 'service-1', name: '客服小李', role: '客服',
  permissions: [{ module: 'leads:create', actions: ['write'] }],
} as any;
const admin = {
  id: 'admin-1', name: '系统管理员', role: '超级管理员',
  permissions: [{ module: '全部', actions: ['admin'] }],
} as any;

const service = createBrowserScriptLibraryService(prisma);
const initial = await service.get(agent);
assert.equal(initial.code, 0);
assert.equal(initial.data?.canManage, false);
assert.equal(initial.data?.library.groups[0].name, '下单客户');
assert.equal(row, null, '只读默认配置不能产生数据库写入');

const denied = await service.update(DEFAULT_SCRIPT_LIBRARY, agent);
assert.equal(denied.code, 403);

const saved = await service.update({
  ...DEFAULT_SCRIPT_LIBRARY,
  groups: [{
    ...DEFAULT_SCRIPT_LIBRARY.groups[0],
    name: '成交客户',
  }],
}, admin);
assert.equal(saved.code, 0);
assert.equal(saved.data?.canManage, true);
assert.equal(saved.data?.library.revision, 2);
assert.equal(saved.data?.library.groups[0].name, '成交客户');
assert.deepEqual(saved.data?.library.updatedBy, { id: 'admin-1', name: '系统管理员' });
assert.equal(historyRows.get(`${STORAGE_KEYS.BROWSER_EMPLOYEE_SCRIPT_LIBRARY_HISTORY_PREFIX}1`)?.revision, 1);

const stale = await service.update(DEFAULT_SCRIPT_LIBRARY, admin);
assert.equal(stale.code, 409);

forceConcurrentConflict = true;
const concurrent = await service.update(saved.data!.library, admin);
forceConcurrentConflict = false;
assert.equal(concurrent.code, 409, '条件更新失败时必须拒绝并发覆盖');

const duplicateId = await service.update({
  ...saved.data!.library,
  groups: [{
    ...saved.data!.library.groups[0],
    scripts: [
      saved.data!.library.groups[0].scripts[0],
      { ...saved.data!.library.groups[0].scripts[1], id: saved.data!.library.groups[0].scripts[0].id },
    ],
  }],
}, admin);
assert.equal(duplicateId.code, 400);
assert.match(duplicateId.message, /话术ID重复/);

const invalidContactState = await service.update({
  ...saved.data!.library,
  groups: [{
    ...saved.data!.library.groups[0],
    scripts: [{
      ...saved.data!.library.groups[0].scripts[0],
      match: { orderStatuses: [], productKeywords: [], contactState: 'SOMETIMES' },
    }],
  }],
}, admin);
assert.equal(invalidContactState.code, 400);
assert.match(invalidContactState.message, /联系方式状态/);

const invalidEnabled = await service.update({
  ...saved.data!.library,
  groups: [{ ...saved.data!.library.groups[0], enabled: 'false' }],
}, admin);
assert.equal(invalidEnabled.code, 400);
assert.match(invalidEnabled.message, /启用状态/);

const reread = await service.get(admin);
assert.equal(reread.data?.library.revision, 2);
assert.equal(reread.data?.library.groups[0].name, '成交客户');

const normalizedConditions = await service.update({
  ...reread.data!.library,
  groups: [{
    ...reread.data!.library.groups[0],
    scripts: [{
      ...reread.data!.library.groups[0].scripts[0],
      match: { orderStatuses: ['已付款', '已付款'], productKeywords: ['IP口播', 'ip口播'], contactState: 'ANY' },
    }],
  }],
}, admin);
assert.equal(normalizedConditions.code, 0);
assert.deepEqual(normalizedConditions.data?.library.groups[0].scripts[0].match.productKeywords, ['IP口播']);

console.log('browser script library service: ok');
