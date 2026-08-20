import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync('prisma/schema.prisma', 'utf8');
const clientTypes = readFileSync('src/types/enterpriseBrain.ts', 'utf8');
const migration = readFileSync('prisma/migrations/20260820133000_unified_employee_workbench_phase3/migration.sql', 'utf8');
const taskRepository = readFileSync('server/services/enterpriseBrain/prismaTaskRepository.ts', 'utf8');
const assetCommandService = readFileSync('server/services/assetCommandService.ts', 'utf8');
const localTrialSeed = readFileSync('scripts/seed-enterprise-brain-local-trial.ts', 'utf8');

const model = (name: string) => {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`, 'm'));
  assert.ok(match, `${name} model must exist`);
  return match[1];
};

const employeeTask = model('EmployeeTask');
const taskActivity = model('TaskActivity');
const taskEvidence = model('TaskEvidence');

for (const field of [
  /sourceKey\s+String\?\s+@unique\s+@db\.VarChar\(180\)/,
  /taskType\s+String\s+@default\("ACTION"\)\s+@db\.VarChar\(32\)/,
  /priority\s+String\s+@default\("NORMAL"\)\s+@db\.VarChar\(16\)/,
  /businessModule\s+String\s+@default\("GENERAL"\)\s+@db\.VarChar\(40\)/,
  /sourceRoute\s+String\?\s+@db\.VarChar\(500\)/,
  /sourceLabel\s+String\?\s+@db\.VarChar\(120\)/,
  /startedAt\s+DateTime\?/,
  /canceledAt\s+DateTime\?/,
  /canceledById\s+String\?\s+@db\.VarChar\(64\)/,
  /canceledReason\s+String\?\s+@db\.VarChar\(500\)/,
  /collaboratorIds\s+Json\?/,
  /estimatedMinutes\s+Int\?/,
  /qualityScore\s+Int\?/,
  /qualityComment\s+String\?\s+@db\.VarChar\(500\)/,
  /remindedAt\s+DateTime\?/,
  /lastOverdueNotifiedAt\s+DateTime\?/,
  /sourceVersion\s+String\?\s+@db\.VarChar\(80\)/,
  /activities\s+TaskActivity\[\]/,
  /status\s+String\s+@default\("PENDING"\)\s+@db\.VarChar\(24\)/,
  /sourceType\s+String\?\s+@db\.VarChar\(64\)/,
  /sourceId\s+String\?\s+@db\.VarChar\(80\)/,
  /sourceItemId\s+String\?\s+@db\.VarChar\(80\)/,
  /@@unique\(\[templateId, employeeId, workDate\], map: "employee_tasks_template_employee_workDate_key"\)/,
  /@@index\(\[sourceType, sourceId, sourceItemId\], map: "employee_tasks_source_idx"\)/,
]) assert.match(employeeTask, field);

for (const field of [
  /id\s+String\s+@id\s+@db\.VarChar\(64\)/,
  /taskId\s+String\s+@db\.VarChar\(64\)/,
  /action\s+String\s+@db\.VarChar\(40\)/,
  /actorId\s+String\?\s+@db\.VarChar\(64\)/,
  /actorName\s+String\?\s+@db\.VarChar\(100\)/,
  /fromStatus\s+String\?\s+@db\.VarChar\(24\)/,
  /toStatus\s+String\?\s+@db\.VarChar\(24\)/,
  /comment\s+String\?\s+@db\.VarChar\(500\)/,
  /metadata\s+Json\?/,
  /createdAt\s+DateTime\s+@default\(now\(\)\)/,
  /task\s+EmployeeTask\s+@relation\(fields: \[taskId\], references: \[id\], onDelete: Cascade\)/,
  /@@index\(\[taskId, createdAt\]\)/,
  /@@index\(\[actorId, createdAt\]\)/,
]) assert.match(taskActivity, field);

assert.match(taskEvidence, /task\s+EmployeeTask\s+@relation\(fields: \[taskId\], references: \[id\], onDelete: Cascade\)/);
assert.match(clientTypes, /sourceKey\?: string \| null/);
assert.match(clientTypes, /status: 'PENDING' \| 'IN_PROGRESS' \| 'COMPLETED' \| 'CONFIRMED' \| 'RETURNED' \| 'CANCELED'/);

for (const column of [
  /ADD COLUMN `sourceKey` VARCHAR\(180\) NULL/,
  /ADD COLUMN `taskType` VARCHAR\(32\) NOT NULL DEFAULT 'ACTION'/,
  /ADD COLUMN `priority` VARCHAR\(16\) NOT NULL DEFAULT 'NORMAL'/,
  /ADD COLUMN `businessModule` VARCHAR\(40\) NOT NULL DEFAULT 'GENERAL'/,
  /ADD COLUMN `sourceRoute` VARCHAR\(500\) NULL/,
  /ADD COLUMN `sourceLabel` VARCHAR\(120\) NULL/,
  /ADD COLUMN `startedAt` DATETIME\(3\) NULL/,
  /ADD COLUMN `canceledAt` DATETIME\(3\) NULL/,
  /ADD COLUMN `canceledById` VARCHAR\(64\) NULL/,
  /ADD COLUMN `canceledReason` VARCHAR\(500\) NULL/,
  /ADD COLUMN `collaboratorIds` JSON NULL/,
  /ADD COLUMN `estimatedMinutes` INTEGER NULL/,
  /ADD COLUMN `qualityScore` INTEGER NULL/,
  /ADD COLUMN `qualityComment` VARCHAR\(500\) NULL/,
  /ADD COLUMN `remindedAt` DATETIME\(3\) NULL/,
  /ADD COLUMN `lastOverdueNotifiedAt` DATETIME\(3\) NULL/,
  /ADD COLUMN `sourceVersion` VARCHAR\(80\) NULL/,
]) assert.match(migration, column);

assert.match(migration, /SET `sourceKey` = CONCAT\('legacy:employee_task:', `id`\)\s+WHERE `sourceKey` IS NULL/);
assert.match(migration, /CREATE UNIQUE INDEX `employee_tasks_source_key_key`\s+ON `employee_tasks`\(`sourceKey`\)/);
assert.doesNotMatch(migration, /MODIFY COLUMN `sourceKey` VARCHAR\(180\) NOT NULL/);
assert.doesNotMatch(migration, /ADD COLUMN `sourceKey` VARCHAR\(180\) NOT NULL/);

const sourceKeyBackfill = migration.indexOf("SET `sourceKey` = CONCAT('legacy:employee_task:', `id`)");
const sourceKeyIndex = migration.indexOf('CREATE UNIQUE INDEX `employee_tasks_source_key_key`');
assert.ok(sourceKeyBackfill >= 0 && sourceKeyBackfill < sourceKeyIndex, 'sourceKey must be backfilled before its unique index is created');

for (const shape of [
  /CREATE TABLE `task_activities` \(/,
  /`id` VARCHAR\(64\) NOT NULL/,
  /`taskId` VARCHAR\(64\) NOT NULL/,
  /`action` VARCHAR\(40\) NOT NULL/,
  /`actorId` VARCHAR\(64\) NULL/,
  /`actorName` VARCHAR\(100\) NULL/,
  /`fromStatus` VARCHAR\(24\) NULL/,
  /`toStatus` VARCHAR\(24\) NULL/,
  /`comment` VARCHAR\(500\) NULL/,
  /`metadata` JSON NULL/,
  /`createdAt` DATETIME\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP\(3\)/,
  /INDEX `task_activities_taskId_createdAt_idx`\(`taskId`, `createdAt`\)/,
  /INDEX `task_activities_actorId_createdAt_idx`\(`actorId`, `createdAt`\)/,
  /CONSTRAINT `task_activities_taskId_fkey` FOREIGN KEY \(`taskId`\) REFERENCES `employee_tasks`\(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/,
]) assert.match(migration, shape);

assert.match(taskRepository, /sourceKey: row\.templateId\s+\? `template:\$\{row\.templateId\}:\$\{row\.employeeId\}:\$\{row\.workDate\}`\s+: `manual:\$\{id\}`/);
assert.match(taskRepository, /sourceKey: row\.sourceKey \|\| null/);
assert.match(assetCommandService, /sourceKey: `marketing_publish:\$\{batchId\}:\$\{account\.id\}`/);
assert.match(localTrialSeed, /sourceKey: `template:\$\{template\.id\}:\$\{employee\.id\}:\$\{date\}`/);
assert.doesNotMatch(migration, /DROP TABLE `task_evidence`|DROP COLUMN `source(?:Type|Id|ItemId)`|DROP INDEX `employee_tasks_template_employee_workDate_key`/);

console.log('unified workbench migration contract: ok');
