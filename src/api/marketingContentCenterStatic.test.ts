import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../pages/Marketing/index.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../layouts/Sidebar.tsx', import.meta.url), 'utf8');
const assetPage = readFileSync(new URL('../pages/Assets/index.tsx', import.meta.url), 'utf8');

for (const label of ['营销内容中心', '内容库', '内容日历', '账号分组', '发布任务']) {
  assert.match(page, new RegExp(label), `营销内容中心应包含“${label}”`);
}
for (const label of ['朋友圈', '短视频', '图文', '适用平台', '图片链接（每行一个）', '视频/网盘链接']) {
  assert.match(page, new RegExp(label), `营销内容表单应包含“${label}”`);
}
assert.match(page, /status: ["']APPROVED["']/, '发布任务只能加载审核通过的内容');
assert.match(page, /expandMarketingAccountSelection/, '发布任务应合并账号组和补充账号');
assert.match(page, /createMatrixPublishTask/, '发布任务应进入现有员工任务闭环');
assert.match(page, /<TablePagination/, '营销内容列表必须复用系统统一分页');
assert.match(app, /ROUTES\.MARKETING/, '营销内容中心必须注册独立路由');
assert.match(sidebar, /label: '营销内容中心'/, '侧边栏必须提供营销内容中心入口');
assert.match(assetPage, /href="\/marketing\?tab=tasks&create=1"/, '资产发布批次创建入口应转到营销内容中心');
