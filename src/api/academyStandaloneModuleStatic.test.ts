import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
const sidebar = readFileSync(join(root, 'src/layouts/Sidebar.tsx'), 'utf8');
const enablement = readFileSync(join(root, 'src/pages/Enablement/index.tsx'), 'utf8');
const academy = readFileSync(join(root, 'src/pages/Academy/index.tsx'), 'utf8');

assert.match(app, /ROUTES\.ACADEMY/, '商学院必须有独立受权路由');
assert.match(sidebar, /label: '极享商学院'[\s\S]*path: ROUTES\.ACADEMY/, '商学院必须是左侧一级菜单');
assert.doesNotMatch(enablement, /AcademyCenter|极享商学院/, '企业标准中心不得再承载商学院业务入口');
['运营工作台', '课程计划', '课程库', '场次运营', '学员与转化', '经营复盘'].forEach((label) => {
  assert.ok(academy.includes(label), `商学院缺少${label}页面入口`);
});
assert.doesNotMatch(academy, /<ProtectedFormDialog[^>]*detailOpen/, '场次执行详情不得继续使用超长弹窗');
assert.match(academy, /customerApi\.fetchCustomers/, '学员与转化必须从CRM客户主档选择客户');
assert.match(academy, /academyApi\.saveEngagement/, '学员与转化必须可保存邀约记录');
assert.match(academy, /academyApi\.saveReview/, '经营复盘必须可编辑并保存');

console.log('academy standalone module static tests passed');
