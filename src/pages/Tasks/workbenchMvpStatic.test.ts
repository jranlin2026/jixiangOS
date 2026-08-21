import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');

assert.ok(source.includes('title="我的工作台"'), '任务页标题必须改为我的工作台');
assert.ok(source.includes('员工在这里执行任务、提交结果、等待确认并完成每日复盘。'), '任务页必须说明员工执行职责');
assert.ok(source.includes('当前加载范围'), '任务页必须标记汇总只对应当前已加载范围');
assert.ok(source.includes('待处理'), '任务页必须提供待处理状态筛选和汇总');
assert.ok(source.includes('PENDING_OR_RETURNED'), '待处理筛选必须复用多状态 API 查询');
assert.ok(source.includes('来源 / 模块'), '桌面任务表必须显示来源与模块');
assert.ok(source.includes('优先级'), '任务项目必须显示优先级');
assert.ok(source.includes('截止时间'), '任务项目必须显示截止时间');
assert.ok(source.includes('已逾期'), '逾期任务必须有可见提示');

console.log('workbench MVP static tests passed');
