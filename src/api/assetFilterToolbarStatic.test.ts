import assert from 'node:assert/strict';
import fs from 'node:fs';

const pageSource = fs.readFileSync(new URL('../pages/Assets/index.tsx', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('./assetApi.ts', import.meta.url), 'utf8');

for (const label of ['设备类型', '完善情况', '运营商', '设备绑定', '账号控制权', '更多筛选', '清空全部', '合约到期', '最低月费', '指定登录设备']) {
  assert.match(pageSource, new RegExp(label), `资产台账筛选栏应包含“${label}”`);
}
for (const key of ['deviceCategory', 'profileStatus', 'accountBinding', 'identityBinding', 'credentialStatus', 'twoFactorStatus']) {
  assert.match(apiSource, new RegExp(`'${key}'`), `后端请求应序列化筛选字段 ${key}`);
}
assert.match(pageSource, /setSearchParams\(\(current\)/, '筛选条件应写入 URL 并可刷新恢复');
assert.match(pageSource, /setPage\(0\)/, '筛选变化应回到第一页');
assert.match(pageSource, /setTimeout\(\(\) => setDebouncedSearch\(search\), 300\)/, '搜索输入应使用 300ms 防抖');
assert.match(pageSource, /fetchAssetFilterOptions\(activeTab\)/, '筛选候选项应来自当前可见台账的去重字典');
assert.match(pageSource, /skipNextFilterUrlWriteRef/, '浏览器前进后退回填时不应被旧本地状态反写 URL');
assert.match(pageSource, /currentFilterSnapshotRef/, '只有外部 URL 筛选真正变化时才应抑制一次写回');
assert.match(apiSource, /permissionByKind\[kind\]/, '本地筛选字典应与生产环境一样校验目标台账读取权限');
assert.match(pageSource, /renderMobileAssetCards/, '移动端应使用卡片承载与桌面端相同的筛选和分页结果');
