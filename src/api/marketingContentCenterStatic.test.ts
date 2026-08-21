import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../pages/Marketing/index.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const sidebarNavigation = readFileSync(new URL('../layouts/sidebarNavigation.ts', import.meta.url), 'utf8');
const assetPage = readFileSync(new URL('../pages/Assets/index.tsx', import.meta.url), 'utf8');
const marketingApi = readFileSync(new URL('./marketingApi.ts', import.meta.url), 'utf8');

for (const label of ['内容运营', '内容库', '内容日历', '账号分组', '发布计划']) {
  assert.match(page, new RegExp(label), `内容运营应包含“${label}”`);
}
for (const label of ['朋友圈', '短视频', '图文', '适用平台', '图片链接（每行一个）', '视频/网盘链接']) {
  assert.match(page, new RegExp(label), `营销内容表单应包含“${label}”`);
}
assert.match(page, /status: ["']APPROVED["']/, '发布任务只能加载审核通过的内容');
assert.match(page, /expandMarketingAccountSelection/, '发布任务应合并账号组和补充账号');
assert.match(page, /filterSupplementalMarketingAccounts/, '补充账号候选应排除已选账号组内账号');
assert.match(page, /marketingApi\.createPublishPlan/, '发布计划应由内容运营 API 创建');
assert.match(page, /<TablePagination/, '营销内容列表必须复用系统统一分页');
assert.match(app, /ROUTES\.MARKETING/, '内容运营必须注册独立路由');
assert.match(sidebarNavigation, /id: 'content', label: '内容运营', path: ROUTES\.MARKETING/, '营销内容应归入增长运营分组并保留原路由');
assert.doesNotMatch(assetPage, /value: 'matrix', label: '发布批次'/, '资产管理不应再拥有发布批次页签');
assert.match(assetPage, /\/marketing\?tab=plans/, '旧资产发布批次链接应兼容跳转到发布计划');
assert.match(marketingApi, /\/marketing\/publish-plans/, '发布计划应使用内容运营接口');
