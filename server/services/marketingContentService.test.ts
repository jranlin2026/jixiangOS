import assert from 'node:assert/strict';
import { createMarketingContentService } from './marketingContentService';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';

const rows = new Map<string, unknown>();
const prisma = {
  appStorage: {
    findUnique: async ({ where }: any) => rows.has(where.key) ? { key: where.key, value: rows.get(where.key) } : null,
    create: async ({ data }: any) => { rows.set(data.key, data.value); return data; },
    upsert: async ({ where, create, update }: any) => {
      const data = rows.has(where.key) ? { key: where.key, ...update } : create;
      rows.set(where.key, data.value); return data;
    },
  },
};

const actor: AuthenticatedUser = {
  id: 'user-market', name: '市场专员', account: 'market', role: '市场专员', roleId: 'role-market', departmentId: 'dept-market',
  email: '', phone: '', isActive: true, permissions: [
    { module: PERMISSION_KEYS.MARKETING_CONTENT, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.MARKETING_REVIEW, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.MARKETING_GROUPS, actions: ['read', 'write'] },
  ],
};

const service = createMarketingContentService(prisma as any);
const created = await service.createContent({
  title: '8月朋友圈内容包', contentType: 'MOMENTS', platforms: ['微信'], copywriting: '今日朋友圈文案', imageLinks: ['https://example.com/a.jpg'],
}, actor);
assert.equal(created.code, 0);
assert.equal(created.data?.status, 'DRAFT');

const submitted = await service.transitionContent(created.data!.id, 'SUBMIT', '', actor);
assert.equal(submitted.data?.status, 'PENDING_REVIEW');
const approved = await service.transitionContent(created.data!.id, 'APPROVE', '信息准确', actor);
assert.equal(approved.data?.status, 'APPROVED');

const listed = await service.listContents({ status: 'APPROVED', page: 1, pageSize: 10 }, actor);
assert.equal(listed.data?.pagination.total, 1);
assert.equal(listed.data?.items[0].version, 1);

rows.set(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS, [
  { id: 'account-1', platform: '微信' },
  { id: 'account-2', platform: '微信' },
  { id: 'account-douyin', platform: '抖音' },
]);

const group = await service.saveGroup(undefined, {
  name: '全员朋友圈', platform: '微信', tags: ['销售部'], accountIds: ['account-1', 'account-2'],
}, actor);
assert.equal(group.code, 0);
assert.deepEqual((await service.listGroups(actor)).data?.[0].accountIds, ['account-1', 'account-2']);

const mismatchedGroup = await service.saveGroup(undefined, {
  name: '错误分组', platform: '微信', accountIds: ['account-douyin'],
}, actor);
assert.equal(mismatchedGroup.code, 400);
assert.match(mismatchedGroup.message, /平台一致/);

const publisher: AuthenticatedUser = {
  ...actor,
  id: 'user-publisher',
  permissions: [{ module: PERMISSION_KEYS.MARKETING_PUBLISH, actions: ['read', 'write'] }],
};
assert.equal((await service.listContents({ status: 'APPROVED' }, publisher)).code, 0);
assert.equal((await service.listGroups(publisher)).code, 0);
