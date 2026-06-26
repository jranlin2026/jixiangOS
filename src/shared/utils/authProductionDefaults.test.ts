import assert from 'node:assert/strict';
import { getDefaultAdminPassword, getDefaultUserPassword } from './auth';

const originalNodeEnv = process.env.NODE_ENV;
const originalAdminPassword = process.env.JIXIANG_DEFAULT_ADMIN_PASSWORD;
const originalUserPassword = process.env.JIXIANG_DEFAULT_USER_PASSWORD;

try {
  process.env.NODE_ENV = 'production';
  delete process.env.JIXIANG_DEFAULT_ADMIN_PASSWORD;
  delete process.env.JIXIANG_DEFAULT_USER_PASSWORD;

  assert.throws(() => getDefaultAdminPassword(), /JIXIANG_DEFAULT_ADMIN_PASSWORD/);
  assert.throws(() => getDefaultUserPassword(), /JIXIANG_DEFAULT_USER_PASSWORD/);

  process.env.JIXIANG_DEFAULT_ADMIN_PASSWORD = 'StrongAdminPassword!';
  process.env.JIXIANG_DEFAULT_USER_PASSWORD = 'StrongUserPassword!';

  assert.equal(getDefaultAdminPassword(), 'StrongAdminPassword!');
  assert.equal(getDefaultUserPassword(), 'StrongUserPassword!');
} finally {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }

  if (originalAdminPassword === undefined) {
    delete process.env.JIXIANG_DEFAULT_ADMIN_PASSWORD;
  } else {
    process.env.JIXIANG_DEFAULT_ADMIN_PASSWORD = originalAdminPassword;
  }

  if (originalUserPassword === undefined) {
    delete process.env.JIXIANG_DEFAULT_USER_PASSWORD;
  } else {
    process.env.JIXIANG_DEFAULT_USER_PASSWORD = originalUserPassword;
  }
}
