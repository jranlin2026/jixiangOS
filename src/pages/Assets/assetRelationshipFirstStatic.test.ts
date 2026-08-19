import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/pages/Assets/index.tsx'), 'utf8');

assert.match(source, /id: 'deviceCategory', label: '设备类型'/, '设备类型应独立成列');
assert.match(source, /id: 'brandModel', label: '品牌 \/ 型号'/, '品牌型号应作为独立列');
assert.doesNotMatch(source, /类型 \/ 品牌型号/, '不应继续合并设备类型和品牌型号');
assert.match(source, /<DeviceBrandMark brand=\{device\.brand\}/, '设备品牌型号需要品牌标识');
assert.match(source, /本机登录账号 \(\{loginAccounts\.length\}\)/, '设备详情应区分号码关联账号和本机登录账号');
assert.match(source, /slots\.length \? slots\.map[\s\S]*?该设备无 SIM[\s\S]*?本机登录账号/, '无 SIM 设备仍必须显示本机登录账号');

const deviceSections = source.match(/const renderDeviceDetailSections[\s\S]*?\n  \);/)?.[0] || '';
assert.ok(
  deviceSections.indexOf('renderDeviceRelationshipOverview') < deviceSections.indexOf("renderDetailCard('设备身份'"),
  '设备详情应先展示关联关系，再展示基础身份',
);

const phoneSections = source.match(/const renderPhoneDetailSections[\s\S]*?\n  \);/)?.[0] || '';
assert.ok(
  phoneSections.indexOf('renderPhoneRelationshipOverview') < phoneSections.indexOf('renderPhoneIdentityCard'),
  '手机号详情应在首屏优先展示设备和互联网账号关系',
);
assert.match(source, /互联网账号 \(\{relatedAccounts\.length\}\)/, '手机号关系区应显示关联账号数量');
assert.match(source, /PlatformBrandMark platform=\{account\.platform\}/, '手机号的关联账号应显示平台标识');

const accountSections = source.match(/const renderAccountDetailSections[\s\S]*?\n  \);/)?.[0] || '';
assert.ok(
  accountSections.indexOf('renderAccountBindingSection') < accountSections.indexOf('renderAccountSecuritySection'),
  '互联网账号详情应先展示绑定关系，再展示密码安全信息',
);

console.log('asset relationship-first static tests passed');
