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

assert.match(plans, /<Tab label="SOP流程" \/>/, "单场课程抽屉应使用SOP流程页签");
assert.match(plans, /<Tab label={`客户推进/, "单场课程抽屉应使用客户推进页签");
assert.match(plans, /<Tab label="复盘结果" \/>/, "单场课程抽屉应使用复盘结果页签");
assert.doesNotMatch(plans, /<Tab label="安排概览"/, "旧的安排概览页签应移除");
assert.doesNotMatch(plans, /<Tab label="课程任务"/, "旧的课程任务页签应移除");
assert.match(plans, /academy-arrangement-customer-progress[\s\S]*<TablePagination/, "客户推进表应使用统一分页");
assert.match(plans, /canManageExecution && <Button size="small" onClick=\{\(\) => onEditLearner\(item\)\}>记录到课<\/Button>/, "课程执行人员应独立获得到课记录入口");
assert.match(plans, /canManageSales && <Button size="small" onClick=\{\(\) => onFollowUpLearner\(item\)\}>快速跟进<\/Button>/, "销售人员应独立获得快速跟进入口");
assert.match(plans, /canManageSales && !item\.orderNo && <Button size="small" onClick=\{\(\) => onLinkOrder\(item\)\}>关联订单<\/Button>/, "销售人员应独立获得订单关联入口");
assert.doesNotMatch(plans, /canManageLearners/, "课程执行和销售操作不得继续共用同一权限开关");

console.log("academy MVP view tests passed");
