import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
const sidebar = readFileSync(join(root, 'src/layouts/Sidebar.tsx'), 'utf8');
const enablement = readFileSync(join(root, 'src/pages/Enablement/index.tsx'), 'utf8');
const academy = readFileSync(join(root, 'src/pages/Academy/index.tsx'), 'utf8');
const academyPlans = readFileSync(join(root, 'src/pages/Academy/AcademyPlans.tsx'), 'utf8');
const globalTableResizer = readFileSync(join(root, 'src/shared/components/GlobalTableColumnResizer.tsx'), 'utf8');
const systemDataTable = readFileSync(join(root, 'src/shared/components/SystemDataTable.tsx'), 'utf8');

assert.match(app, /ROUTES\.ACADEMY/, '商学院必须有独立受权路由');
assert.match(sidebar, /label: '极享商学院'[\s\S]*path: ROUTES\.ACADEMY/, '商学院必须是左侧一级菜单');
assert.doesNotMatch(enablement, /AcademyCenter|极享商学院/, '企业标准中心不得再承载商学院业务入口');
['我的工作台', '课程库', '课程安排', '邀约跟进'].forEach((label) => {
  assert.ok(academy.includes(label), `商学院缺少${label}页面入口`);
});
assert.doesNotMatch(academy, /\{ value: "reviews", label: "经营复盘" \}/, '单次课程结果不得继续作为独立一级页面');
assert.doesNotMatch(academy, /\{ value: "sessions", label: "场次执行" \}/, '场次执行不应继续作为独立一级页面');
assert.doesNotMatch(academy, /\{ value: "handoffs", label: "转化与交接" \}/, '转化交接应并入学员与转化工作台');
assert.match(academy, /endsWith\("\/sessions"\)[\s\S]*navigate\(viewPath\.plans, \{ replace: true \}\)/, '旧场次执行地址应兼容跳转到课程安排');
assert.match(academy, /item\.value === "plans"[\s\S]*ACADEMY_PLAN_MANAGE[\s\S]*ACADEMY_SESSION_MANAGE/, '课程安排应兼容计划和原场次运营权限');
assert.match(academy, /remainingSessionPages[\s\S]*academyApi\.listSessions\(\{ page: index \+ 2, pageSize: 100 \}\)/, '课程安排应加载全部服务端分页数据');
assert.doesNotMatch(academy, /<ProtectedFormDialog[^>]*detailOpen/, '场次执行详情不得继续使用超长弹窗');
assert.match(academy, /customerApi\s*\.\s*fetchCustomers/, '学员与转化必须从CRM客户主档选择客户');
assert.match(academy, /academyApi\.saveEngagement/, '学员与转化必须可保存邀约记录');
assert.match(academyPlans, /SOP流程[\s\S]*客户推进[\s\S]*复盘结果/, '课程安排抽屉应收敛为三个执行页签');
assert.match(academy, /academyApi\.saveReview/, '经营复盘必须可编辑并保存');
assert.match(academy, /academyApi\.saveCourseAsset/, '课程资产必须保存到后端并关联课程版本');
assert.match(academy, /BusinessAttachmentPicker/, '课程资产必须复用私有业务附件组件');
assert.match(academy, /academyApi\.linkEngagementOrder/, '课程转化必须能关联现有正式订单');
assert.match(academy, /提交验收/, '场次任务必须包含提交验收流程');
assert.doesNotMatch(academy, /<Table(?:\s|>)/, '商学院不得绕过系统统一表格组件');
assert.doesNotMatch(academy, /data-disable-column-resize/, '商学院不得禁用系统统一列宽调整');
const academyTableIds = [...`${academy}\n${academyPlans}`.matchAll(/<SystemDataTable\s+tableId="([^"]+)"/g)].map((match) => match[1]);
assert.ok(academyTableIds.length >= 14, '商学院业务表必须全部接入系统统一表格');
assert.equal(new Set(academyTableIds).size, academyTableIds.length, '每张商学院表必须使用独立的稳定标识');
assert.match(systemDataTable, /data-system-table-id=\{tableId\}/, '系统表格必须暴露稳定列宽标识');
assert.match(systemDataTable, /enhanceTable\(table, location\.pathname, 0\)/, '系统表格必须自主启用列宽调整，不依赖全局观察时序');
assert.match(globalTableResizer, /table\.dataset\.systemTableId/, '全局列宽调整必须优先使用稳定表格标识');

console.log('academy standalone module static tests passed');
