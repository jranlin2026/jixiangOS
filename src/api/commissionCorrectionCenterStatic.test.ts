import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pageSource = readFileSync(new URL('../pages/Finance/CommissionPayout.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('./commissionPayoutApi.ts', import.meta.url), 'utf8');

assert.match(pageSource, /value="corrections" label="更正与差额"/, '提成发放必须提供统一的更正与差额入口');
assert.match(pageSource, /commissionPayoutApi\.fetchCorrections/, '更正中心必须读取服务端分页数据');
assert.match(pageSource, /更正单号/);
assert.match(pageSource, /业务来源/);
assert.match(pageSource, /源单号/);
assert.match(pageSource, /更正原因/);
assert.match(pageSource, /受影响月份/);
assert.match(pageSource, /原已发/);
assert.match(pageSource, /更正后应得/);
assert.match(pageSource, /补发/);
assert.match(pageSource, /追回/);
assert.match(pageSource, /visibleCorrectionRows\.map/, '桌面表格与移动卡片必须复用当前页数据');
assert.match(pageSource, /count=\{correctionData\?\.pagination\.total \|\| 0\}/, '更正列表必须使用服务端总条数');
assert.match(pageSource, /rowsPerPageOptions=\{\[10, 20, 50\]\}/, '更正列表必须提供统一每页条数');
assert.match(pageSource, /labelDisplayedRows=\{formatPaginationRows\}/, '更正列表必须使用统一总条数文案');
assert.match(pageSource, /isSuperAdmin\(currentUser\)/, '追回处理入口必须仅向超级管理员开放');
assert.match(pageSource, /线下追回/);
assert.match(pageSource, /下月提成抵扣/);
assert.match(pageSource, /财务确认无需追回/);
assert.match(pageSource, /commissionPayoutApi\.completeCorrectionLeg/, '追回处理必须调用专用完成接口');
assert.match(pageSource, /补发提成·/, '正差额必须展示补发提成状态');

assert.match(apiSource, /\/commission-corrections\?/);
assert.match(apiSource, /\/commission-corrections\/\$\{encodeURIComponent\(correctionId\)\}\/legs\/\$\{encodeURIComponent\(legId\)\}\/complete/);
assert.match(apiSource, /method:\s*'POST'/);

console.log('commission correction center static tests passed');
