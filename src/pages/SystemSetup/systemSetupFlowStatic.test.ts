import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');

assert.match(appSource, /path="\/setup"/, '应用必须注册初始化页面');
assert.match(appSource, /systemSetupApi\.getStatus/, '应用启动必须先查询服务器安装状态');
assert.match(appSource, /setupStatus\?\.initialized/, '只有已初始化实例才能启动登录和业务数据流程');
assert.match(pageSource, /系统初始化/);
assert.match(pageSource, /一次性初始化码/);
assert.match(pageSource, /organizationTemplate/);
assert.match(pageSource, /includeDemoData/);
assert.match(pageSource, /adminPasswordConfirm/, '管理员密码必须二次确认');
assert.match(pageSource, /INITIALIZING.*RESETTING|RESETTING.*INITIALIZING/s, '初始化和重置期间必须进入维护态页面');
assert.match(pageSource, /systemSetupApi\.getStatus/, '维护态页面必须轮询安装状态');
assert.match(pageSource, /setInterval/, '维护态页面必须自动刷新状态');

console.log('system setup flow static tests passed');
