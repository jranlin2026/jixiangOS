import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
const sidebar = readFileSync(join(process.cwd(), 'src/layouts/Sidebar.tsx'), 'utf8');
const page = readFileSync(join(process.cwd(), 'src/pages/Enablement/index.tsx'), 'utf8');
const knowledge = readFileSync(join(process.cwd(), 'src/pages/Enablement/KnowledgeCenter.tsx'), 'utf8');
const publishing = readFileSync(join(process.cwd(), 'src/pages/Enablement/PublishingCenter.tsx'), 'utf8');
const store = readFileSync(join(process.cwd(), 'src/store/useEnablementStore.ts'), 'utf8');

assert.match(app, /ROUTES\.ENABLEMENT/);
assert.match(app, /PERMISSION_KEYS\.ENABLEMENT/);
assert.match(sidebar, /label:\s*'赋能中台'/);
assert.match(page, /企业知识/);
assert.match(page, /发布管理/);
assert.match(knowledge, /搜索公司知识/);
assert.match(knowledge, /匹配分.*hit\.score/);
assert.match(publishing, /导入Markdown/);
assert.match(publishing, /提交审核/);
assert.match(publishing, /正式发布/);
assert.match(publishing, /上传新版本/);
assert.doesNotMatch(store, /localStorage|AppStorage|BusinessRecord/);
assert.doesNotMatch(`${knowledge}\n${publishing}`, /storageKey|sourcePath/);
