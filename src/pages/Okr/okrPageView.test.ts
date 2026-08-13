import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');

assert.match(source, /<ModulePage/, '目标管理应复用系统模块页面语言');
assert.match(source, /<ModuleTabs/, '目标管理页签应复用系统页签');
assert.match(source, /<TablePagination/, '目标列表必须使用系统统一分页');
assert.match(source, /mobile[\s\S]*<Stack[\s\S]*objectives\.map/, '移动端应以卡片展示同一批目标结果');
assert.match(source, /okrApi\.createCycle/, '周期设置应调用OKR周期命令');
assert.match(source, /okrApi\.createObjective/, '维护者应能创建目标');
assert.match(source, /okrApi\.createKeyResult/, '维护者应能在目标下创建关键结果');
assert.match(source, /submitOkrCheckIn/, '周检视必须使用提交并刷新流程');
assert.match(source, /PERMISSION_KEYS\.OKR_/, '权限判断必须复用共享权限常量');
assert.match(source, /okrApi\.listDirectoryUsers/, '负责人选择必须使用OKR权限裁剪目录');
assert.doesNotMatch(source, /settingsApi\.fetchUsers/, '不得绕过OKR数据范围加载全量员工');
assert.match(source, /getAllowedObjectiveScopes/, '目标层级必须按共享权限计算');
assert.match(source, /okrApi\.listDueCheckIns/, '周检视必须以服务端当周待检视结果为准');
assert.match(source, /最近检视/, '目标页应显示KR最近检视');
assert.match(source, /okrApi\.linkTask/, '任务关联必须调用后端命令');
assert.match(source, /已关联任务/, '目标页应展示KR已关联任务');

console.log('okr page behavior seams test passed');
