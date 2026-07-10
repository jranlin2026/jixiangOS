import { DEFAULT_ADMIN_PASSWORD, DEFAULT_USER_PASSWORD } from '../../src/shared/utils/auth';
import path from 'node:path';

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const LOCALHOST_LISTEN_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const EXAMPLE_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*example\.com(?::\d+)?$/i;
const PLACEHOLDER_VALUES = new Set([
  'REPLACE_WITH_STRONG_PASSWORD',
  'CHANGE_ME',
  'CHANGEME',
  'YOUR_PASSWORD',
  'STRONG_PASSWORD',
]);

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

export function getApiListenHost(env: NodeJS.ProcessEnv = process.env): string {
  return readEnv(env, 'AI_PROXY_HOST') || '127.0.0.1';
}

export function getApiJsonBodyLimit(env: NodeJS.ProcessEnv = process.env): string {
  return readEnv(env, 'API_JSON_BODY_LIMIT') || '50mb';
}

/** Location for original enablement Markdown. This directory is never public. */
export function getEnablementPrivateStorageDir(
  env: NodeJS.ProcessEnv = process.env,
  publicUploadRoot = path.resolve('uploads'),
): string {
  const configured = readEnv(env, 'ENABLEMENT_PRIVATE_STORAGE_DIR');
  const privateStorageDir = path.resolve(configured || 'private_uploads/enablement');
  const resolvedPublicRoot = path.resolve(publicUploadRoot);
  const relativeToPublicRoot = path.relative(resolvedPublicRoot, privateStorageDir);
  const isPublicOrNested = relativeToPublicRoot === '' || (
    relativeToPublicRoot !== '..'
    && !relativeToPublicRoot.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativeToPublicRoot)
  );
  if (isPublicOrNested) {
    throw new Error('ENABLEMENT_PRIVATE_STORAGE_DIR must be outside the public uploads directory.');
  }
  return privateStorageDir;
}

function assertRequired(env: NodeJS.ProcessEnv, name: string): void {
  if (!readEnv(env, name)) {
    throw new Error(`${name} must be configured before running jixiangOS in production.`);
  }
}

function assertNotPlaceholder(value: string, name: string): void {
  const normalized = value.trim().toUpperCase();
  if (PLACEHOLDER_VALUES.has(normalized) || normalized.includes('REPLACE_WITH')) {
    throw new Error(`${name} still contains a placeholder value.`);
  }
}

function assertStrongPassword(env: NodeJS.ProcessEnv, name: string, unsafeDefault: string): void {
  const password = readEnv(env, name);
  assertRequired(env, name);
  assertNotPlaceholder(password, name);
  if (password.length < 12 || password === unsafeDefault) {
    throw new Error(`${name} must be at least 12 characters and cannot use the local development default.`);
  }
}

function assertDatabaseUrl(env: NodeJS.ProcessEnv): void {
  const rawUrl = readEnv(env, 'DATABASE_URL');
  assertRequired(env, 'DATABASE_URL');
  assertNotPlaceholder(rawUrl, 'DATABASE_URL');

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid MySQL connection URL.');
  }

  if (!['mysql:', 'mysql2:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use the mysql:// protocol in production.');
  }

  const databasePassword = decodeURIComponent(parsed.password || '');
  assertNotPlaceholder(databasePassword, 'DATABASE_URL password');
  if (databasePassword.length < 12) {
    throw new Error('DATABASE_URL password must be at least 12 characters in production.');
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
  const example = origins.find((origin) => EXAMPLE_ORIGIN.test(origin));
  if (example) {
    throw new Error(`CORS_ORIGINS still contains the example domain: ${example}`);
  }
}

function assertIntegerRange(env: NodeJS.ProcessEnv, name: string, min: number, max: number): void {
  const value = readEnv(env, name);
  if (!value) return;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
}

export function validateRuntimeConfig(env: NodeJS.ProcessEnv = process.env): void {
  const port = Number(readEnv(env, 'AI_PROXY_PORT') || 3001);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('AI_PROXY_PORT must be a valid TCP port.');
  }

  if (!isProductionRuntime(env)) return;

  assertDatabaseUrl(env);
  assertStrongPassword(env, 'JIXIANG_DEFAULT_ADMIN_PASSWORD', DEFAULT_ADMIN_PASSWORD);
  assertStrongPassword(env, 'JIXIANG_DEFAULT_USER_PASSWORD', DEFAULT_USER_PASSWORD);
  assertProductionOrigins(parseCorsOrigins(env));
  if (!LOCALHOST_LISTEN_HOSTS.has(getApiListenHost(env))) {
    throw new Error('AI_PROXY_HOST must bind to localhost in production, for example 127.0.0.1.');
  }
  assertIntegerRange(env, 'JIXIANG_SESSION_TTL_HOURS', 1, 24);
  assertIntegerRange(env, 'JIXIANG_REMEMBER_SESSION_DAYS', 1, 90);
}
