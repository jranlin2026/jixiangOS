import assert from 'node:assert/strict';
import {
  createPasswordSalt,
  hashPassword,
  verifyPassword,
} from './auth';

const salt = createPasswordSalt('admin');
const hash = hashPassword('StrongPassword123!', salt);

assert.match(salt, /^\$2[aby]\$/);
assert.match(hash, /^\$2[aby]\$/);
assert.equal(verifyPassword('StrongPassword123!', salt, hash), true);
assert.equal(verifyPassword('wrong-password', salt, hash), false);

const legacySalt = 'aaos-admin-salt';
const legacyHash = 'mock-efb165b6';
assert.equal(verifyPassword('Admin@123456', legacySalt, legacyHash), true);
assert.equal(verifyPassword('wrong-password', legacySalt, legacyHash), false);
