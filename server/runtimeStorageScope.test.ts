import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');
const start = source.indexOf('const runtimeStorageKeys = [');
const end = source.indexOf('];', start);

assert.ok(start >= 0 && end > start, 'runtime storage key list must remain explicit');

const runtimeScope = source.slice(start, end);
const heavyKeys = [
  'LEADS',
  'ORDERS',
  'ORDER_APPLICATIONS',
  'DELIVERIES',
  'COMMISSIONS',
  'COMMISSION_OPERATION_LOGS',
  'COMMISSION_SETTLEMENT_BATCHES',
  'REFUNDS',
  'RECOVERY_ORDERS',
  'FINANCE',
  'ASSET_DEVICES',
  'ASSET_PHONE_NUMBERS',
  'ASSET_INTERNET_ACCOUNTS',
  'ASSET_RISKS',
  'ASSET_OPERATION_LOGS',
  'ASSET_OFFBOARDING_TASKS',
  'ASSET_MATRIX_PUBLISH_TASKS',
];

for (const key of heavyKeys) {
  assert.doesNotMatch(
    runtimeScope,
    new RegExp(`STORAGE_KEYS\\.${key}\\b`),
    `runtime hydration must not include heavy domain ${key}`,
  );
}

assert.match(runtimeScope, /STORAGE_KEYS\.PRODUCT_LEVELS\b/);
assert.match(runtimeScope, /STORAGE_KEYS\.ORDER_TYPE_CONFIGS\b/);
