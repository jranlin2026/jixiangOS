import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/pages/Delivery/index.tsx'), 'utf8');

assert.match(source, /const handleToggleTaskCompletion[\s\S]{0,500}status:\s*isTerminalTask\(task\)\s*\?\s*'待开始'\s*:\s*'已完成'/);
assert.match(source, /<Checkbox[\s\S]{0,260}checked=\{isTerminal\}[\s\S]{0,260}handleToggleTaskCompletion\(task\)/);
assert.doesNotMatch(source, />完成一步</);
assert.doesNotMatch(source, /disabled=\{!isCurrent && !isTerminal\}/);
assert.match(source, /loadError/);
assert.match(source, /交付数据加载失败/);
