import assert from 'node:assert/strict';
import path from 'node:path';
import {
  getApiJsonBodyLimit,
  getApiListenHost,
  getAllowedCorsOrigins,
  getEnablementPrivateStorageDir,
  parseCorsOrigins,
  validateRuntimeConfig,
} from './runtime';

assert.deepEqual(parseCorsOrigins({ CORS_ORIGINS: 'https://crm.example.com, https://ops.example.com' }), [
  'https://crm.example.com',
  'https://ops.example.com',
]);

assert.ok(getAllowedCorsOrigins({ NODE_ENV: 'development' }).includes('http://127.0.0.1:3000'));
assert.equal(getApiListenHost({}), '127.0.0.1');
assert.equal(getApiJsonBodyLimit({}), '50mb');
assert.equal(getApiJsonBodyLimit({ API_JSON_BODY_LIMIT: '100mb' }), '100mb');
assert.equal(getEnablementPrivateStorageDir({ ENABLEMENT_PRIVATE_STORAGE_DIR: '/tmp/enablement' }), '/tmp/enablement');
assert.ok(getEnablementPrivateStorageDir({}).endsWith('private_uploads/enablement'));

const publicUploadRoot = path.resolve('uploads');
assert.throws(
  () => getEnablementPrivateStorageDir({ ENABLEMENT_PRIVATE_STORAGE_DIR: 'uploads' }, publicUploadRoot),
  /public uploads/i,
);
assert.throws(
  () => getEnablementPrivateStorageDir({ ENABLEMENT_PRIVATE_STORAGE_DIR: 'uploads/enablement' }, publicUploadRoot),
  /public uploads/i,
);
assert.equal(
  getEnablementPrivateStorageDir({ ENABLEMENT_PRIVATE_STORAGE_DIR: 'private_uploads/enablement' }, publicUploadRoot),
  path.resolve('private_uploads/enablement'),
);

assert.throws(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:StrongDatabasePassword!@127.0.0.1:3306/db',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'Admin@123456',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
  CORS_ORIGINS: 'https://crm.jixiang-ai.com',
}), /JIXIANG_DEFAULT_ADMIN_PASSWORD/);

assert.throws(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:StrongDatabasePassword!@127.0.0.1:3306/db',
  AI_PROXY_HOST: '127.0.0.1',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
  CORS_ORIGINS: 'https://crm.jixiang-ai.com',
}), /CONTACT_IDENTITY_HMAC_KEY/);

assert.throws(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:StrongDatabasePassword!@127.0.0.1:3306/db',
  AI_PROXY_HOST: '127.0.0.1',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
  CORS_ORIGINS: 'https://crm.jixiang-ai.com',
  CONTACT_IDENTITY_HMAC_KEY: Buffer.alloc(31, 1).toString('base64'),
  CONTACT_IDENTITY_HMAC_KEY_VERSION: '1',
  CONTACT_IDENTITY_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
  CONTACT_IDENTITY_ENCRYPTION_KEY_VERSION: '1',
}), /at least 32 bytes/);

assert.throws(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:StrongDatabasePassword!@127.0.0.1:3306/db',
  AI_PROXY_HOST: '127.0.0.1',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
  CORS_ORIGINS: 'https://crm.jixiang-ai.com',
  CONTACT_IDENTITY_HMAC_KEY: Buffer.alloc(32, 1).toString('base64'),
  CONTACT_IDENTITY_HMAC_KEY_VERSION: '1',
  CONTACT_IDENTITY_ENCRYPTION_KEY_VERSION: '1',
}), /CONTACT_IDENTITY_ENCRYPTION_KEY/);

assert.throws(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:StrongDatabasePassword!@127.0.0.1:3306/db',
  AI_PROXY_HOST: '127.0.0.1',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
  CORS_ORIGINS: 'https://crm.jixiang-ai.com',
  CONTACT_IDENTITY_HMAC_KEY: Buffer.alloc(32, 1).toString('base64'),
  CONTACT_IDENTITY_HMAC_KEY_VERSION: '2',
  CONTACT_IDENTITY_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
  CONTACT_IDENTITY_ENCRYPTION_KEY_VERSION: '1',
}), /pinned to 1/);

