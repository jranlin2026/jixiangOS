import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const systemSeed = readFileSync(new URL('../../prisma/seed.ts', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

assert.doesNotMatch(systemSeed, /mockCustomers|mockLeads|mockOrders/, '默认数据库种子不能包含演示业务数据');
assert.match(systemSeed, /seedSystemBaseline/, '默认数据库种子必须只建立产品基础数据');
assert.match(systemSeed, /REFUSING_SYSTEM_SEED_ON_INITIALIZED_DATABASE/, '默认种子必须拒绝覆盖已初始化数据库');
assert.equal(packageJson.scripts['db:seed:demo'], undefined, '演示数据只能在初始化事务内写入，不能提供生产命令');

console.log('system seed entrypoint tests passed');
