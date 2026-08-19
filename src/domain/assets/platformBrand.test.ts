import assert from 'node:assert/strict';
import { resolvePlatformBrand } from './platformBrand';

for (const platform of ['Apple ID', 'Google账号', 'LINE', 'Instagram', 'TikTok']) {
  const brand = resolvePlatformBrand(platform);
  assert.ok(brand.path, `${platform}应使用品牌图标路径`);
  assert.match(brand.title, new RegExp(platform === 'Google账号' ? 'Google' : platform.replace(' ID', '')));
}

const wechat = resolvePlatformBrand('微信');
const channels = resolvePlatformBrand('视频号');
const wecom = resolvePlatformBrand('企业微信');

assert.equal(channels.variant, 'wechat-channels', '视频号应使用独立品牌图形');
assert.equal(wecom.variant, 'wecom', '企业微信应使用独立品牌图形');
assert.notEqual(channels.title, wechat.title, '视频号不应复用普通微信品牌标题');
assert.notEqual(wecom.title, wechat.title, '企业微信不应复用普通微信品牌标题');

const fallback = resolvePlatformBrand('自定义平台');
assert.equal(fallback.path, undefined);
assert.equal(fallback.fallbackLabel, '自');
