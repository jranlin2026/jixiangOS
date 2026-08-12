import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const academy = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
const plans = readFileSync(new URL("./AcademyPlans.tsx", import.meta.url), "utf8");

["我的工作台", "课程库", "课程安排", "邀约跟进"].forEach((label) => {
  assert.match(academy, new RegExp(`label: "${label}"`), `一级导航应包含${label}`);
});

assert.match(academy, /academyApi\.getPublicCalendar/, "全员周历应使用独立安全日历接口");
assert.match(academy, /academyApi\.listMyTasks/, "我的待办应使用本人任务安全接口");
assert.doesNotMatch(academy, /view === "overview"[\s\S]{0,300}loadDetail/, "工作台周历不应预取任何课程详情");
assert.match(academy, /title="全员课程周历"/, "工作台应明确标记全员课程周历");
assert.doesNotMatch(academy, /进入课程运营/, "工作台周历不应提供进入课程的按钮");
assert.match(academy, /academyApi\.saveEngagementBatch/, "多选客户应使用原子批量邀约接口");
assert.match(academy, /academyApi\.quickFollowUp/, "商学院快速跟进应由后端原子同步CRM");
assert.match(academy, /customerResultTotal[\s\S]*<TablePagination/, "客户选择应支持服务端分页");
assert.match(academy, /全选当前页/, "客户选择应支持当前页全选并保留跨页选项");
assert.doesNotMatch(academy, /sessions\.some\(\(session\) => session\.canOpenDetail\)/, "任务受理人不应因单场可见而获得课程安排一级页面权限");
assert.doesNotMatch(academy, /canLoadAcademyOperations[\s\S]{0,500}ACADEMY_VIEW/, "仅工作台权限不应触发私有课程和课程安排接口");
assert.match(academy, /audience: "ALL_EMPLOYEES"/, "新建课程安排应默认对全员周历可见");
assert.match(academy, /label="允许销售邀约"/, "新建课程安排应能明确开启销售邀约");

assert.doesNotMatch(plans, /viewMode/, "课程安排不应再让用户在周历和列表之间选择");
assert.match(plans, /本周课程安排/, "课程安排页应在列表上方保留周历");
assert.match(plans, /weekDays\.map/, "课程安排周历应按一周七天展示");
assert.doesNotMatch(plans, /<Tabs|<Tab /, "单场课程抽屉应改成一页连续阅读，不再分页签");
assert.match(plans, /课程执行进度/, "详情顶部应先解释整场SOP执行进度");
assert.match(plans, /课程数据/, "详情中部应集中展示课程经营数据");
assert.match(plans, /复盘记录/, "详情底部应展示可编辑的复盘记录");
assert.match(plans, /academy-arrangement-customer-progress[\s\S]*<TablePagination/, "客户推进表应使用统一分页");
assert.doesNotMatch(plans, /从我的客户添加|记录到课|快速跟进|关联订单/, "课程详情只看数据，客户操作应统一留在邀约跟进页面");
assert.doesNotMatch(plans, /提交验收|>开始<|>通过<|>驳回</, "课程详情SOP只展示进度，任务操作应统一留在我的待办");
assert.match(plans, /编辑复盘/, "有复盘权限时应提供明确的编辑入口");

assert.match(academy, /客户邀约与跟进/, "邀约跟进页应按销售任务重新命名页面标题");
assert.match(academy, /待邀约[\s\S]*待确认[\s\S]*已确认[\s\S]*待跟进[\s\S]*重点客户[\s\S]*已成交/, "销售应能按清晰推进阶段筛选客户");
assert.match(academy, /academy-invite-customer-picker/, "CRM客户选择应使用可见表格而不是隐藏在下拉框");
assert.doesNotMatch(academy, /<Autocomplete[\s\S]{0,1200}从我的客户添加/, "CRM客户选择不得继续使用多选下拉框");
assert.match(academy, /academy-sales-customer-pipeline[\s\S]*<TablePagination/, "客户推进表应使用统一表格和分页");
assert.match(academy, /aria-pressed=\{stage === item\.key\}/, "客户阶段筛选应向辅助技术暴露选中状态");
assert.match(academy, /已有客户不会重复加入/, "CRM客户选择应明确防重复规则");
assert.match(academy, /已选 \{selectedInviteCustomers\.length\}\/100 位/, "CRM客户选择应在选择阶段展示单批上限");
assert.match(academy, /更新于 \$\{formatDate\(item\.updatedAt\)\}/, "最近跟进应同时显示更新时间");
assert.doesNotMatch(academy, /销售转化|课程转化清单|待转化学员/, "邀约跟进页不应继续混用旧销售术语");

console.log("academy MVP view tests passed");
