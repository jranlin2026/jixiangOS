import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src', 'pages', 'Settings', 'CrmMigration.tsx'), 'utf8');
const compromisedSharedCredential = ['Jixiang', '88'].join('');

assert.equal(source.includes(compromisedSharedCredential), false, '迁移向导不得包含已泄露的共享凭据');
assert.doesNotMatch(source, /settingsApi\.createUser/);
assert.doesNotMatch(source, /password\s*:/);
assert.match(source, /批量创建员工账号已暂停/);
assert.match(source, /唯一初始密码/);
