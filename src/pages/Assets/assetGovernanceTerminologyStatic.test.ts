import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const assetPage = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');
const rolePage = readFileSync(new URL('../Settings/RolePermission.tsx', import.meta.url), 'utf8');
const context = readFileSync(new URL('../../../CONTEXT.md', import.meta.url), 'utf8');

for (const label of ['管理责任人', '账号负责人', '主要使用人', '资产交接', '发布批次']) {
  assert.ok(assetPage.includes(label) || rolePage.includes(label) || context.includes(label), `缺少统一领域术语：${label}`);
}

assert.equal(assetPage.includes("label: '离职回收'"), false, '资产导航不得继续使用“离职回收”');
assert.equal(rolePage.includes("label: '离职回收'"), false, '角色权限不得继续使用“离职回收”');
assert.equal(assetPage.includes('点完成'), false, '发布批次不得保留独立手工完成入口');
assert.ok(assetPage.includes('员工任务中心'), '发布批次必须明确以员工任务中心为执行终态');

console.log('asset governance terminology static tests passed');
