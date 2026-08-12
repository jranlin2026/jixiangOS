import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const academySource = readFileSync(new URL('../pages/Academy/index.tsx', import.meta.url), 'utf8');
const plansSource = readFileSync(new URL('../pages/Academy/AcademyPlans.tsx', import.meta.url), 'utf8');
const source = [academySource, plansSource].join('\n');

assert.doesNotMatch(source, /label="课程编码 \*"/, '新建课程不应要求用户手填课程编码');
assert.match(source, /label="课程负责人 \*"/, '新建课程应明确课程负责人');
assert.match(source, /label="主讲人"/, '新建课程应支持选择主讲人');
assert.match(source, /label="目标客户"/, '新建课程应记录目标客户');
assert.match(source, /label="客户核心问题"/, '新建课程应记录客户核心问题');
assert.match(source, /label="核心观点"/, '新建课程应记录核心观点');
assert.match(source, /label="转化产品"/, '新建课程应关联系统产品');
assert.match(source, /productApi\.getProducts\(\)/, '转化产品应读取系统设置中的启用产品');
assert.match(source, /item\.targetAudience \|\| "未填写"/, '课程列表应展示真实目标客户');
assert.match(source, /item\.conversionProductName \|\| "未关联"/, '课程列表应展示真实转化产品');
assert.doesNotMatch(source, /item\.objectives\[0\] \|\| "企业管理者"/, '课程列表不得用课程目标伪装目标客户');
assert.match(source, /markButtonClicksDirty=\{false\}/, '商学院表单关闭按钮不应被误判为内容修改');
assert.match(source, /academyApi\.listCourseCategories\(\)/, '课程分类应从后端配置读取');
assert.match(source, /分类设置/, '课程资产页应提供分类配置入口');
assert.match(source, /添加课程目标/, '课程目标应支持多条结构化录入');
assert.match(source, /tableId="academy-course-library"/, '课程列表应复用系统统一表格');
assert.match(source, /<TablePagination[\s\S]*count=\{filtered\.length\}/, '课程列表应使用统一分页语义');
assert.doesNotMatch(source, /<Tab label="版本记录"/, '版本历史尚未开放时不应展示假入口');
assert.match(source, /新建课程安排/, '课程排期统一使用“课程安排”命名');
assert.doesNotMatch(source, /新建课程计划/, '页面不应继续混用“课程计划”');
assert.doesNotMatch(source, /新建课程场次/, '创建入口不应继续混用“课程场次”');
assert.match(source, /label="授课方式 \*"/, '课程安排应明确授课方式');
assert.match(source, /"项目负责人 \*"/, '课程安排应指定项目负责人');
assert.match(source, /"课程内容负责人 \*"/, '课程安排应指定内容负责人');
assert.match(source, /"素材负责人 \*"/, '课程安排应指定素材负责人');
assert.match(source, /tableId="academy-course-arrangements"/, '课程安排列表应复用系统统一表格');
assert.match(source, /anchor="right"/, '课程安排详情应使用右侧抽屉，不跳转页面');
assert.match(source, /requestedSessionId/, '外部工作台进入课程安排时应能直接打开目标抽屉');
assert.match(source, /detailErrors[\s\S]*课程安排详情加载失败[\s\S]*重新加载/, '课程安排详情失败时应显示抽屉内错误和重试入口');
assert.doesNotMatch(plansSource, /<Tabs|<Tab /, '课程安排抽屉应使用一页连续结构，不再拆分页签');
['课程执行进度', '课程数据', '复盘记录'].forEach((label) => {
  assert.ok(plansSource.includes(label), `课程安排抽屉缺少${label}区块`);
});
assert.doesNotMatch(plansSource, /从我的客户添加|记录到课|快速跟进|关联订单/, '课程安排详情不应重复承载销售操作');
assert.match(source, /完善SOP流程|确认开课|进入课程执行|填写复盘结果|查看复盘结果/, '课程安排应根据状态展示明确的下一步操作');
assert.doesNotMatch(source, /进入场次执行/, '课程安排不应继续使用含义重复的“进入场次执行”');

console.log('academy course form static tests passed');
