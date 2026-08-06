import assert from 'node:assert/strict';
import {
  canonicalizeContactPhones,
  contactPhoneNumbers,
  getContactPhoneError,
  getContactPhoneValuesError,
} from './contactPhones';

const migrated = canonicalizeContactPhones('+86 13800138000');
assert.deepEqual(migrated, [
  { number: '+8613800138000', isPrimary: true, label: '主手机号' },
]);

const normalized = canonicalizeContactPhones('+8613800138000', [
  { number: '13800138000', isPrimary: false, label: '备用手机号' },
  { number: '13900139000', isPrimary: false, label: '备用手机号' },
]);
assert.deepEqual(contactPhoneNumbers(normalized), ['+8613800138000', '+8613900139000']);
assert.equal(getContactPhoneError('+8613800138000', normalized), '');

const switched = canonicalizeContactPhones('+8613900139000', normalized);
assert.deepEqual(switched, [
  { number: '+8613900139000', isPrimary: true, label: '主手机号' },
  { number: '+8613800138000', isPrimary: false, label: '备用手机号' },
]);

assert.match(
  getContactPhoneError('+8613800138000', [
    { number: '+8613800138000', isPrimary: true, label: '主手机号' },
    { number: '+8613800138000', isPrimary: false, label: '备用手机号' },
  ]),
  /不能重复/,
);

assert.match(
  getContactPhoneError('+8613800138000', [
    { number: '+8613800138000', isPrimary: true, label: '主手机号' },
    { number: '+86123', isPrimary: false, label: '备用手机号' },
  ]),
  /备用手机号格式不正确/,
);

assert.match(
  getContactPhoneValuesError('+8613800138000', '13800138000'),
  /不能重复/,
);

console.log('contact phone policy tests passed');
