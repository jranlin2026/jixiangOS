import { strict as assert } from 'assert';
import {
  formatPhoneForDisplay,
  normalizePhoneForComparison,
  normalizePhoneForStorage,
  parseStoredPhoneNumber,
  validatePhoneNumber,
} from './phoneNumber';

const cn = validatePhoneNumber('13800000000', 'CN');
assert.equal(cn.valid, true);
assert.equal(cn.normalized, '+8613800000000');

const invalidCn = validatePhoneNumber('12345', 'CN');
assert.equal(invalidCn.valid, false);
assert.equal(invalidCn.message, '手机号格式不正确');

assert.equal(normalizePhoneForStorage('138 0000 0000', 'CN'), '+8613800000000');
assert.equal(normalizePhoneForComparison('+86 13800000000'), '+8613800000000');
assert.equal(normalizePhoneForComparison('13800000000'), '+8613800000000');

assert.deepEqual(parseStoredPhoneNumber('+8613800000000'), {
  countryCode: 'CN',
  nationalNumber: '13800000000',
});
assert.equal(formatPhoneForDisplay('+8613800000000'), '+86 13800000000');