assert.throws(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:StrongDatabasePassword!@127.0.0.1:3306/db',
  AI_PROXY_HOST: '127.0.0.1',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
  CORS_ORIGINS: 'https://crm.jixiang-ai.com',
  CONTACT_IDENTITY_HMAC_KEY: Buffer.alloc(32, 1).toString('base64'),
  CONTACT_IDENTITY_HMAC_KEY_VERSION: '1',
  CONTACT_IDENTITY_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
  CONTACT_IDENTITY_ENCRYPTION_KEY_VERSION: '1',
}), /CUSTOMER_PERMISSION_MIGRATION_SIGNING_KEY_REQUIRED/);

assert.throws(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:StrongDatabasePassword!@127.0.0.1:3306/db',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
}), /CORS_ORIGINS/);

assert.throws(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:StrongDatabasePassword!@127.0.0.1:3306/db',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
  CORS_ORIGINS: 'http://crm.example.com',
}), /insecure/);

assert.throws(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:REPLACE_WITH_STRONG_PASSWORD@127.0.0.1:3306/db',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
  CORS_ORIGINS: 'https://crm.jixiang-ai.com',
}), /DATABASE_URL/);

assert.throws(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:short@127.0.0.1:3306/db',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
  CORS_ORIGINS: 'https://crm.jixiang-ai.com',
}), /DATABASE_URL password/);

assert.throws(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:StrongDatabasePassword!@127.0.0.1:3306/db',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
  CORS_ORIGINS: 'https://crm.example.com',
}), /example domain/);

assert.throws(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:StrongDatabasePassword!@127.0.0.1:3306/db',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
  CORS_ORIGINS: 'https://crm.jixiang-ai.com',
  JIXIANG_REMEMBER_SESSION_DAYS: '365',
}), /JIXIANG_REMEMBER_SESSION_DAYS/);

assert.throws(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:StrongDatabasePassword!@127.0.0.1:3306/db',
  AI_PROXY_HOST: '0.0.0.0',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
  CORS_ORIGINS: 'https://crm.jixiang-ai.com',
}), /AI_PROXY_HOST/);

assert.throws(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:StrongDatabasePassword!@127.0.0.1:3306/db',
  AI_PROXY_HOST: '127.0.0.1',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
  CORS_ORIGINS: 'https://crm.jixiang-ai.com',
  JIXIANG_SESSION_TTL_HOURS: '12',
  JIXIANG_REMEMBER_SESSION_DAYS: '30',
  CONTACT_IDENTITY_HMAC_KEY: Buffer.alloc(32, 1).toString('base64'),
  CONTACT_IDENTITY_HMAC_KEY_VERSION: '1',
  CONTACT_IDENTITY_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
  CONTACT_IDENTITY_ENCRYPTION_KEY_VERSION: '1',
  CUSTOMER_PERMISSION_MIGRATION_SIGNING_KEY: 'StrongPermissionMigrationSigningKey-123',
}), /CUSTOMER_MERGE_SNAPSHOT_ACTIVE_KEY_VERSION/);

assert.doesNotThrow(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:StrongDatabasePassword!@127.0.0.1:3306/db',
  AI_PROXY_HOST: '127.0.0.1',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
  CORS_ORIGINS: 'https://crm.jixiang-ai.com',
  JIXIANG_SESSION_TTL_HOURS: '12',
  JIXIANG_REMEMBER_SESSION_DAYS: '30',
  CONTACT_IDENTITY_HMAC_KEY: Buffer.alloc(32, 1).toString('base64'),
  CONTACT_IDENTITY_HMAC_KEY_VERSION: '1',
  CONTACT_IDENTITY_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
  CONTACT_IDENTITY_ENCRYPTION_KEY_VERSION: '1',
  CUSTOMER_PERMISSION_MIGRATION_SIGNING_KEY: 'StrongPermissionMigrationSigningKey-123',
  CUSTOMER_MERGE_SNAPSHOT_ACTIVE_KEY_VERSION: '1',
  CUSTOMER_MERGE_SNAPSHOT_KEYS_JSON: JSON.stringify({ 1: Buffer.alloc(32, 3).toString('base64') }),
}));
