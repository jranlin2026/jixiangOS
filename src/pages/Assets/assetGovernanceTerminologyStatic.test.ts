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
assert.ok(
  assetPage.includes("gridTemplateColumns: 'minmax(0, 1fr) auto'"),
  '资产交接明细必须为名称预留可收缩列，并为状态标签保留固定列',
);
assert.ok(
  assetPage.includes("textOverflow: 'ellipsis'"),
  '资产交接明细的长名称必须截断，不能覆盖状态标签',
);
assert.doesNotMatch(
  assetPage,
  /\{group\.completed\} \/ \{group\.total\}/,
  '资产交接进度不得继续显示含义不明的裸数字比例',
);
assert.match(
  assetPage,
  /<Stack direction="row" spacing=\{0\.75\} alignItems="center"[\s\S]{0,500}?\{group\.completed\} 项 \/ 共 \{group\.total\} 项/,
  '资产交接状态和明确的完成项数应在同一行展示',
);

console.log('asset governance terminology static tests passed');
