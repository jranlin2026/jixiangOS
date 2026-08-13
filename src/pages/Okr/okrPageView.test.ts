import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');

assert.match(source, /<ModulePage/, '目标管理应复用系统模块页面语言');
assert.doesNotMatch(source, /<ModuleTabs/, '目标工作台不再使用总览、我的、团队、周检视、周期五个主页签');
assert.match(source, /我的目标/, '目标工作台左侧应提供本人入口');
assert.match(source, /团队成员/, '有权限的管理者应能在同一工作台切换团队成员');
assert.match(source, /本周待检视/, '周检视应作为目标工作台内的行动入口');
assert.match(source, /周期管理/, '周期管理应降级为管理入口而非普通主页签');
assert.match(source, /从其他周期导入/, '目标工作台应预留跨周期复用目标的清晰入口');
assert.match(source, /<TablePagination/, '目标列表必须使用系统统一分页');
assert.match(source, /objectives\.map/, '目标工作台应以目标卡片展示同一批分页结果');
assert.match(source, /okrApi\.createCycle/, '周期设置应调用OKR周期命令');
assert.match(source, /okrApi\.createObjective/, '维护者应能创建目标');
assert.match(source, /okrApi\.createKeyResult/, '维护者应能在目标下创建关键结果');
assert.match(source, /输入目标，回车创建/, '添加Objective应在当前页直接输入');
assert.match(source, /输入关键结果，回车创建/, '添加KR应在目标内直接输入');
assert.match(source, /autoDistributeWeight: true/, '快捷创建应由后端自动均分草稿权重');
assert.match(source, /<MenuItem value="MONTH">月度<\/MenuItem>/, '周期创建应允许选择月度');
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
