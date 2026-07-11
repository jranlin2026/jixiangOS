import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
const sidebar = readFileSync(resolve(root, 'src/layouts/Sidebar.tsx'), 'utf8');
const page = readFileSync(resolve(root, 'src/pages/CoCreation/index.tsx'), 'utf8');

assert.match(app, /ROUTES\.CO_CREATION/);
assert.match(app, /PERMISSION_KEYS\.CO_CREATION_SUBMIT/);
assert.match(sidebar, /label:\s*'AI共创中心'/);
assert.match(page, /我的需求/);
assert.match(page, /主管确认/);
assert.match(page, /管理决策/);
assert.match(page, /需求验证/);
assert.match(page, /批准进入验证/);
assert.doesNotMatch(page, /批准开发/);
assert.match(page, /系统设置.*DeepSeek/s);
assert.match(page, /AI需求追问官/);
assert.match(page, /继续回答/);
assert.match(page, /createOpen && interviewRequest/);

console.log('coCreationModuleStatic.test.ts passed');
