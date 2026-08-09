import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const settings = readFileSync(resolve(root, 'src/pages/Settings/index.tsx'), 'utf8');
const sidebar = readFileSync(resolve(root, 'src/layouts/Sidebar.tsx'), 'utf8');
const api = readFileSync(resolve(root, 'src/api/browserAgentConfigApi.ts'), 'utf8');
const page = readFileSync(resolve(root, 'src/pages/Settings/BrowserScriptLibraryConfig.tsx'), 'utf8');

assert.match(settings, /key: 'aiEmployee'[\s\S]*key: 'scriptLibrary'/);
assert.match(sidebar, /label: 'AI员工设置'[\s\S]*group=aiEmployee/);
assert.match(api, /getScriptLibrary:[\s\S]*saveScriptLibrary:/);
assert.match(page, /浏览器客服话术/);
assert.match(page, /订单状态/);
assert.match(page, /商品关键词/);
assert.match(page, /联系方式状态/);

console.log('browser script library settings contract tests passed');
