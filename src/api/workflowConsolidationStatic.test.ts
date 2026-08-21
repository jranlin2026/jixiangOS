import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasPermission, PERMISSION_KEYS } from '../shared/utils/permissions';

const assets = readFileSync(new URL('../pages/Assets/index.tsx', import.meta.url), 'utf8');
const marketing = readFileSync(new URL('../pages/Marketing/index.tsx', import.meta.url), 'utf8');
const tasks = readFileSync(new URL('../pages/Tasks/index.tsx', import.meta.url), 'utf8');
const enablement = readFileSync(new URL('../pages/Enablement/index.tsx', import.meta.url), 'utf8');
const taskTemplates = readFileSync(new URL('../pages/Enablement/TaskTemplates.tsx', import.meta.url), 'utf8');
const cockpit = readFileSync(new URL('../pages/Dashboard/BusinessCockpit.tsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../../server/index.ts', import.meta.url), 'utf8');

assert.doesNotMatch(assets, /发布批次|员工任务中心/, '资产管理应只管资产主数据与交接');
assert.match(marketing, /title="内容运营"/, '内容与发布计划应归属内容运营');
assert.match(marketing, /executionLedgerLink/, '发布计划必须能下钻到执行台账');
assert.doesNotMatch(tasks, /<Tab value="templates"/, '员工任务台账不应继续暴露模板管理');
assert.match(tasks, /\/enablement\?tab=task-templates/, '旧模板地址应跳转到企业标准');
assert.match(enablement, /label: '执行模板'/, '企业标准应包含执行模板');
assert.match(taskTemplates, /<TablePagination/, '执行模板必须继承系统分页语义');
assert.doesNotMatch(cockpit, /MarketingPublishPanel/, '老板首页应保持三块结构，内容发布指标下沉到内容运营');
assert.match(server, /\/api\/marketing\/publish-plans/, '发布计划必须拥有内容运营路由');
assert.equal(PERMISSION_KEYS.MARKETING_PUBLISH, '营销内容中心/发布任务', '已存储的营销权限键不得随界面改名');
assert.equal(hasPermission({
  role: 'Employee' as never,
  permissions: [{ module: PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH, actions: ['read', 'write'] }],
  isActive: true,
}, PERMISSION_KEYS.MARKETING_PUBLISH, 'write'), true, '旧矩阵发布权限必须兼容新发布计划');
assert.match(server, /publish-plans\/stats', requireAuthenticated[\s\S]*PERMISSION_KEYS\.DASHBOARD/, '驾驶舱权限必须能读取发布执行统计');

console.log('workflow consolidation static tests passed');
