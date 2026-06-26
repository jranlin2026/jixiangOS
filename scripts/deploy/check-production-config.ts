import dotenv from 'dotenv';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRuntimeConfig } from '../../server/config/runtime';

function envValue(env: NodeJS.ProcessEnv, name: string): string {
  return String(env[name] || '').trim();
}

function requireEnv(env: NodeJS.ProcessEnv, errors: string[], name: string): string {
  const value = envValue(env, name);
  if (!value) {
    errors.push(`${name} must be configured for production deployment.`);
  }
  return value;
}

function isPlaceholder(value: string): boolean {
  const normalized = value.toUpperCase();
  return normalized.includes('REPLACE_WITH') || normalized === 'CHANGE_ME' || normalized === 'CHANGEME';
}

function checkProductionRuntime(env: NodeJS.ProcessEnv, errors: string[]): void {
  if (envValue(env, 'NODE_ENV') !== 'production') {
    errors.push('NODE_ENV must be set to production for cloud deployment.');
  }

  try {
    validateRuntimeConfig(env);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

function checkFrontendConfig(env: NodeJS.ProcessEnv, errors: string[]): void {
  if (envValue(env, 'VITE_USE_BACKEND_API') !== 'true') {
    errors.push('VITE_USE_BACKEND_API must be true for production builds.');
  }

  if (envValue(env, 'VITE_AI_API_BASE') !== '/api') {
    errors.push('VITE_AI_API_BASE must be /api so the frontend uses the Nginx API proxy.');
  }
}

function checkBackupConfig(env: NodeJS.ProcessEnv, errors: string[]): void {
  const backupEnabled = envValue(env, 'JIXIANG_DEPLOY_BACKUP') !== 'false';
  if (!backupEnabled) return;

  const password = requireEnv(env, errors, 'JIXIANG_MYSQL_PASSWORD');
  if (password && (password.length < 12 || isPlaceholder(password))) {
    errors.push('JIXIANG_MYSQL_PASSWORD must be at least 12 characters and cannot be a placeholder.');
  }

  const backupDir = envValue(env, 'JIXIANG_BACKUP_DIR') || '/var/backups/jixiang-os';
  if (!isAbsolute(backupDir)) {
    errors.push('JIXIANG_BACKUP_DIR must be an absolute path.');
  }
}

function checkSmokeConfig(env: NodeJS.ProcessEnv, errors: string[]): void {
  const baseUrl = envValue(env, 'JIXIANG_SMOKE_BASE_URL');
  if (!baseUrl) return;

  if (!baseUrl.startsWith('https://')) {
    errors.push('JIXIANG_SMOKE_BASE_URL must use HTTPS.');
  }
  if (/example\.com/i.test(baseUrl)) {
    errors.push('JIXIANG_SMOKE_BASE_URL must be changed from the example domain.');
  }
  requireEnv(env, errors, 'JIXIANG_SMOKE_PASSWORD');
}

export function collectProductionConfigErrors(env: NodeJS.ProcessEnv = process.env): string[] {
  const errors: string[] = [];

  checkProductionRuntime(env, errors);
  checkFrontendConfig(env, errors);
  checkBackupConfig(env, errors);
  checkSmokeConfig(env, errors);

  return errors;
}

export function runProductionConfigCheck(env: NodeJS.ProcessEnv = process.env): void {
  const errors = collectProductionConfigErrors(env);
  if (errors.length) {
    console.error('Production configuration check failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('Production configuration check passed.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  dotenv.config({ quiet: true });
  runProductionConfigCheck();
}
