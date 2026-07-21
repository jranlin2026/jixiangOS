import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
assert.match(source, /const setupStatus = await systemSetupService\.status\(\)/, '服务启动必须先识别实例安装状态');
assert.match(source, /if \(setupStatus\.data\?\.initialized\)/, '未初始化实例不得执行旧生产库迁移');
assert.match(
  source,
  /await ensureSystemLifecycleDefaults\(prisma\)/,
  '已初始化实例启动时必须幂等恢复缺失的系统生命周期状态',
);
assert.match(source, /Awaiting first-time system setup/, '未初始化实例应清晰进入等待初始化状态');

console.log('system setup startup static tests passed');
