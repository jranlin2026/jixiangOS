import assert from 'node:assert/strict';
import fs from 'node:fs';

const pageSource = fs.readFileSync(new URL('../pages/Assets/index.tsx', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../../server/index.ts', import.meta.url), 'utf8');

assert.match(pageSource, /资产驾驶舱/, '资产总览应使用驾驶舱结构');
assert.match(pageSource, /设备资产/);
assert.match(pageSource, /手机号资产/);
assert.match(pageSource, /互联网账号/);
assert.match(pageSource, /待关联与待处理/);
assert.match(pageSource, /资产关系明细/);
assert.match(pageSource, /<TableCell>设备编号<\/TableCell><TableCell>设备名称<\/TableCell><TableCell>品牌 \/ 型号<\/TableCell>/, '设备信息应拆分为独立列');
assert.match(pageSource, /<TableCell>所属部门<\/TableCell><TableCell>负责人<\/TableCell><TableCell>当前使用人<\/TableCell>/, '归属与使用应拆分为独立列');
assert.doesNotMatch(pageSource, /<TableCell>归属与使用<\/TableCell>/, '总览关系表不得继续合并归属与使用字段');
assert.match(pageSource, /<DeviceBrandMark brand=\{row\.device\.brand\}/, '资产总览品牌型号应显示设备品牌图标');
assert.match(pageSource, /<CarrierBrandMark operator=\{phone\.operator\}/, '手机号运营商应显示品牌图标');
assert.match(pageSource, /fetchOverviewRelationships/);
assert.match(pageSource, /setOverviewRefreshToken/);
assert.match(pageSource, /lastAvailablePage/);
assert.match(pageSource, /<TablePagination/);
assert.match(pageSource, /bindingStatus/);
assert.match(serverSource, /\/api\/assets\/relationships/);
assert.doesNotMatch(pageSource, /设备通过手机号连接互联网账号/, '不得继续使用错误的单链路关系描述');
