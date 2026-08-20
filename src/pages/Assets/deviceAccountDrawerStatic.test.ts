import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');

assert.match(source, /id: 'accountCount', label: '互联网账号'/);
assert.match(source, /<Drawer[\s\S]*anchor="right"/);
assert.match(source, /openDeviceAccountDrawer/);
assert.match(source, /loginDeviceId: deviceId/);
assert.match(source, /查看\$\{device\.deviceCode\}的互联网账号明细/);
assert.match(source, /未配置/);
assert.match(source, /<PlatformBrandMark[\s\S]*platform=\{account\.platform\}/);
assert.match(source, /openAccountDetailFromDeviceDrawer/);
assert.match(source, /returnToDeviceAccountDrawer/);
assert.match(source, /前往互联网账号管理/);
assert.match(source, /<TablePagination[\s\S]*count=\{deviceAccountDrawer\.total\}/);
assert.match(source, /互联网账号: device\.internetAccountCount/);
assert.match(source, /catch \(error: any\)[\s\S]*网络异常，加载互联网账号失败/);
assert.match(source, /renderSelect\('指定登录设备', loginDeviceIdFilter/);

console.log('deviceAccountDrawerStatic tests passed');
