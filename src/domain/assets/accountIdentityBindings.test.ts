import assert from 'node:assert/strict';
import {
  findIdentityAccountForProvider,
  normalizeIdentityAccountIds,
  validateIdentityAccountIds,
} from './accountIdentityBindings';
import type { AssetInternetAccount } from '../../types/asset';

const account = (
  id: string,
  platform: string,
  identityAccountIds: string[] = [],
  overrides: Partial<AssetInternetAccount> = {},
) => ({
  id,
  platform,
  accountName: id,
  identityAccountIds,
  accountStatus: '使用中',
  controlStatus: '已掌控',
  ...overrides,
} as AssetInternetAccount);

const apple = account('apple-1', 'Apple ID');
const google = account('google-1', 'Google账号');
const tiktok = account('tiktok-1', 'TikTok');
const rows = [apple, google, tiktok];

assert.deepEqual(normalizeIdentityAccountIds([' apple-1 ', 'google-1', 'apple-1', '']), ['apple-1', 'google-1']);
assert.equal(validateIdentityAccountIds({ sourceAccountId: 'tiktok-1', identityAccountIds: ['apple-1', 'google-1'], accounts: rows }), null);
assert.equal(findIdentityAccountForProvider(tiktok, rows, 'Apple ID'), undefined);
assert.equal(findIdentityAccountForProvider({ ...tiktok, identityAccountIds: ['apple-1'] }, rows, 'Apple ID')?.id, 'apple-1');

assert.match(validateIdentityAccountIds({ sourceAccountId: 'tiktok-1', identityAccountIds: ['tiktok-1'], accounts: rows }) || '', /自己/);
assert.match(validateIdentityAccountIds({ sourceAccountId: 'tiktok-1', identityAccountIds: ['missing'], accounts: rows }) || '', /不存在/);
assert.match(validateIdentityAccountIds({ sourceAccountId: 'tiktok-1', identityAccountIds: ['tiktok-1'], accounts: [apple, google, account('tiktok-1', 'Apple ID')] }) || '', /自己/);
assert.match(validateIdentityAccountIds({ sourceAccountId: 'tiktok-1', identityAccountIds: ['apple-1', 'apple-2'], accounts: [...rows, account('apple-2', 'Apple ID')] }) || '', /只能绑定一个 Apple ID/);
assert.match(validateIdentityAccountIds({ sourceAccountId: 'apple-source', identityAccountIds: ['apple-1'], accounts: [...rows, account('apple-source', 'Apple ID')] }) || '', /同类型/);
assert.match(validateIdentityAccountIds({ sourceAccountId: 'tiktok-1', identityAccountIds: ['bad-provider'], accounts: [...rows, account('bad-provider', 'LINE')] }) || '', /Apple ID 或 Google账号/);
assert.match(validateIdentityAccountIds({ sourceAccountId: 'tiktok-1', identityAccountIds: ['apple-disabled'], accounts: [...rows, account('apple-disabled', 'Apple ID', [], { accountStatus: '已注销' })] }) || '', /不可用/);
assert.match(validateIdentityAccountIds({ sourceAccountId: 'tiktok-1', identityAccountIds: ['apple-transfer'], accounts: [...rows, account('apple-transfer', 'Apple ID', [], { controlStatus: '待交接' })] }) || '', /未掌控/);

const cyclicApple = account('apple-cycle', 'Apple ID', ['tiktok-cycle']);
const cyclicTikTok = account('tiktok-cycle', 'TikTok');
assert.match(validateIdentityAccountIds({
  sourceAccountId: cyclicTikTok.id,
  identityAccountIds: [cyclicApple.id],
  accounts: [cyclicApple, cyclicTikTok],
}) || '', /循环/);
