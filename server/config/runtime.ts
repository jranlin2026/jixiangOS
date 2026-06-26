import { DEFAULT_ADMIN_PASSWORD, DEFAULT_USER_PASSWORD } from '../../src/shared/utils/auth';

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function readEnv(env: NodeJS.ProcessEnv, name: string): string {
  return String(env[name] || '').trim();
}

export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return readEnv(env, 'NODE_ENV') === 'production';
}

export function parseCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return String(env.CORS_ORIGINS || env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getAllowedCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = parseCorsOrigins(env);
  if (configured.length || isProductionRuntime(env)) return configured;
  return [
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://127.0.0.1:3002',
    'http://localhost:3002',
  ];
}

function assertRequired(env: NodeJS.ProcessEnv, name: string): void {
  if (!readEnv(env, name)) {
    throw new Error(`${name} must be configured before running jixiangOS in production.`);
  }
}

function assertStrongPassword(env: NodeJS.ProcessEnv, name: string, unsafeDefault: string): void {
  const password = readEnv(env, name);
  assertRequired(env, name);
  if (password.length < 12 || password === unsafeDefault) {
    throw new Error(`${name} must be at least 12 characters and cannot use the local development default.`);
  }
}

function assertProductionOrigins(origins: string[]): void {
  if (!origins.length) {
    throw new Error('CORS_ORIGINS must include the production HTTPS origin, for example https://crm.example.com.');
  }
  const insecure = origins.find((origin) => !origin.startsWith('https://') && !LOCALHOST_ORIGIN.test(origin));
  if (insecure) {
    throw new Error(`CORS_ORIGINS contains an insecure production origin: ${insecure}`);
  }
}

export function validateRuntimeConfig(env: NodeJS.ProcessEnv = process.env): void {
  const port = Number(readEnv(env, 'AI_PROXY_PORT') || 3001);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('AI_PROXY_PORT must be a valid TCP port.');
  }

  if (!isProductionRuntime(env)) return;

  assertRequired(env, 'DATABASE_URL');
  assertStrongPassword(env, 'JIXIANG_DEFAULT_ADMIN_PASSWORD', DEFAULT_ADMIN_PASSWORD);
  assertStrongPassword(env, 'JIXIANG_DEFAULT_USER_PASSWORD', DEFAULT_USER_PASSWORD);
  assertProductionOrigins(parseCorsOrigins(env));
}
