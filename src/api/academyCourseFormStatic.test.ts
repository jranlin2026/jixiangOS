import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../pages/Academy/index.tsx', import.meta.url), 'utf8');

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

console.log('academy course form static tests passed');
