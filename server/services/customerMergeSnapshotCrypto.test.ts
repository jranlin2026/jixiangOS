import assert from 'node:assert/strict';
import {
  createCustomerMergeSnapshotKeyringFromEnv,
  openMergeSnapshot,
  sealMergeSnapshot,
} from './customerMergeSnapshotCrypto';

const key1 = Buffer.alloc(32, 11).toString('base64');
const key2 = Buffer.alloc(32, 22).toString('base64');
const payload = {
  customers: [{ id: 'c-main', phone: '13800138000' }, { id: 'c-secondary', wechat: 'wx-2' }],
  identities: [{ id: 'identity-1', canonicalCustomerId: 'c-secondary' }],
};

const firstKeyring = createCustomerMergeSnapshotKeyringFromEnv({
  CUSTOMER_MERGE_SNAPSHOT_ACTIVE_KEY_VERSION: '1',
  CUSTOMER_MERGE_SNAPSHOT_KEYS_JSON: JSON.stringify({ 1: key1 }),
});
const sealed = sealMergeSnapshot(payload, firstKeyring);
assert.equal(sealed.keyVersion, 1);
assert.deepEqual(openMergeSnapshot(sealed.value, sealed.keyVersion, firstKeyring), payload);

const rotatedKeyring = createCustomerMergeSnapshotKeyringFromEnv({
  CUSTOMER_MERGE_SNAPSHOT_ACTIVE_KEY_VERSION: '2',
  CUSTOMER_MERGE_SNAPSHOT_KEYS_JSON: JSON.stringify({ 1: key1, 2: key2 }),
});
assert.deepEqual(openMergeSnapshot(sealed.value, 1, rotatedKeyring), payload, '轮换后必须仍可读取旧版本快照');
assert.equal(sealMergeSnapshot(payload, rotatedKeyring).keyVersion, 2, '新快照必须使用当前活动版本');

const tampered = `${sealed.value.slice(0, -2)}AA`;
assert.throws(() => openMergeSnapshot(tampered, 1, firstKeyring), /MERGE_SNAPSHOT_AUTHENTICATION_FAILED/);
assert.throws(() => openMergeSnapshot(sealed.value, 2, rotatedKeyring), /MERGE_SNAPSHOT_AUTHENTICATION_FAILED/);
assert.throws(() => openMergeSnapshot(sealed.value, 9, rotatedKeyring), /MERGE_SNAPSHOT_KEY_VERSION_UNKNOWN:9/);
assert.throws(() => createCustomerMergeSnapshotKeyringFromEnv({
  CUSTOMER_MERGE_SNAPSHOT_ACTIVE_KEY_VERSION: '1',
  CUSTOMER_MERGE_SNAPSHOT_KEYS_JSON: JSON.stringify({ 1: Buffer.alloc(31).toString('base64') }),
}), /exactly 32 bytes/);

console.log('customer merge snapshot crypto: ok');
