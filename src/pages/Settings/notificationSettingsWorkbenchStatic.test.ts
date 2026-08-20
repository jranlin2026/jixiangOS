import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/pages/Settings/NotificationSettings.tsx', 'utf8');

assert.match(source, /schedulerFailureThreshold:\s*\{\s*label:\s*'调度连续失败阈值'/);
assert.match(source, /rule\.eventType === 'WORKBENCH_WORKFLOW'/);
assert.match(source, /仅站内消息/);
assert.match(source, /rule\.eventType !== 'WORKBENCH_WORKFLOW'.*label="飞书私信"/s);

console.log('workbench notification settings static tests passed');
