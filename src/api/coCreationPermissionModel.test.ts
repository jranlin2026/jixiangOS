import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const constantsSource = readFileSync(resolve(root, 'src/shared/utils/constants.ts'), 'utf8');
const permissionSource = readFileSync(resolve(root, 'src/shared/utils/permissions.ts'), 'utf8');
const organizationSource = readFileSync(resolve(root, 'src/shared/utils/organizationConfig.ts'), 'utf8');
const schemaSource = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf8');

assert.match(constantsSource, /CO_CREATION:\s*'\/co-creation'/);
assert.match(permissionSource, /CO_CREATION_SUBMIT:\s*'AI共创中心\/提交需求'/);
assert.match(permissionSource, /CO_CREATION_SUPERVISE:\s*'AI共创中心\/主管确认'/);
assert.match(permissionSource, /CO_CREATION_DECIDE:\s*'AI共创中心\/管理决策'/);
assert.match(permissionSource, /CO_CREATION_VALIDATE:\s*'AI共创中心\/需求验证'/);
assert.match(permissionSource, /\[PERMISSION_KEYS\.CO_CREATION\]:\s*\[/);
assert.match(organizationSource, /PERMISSION_KEYS\.CO_CREATION_SUBMIT/);
assert.match(schemaSource, /model CoCreationRequest \{/);
assert.match(schemaSource, /model CoCreationMessage \{/);
assert.match(schemaSource, /model CoCreationBrief \{/);
assert.match(schemaSource, /model CoCreationValidation \{/);
assert.match(schemaSource, /model CoCreationEvent \{/);

console.log('coCreationPermissionModel.test.ts passed');
