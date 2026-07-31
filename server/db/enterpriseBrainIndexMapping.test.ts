import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');

const requiredPhysicalIndexMappings = [
  'position_standard_resources_version_knowledge_key',
  'employee_tasks_template_employee_workDate_key',
  'employee_tasks_employee_workDate_status_idx',
  'employee_tasks_department_workDate_status_idx',
  'daily_reviews_departmentId_workDate_idx',
];

for (const physicalIndexName of requiredPhysicalIndexMappings) {
  assert.match(
    schema,
    new RegExp(`map:\\s*"${physicalIndexName}"`),
    `Prisma schema must preserve the migration's physical index name: ${physicalIndexName}`,
  );
}
