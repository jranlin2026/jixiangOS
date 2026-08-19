import assert from 'node:assert/strict';
import { resolvePlatformBrand } from './platformBrand';

for (const platform of ['Apple ID', 'Google账号', 'LINE', 'Instagram', 'TikTok']) {
  const brand = resolvePlatformBrand(platform);
  assert.ok(brand.path, `${platform}应使用品牌图标路径`);
  assert.match(brand.title, new RegExp(platform === 'Google账号' ? 'Google' : platform.replace(' ID', '')));
}

const fallback = resolvePlatformBrand('自定义平台');
assert.equal(fallback.path, undefined);
assert.equal(fallback.fallbackLabel, '自');
