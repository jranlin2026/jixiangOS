import dotenv from 'dotenv';
import { isAbsolute } from 'node:path';
import { validateRuntimeConfig } from '../../server/config/runtime';

dotenv.config({ quiet: true });

const errors: string[] = [];

function envValue(name: string): string {
  return String(process.env[name] || '').trim();
}

function requireEnv(name: string): string {
  const value = envValue(name);
  if (!value) {
    errors.push(`${name} must be configured for production deployment.`);
  }
  return value;
}

function isPlaceholder(value: string): boolean {
  const normalized = value.toUpperCase();
  return normalized.includes('REPLACE_WITH') || normalized === 'CHANGE_ME' || normalized === 'CHANGEME';
}

function checkProductionRuntime(): void {
  try {
    validateRuntimeConfig(process.env);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

function checkBackupConfig(): void {
  const backupEnabled = envValue('JIXIANG_DEPLOY_BACKUP') !== 'false';
  if (!backupEnabled) return;

  const password = requireEnv('JIXIANG_MYSQL_PASSWORD');
  if (password && (password.length < 12 || isPlaceholder(password))) {
    errors.push('JIXIANG_MYSQL_PASSWORD must be at least 12 characters and cannot be a placeholder.');
  }

  const backupDir = envValue('JIXIANG_BACKUP_DIR') || '/var/backups/jixiang-os';
  if (!isAbsolute(backupDir)) {
    errors.push('JIXIANG_BACKUP_DIR must be an absolute path.');
  }
}

function checkSmokeConfig(): void {
  const baseUrl = envValue('JIXIANG_SMOKE_BASE_URL');
  if (!baseUrl) return;

  if (!baseUrl.startsWith('https://')) {
    errors.push('JIXIANG_SMOKE_BASE_URL must use HTTPS.');
  }
  if (/example\.com/i.test(baseUrl)) {
    errors.push('JIXIANG_SMOKE_BASE_URL must be changed from the example domain.');
  }
  requireEnv('JIXIANG_SMOKE_PASSWORD');
}

checkProductionRuntime();
checkBackupConfig();
checkSmokeConfig();

if (errors.length) {
  console.error('Production configuration check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Production configuration check passed.');
