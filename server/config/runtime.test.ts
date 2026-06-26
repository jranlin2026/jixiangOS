import assert from 'node:assert/strict';
import {
  getAllowedCorsOrigins,
  parseCorsOrigins,
  validateRuntimeConfig,
} from './runtime';

assert.deepEqual(parseCorsOrigins({ CORS_ORIGINS: 'https://crm.example.com, https://ops.example.com' }), [
  'https://crm.example.com',
  'https://ops.example.com',
]);

assert.ok(getAllowedCorsOrigins({ NODE_ENV: 'development' }).includes('http://127.0.0.1:3000'));

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

assert.doesNotThrow(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://user:StrongDatabasePassword!@127.0.0.1:3306/db',
  AI_PROXY_PORT: '3001',
  JIXIANG_DEFAULT_ADMIN_PASSWORD: 'StrongAdminPassword!',
  JIXIANG_DEFAULT_USER_PASSWORD: 'StrongUserPassword!',
  CORS_ORIGINS: 'https://crm.jixiang-ai.com',
  JIXIANG_SESSION_TTL_HOURS: '12',
  JIXIANG_REMEMBER_SESSION_DAYS: '30',
}));
