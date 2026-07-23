import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../src/shared/utils/constants';
import {
  RESET_APP_STORAGE_KEYS,
  RESET_BUSINESS_DOMAINS,
  assertLocalResetTarget,
} from './reset-business-test-data';

assert.deepEqual(assertLocalResetTarget('mysql://user:password@127.0.0.1:3306/jixiang_os'), {
  host: '127.0.0.1', database: 'jixiang_os',
});
assert.throws(
  () => assertLocalResetTarget('mysql://user:password@db.example.com:3306/jixiang_os'),
  /REQUIRES_LOOPBACK_DATABASE/,
);
assert.equal(RESET_BUSINESS_DOMAINS.includes(STORAGE_KEYS.CUSTOMERS), true);
assert.equal(RESET_BUSINESS_DOMAINS.includes(STORAGE_KEYS.ORDERS), true);
assert.equal(RESET_BUSINESS_DOMAINS.includes(STORAGE_KEYS.DELIVERIES), true);
assert.equal(RESET_BUSINESS_DOMAINS.includes(STORAGE_KEYS.FINANCE), true, '收支流水必须纳入清理');
assert.equal(RESET_APP_STORAGE_KEYS.includes(STORAGE_KEYS.FINANCE), true, '收支流水浏览器缓存源必须归零');
assert.equal(RESET_APP_STORAGE_KEYS.includes(STORAGE_KEYS.ECOMMERCE_SETTLEMENT_RECORDS), true);
assert.equal(RESET_BUSINESS_DOMAINS.includes(STORAGE_KEYS.PRODUCTS as any), false, '产品配置必须保留');
assert.equal(RESET_APP_STORAGE_KEYS.includes(STORAGE_KEYS.USERS as any), false, '账号必须保留');

console.log('business test data reset safety tests passed');
