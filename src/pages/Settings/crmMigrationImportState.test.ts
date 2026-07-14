import assert from 'node:assert/strict';
import {
  canImportCrmMigration,
  getCrmMigrationImportBlockers,
  isCurrentCrmMigrationPrecheck,
  snapshotCrmMigrationFiles,
} from './crmMigrationImportState';

const result = {
  employees: { all: ['吕煜阳'], matched: [], missing: ['吕煜阳'], ambiguous: [], system: [] },
  tags: { all: ['VIP'], matched: [], missing: [], ambiguous: ['VIP'], system: [] },
} as any;

assert.equal(canImportCrmMigration(result), false);
assert.deepEqual(getCrmMigrationImportBlockers(result), [
  '请先创建负责人：吕煜阳',
  '标签名称不唯一：VIP',
]);

const allBlockers = {
  employees: { all: ['刘安慧'], matched: [], missing: [], ambiguous: ['刘安慧'], system: [] },
  tags: { all: ['高意向'], matched: [], missing: ['高意向'], ambiguous: [], system: [] },
} as any;

assert.deepEqual(getCrmMigrationImportBlockers(allBlockers), [
  '负责人姓名不唯一：刘安慧',
  '请先同步标签：高意向',
]);

const safe = {
  employees: { all: ['吕煜阳'], matched: ['吕煜阳'], missing: [], ambiguous: [], system: [] },
  tags: { all: ['VIP'], matched: ['VIP'], missing: [], ambiguous: [], system: [] },
} as any;

assert.equal(canImportCrmMigration(safe), true);
assert.deepEqual(getCrmMigrationImportBlockers(safe), []);

const firstTeamFile = new File(['first'], 'first.xlsx');
const secondTeamFile = new File(['second'], 'second.xlsx');
const firstFiles = { teamCustomers: firstTeamFile };
const firstAttempt = {
  requestId: 1,
  files: snapshotCrmMigrationFiles(firstFiles),
};

assert.equal(isCurrentCrmMigrationPrecheck(firstAttempt, 1, firstFiles), true);
assert.equal(
  isCurrentCrmMigrationPrecheck(firstAttempt, 2, firstFiles),
  false,
  'an older response must not replace a newer precheck response',
);
assert.equal(
  isCurrentCrmMigrationPrecheck(firstAttempt, 1, { teamCustomers: secondTeamFile }),
  false,
  'a response for an old file selection must not replace the current result',
);
