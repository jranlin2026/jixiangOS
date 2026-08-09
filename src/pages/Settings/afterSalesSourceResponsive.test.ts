import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/pages/Settings/AfterSalesSourceConfig.tsx'), 'utf8');
const brandSource = readFileSync(join(process.cwd(), 'src/shared/components/BusinessPlatformBrand.tsx'), 'utf8');

assert.match(
  source,
  /display:\s*\{\s*xs:\s*'none',\s*md:\s*'block'\s*\}/,
  'The grouped shop table should only render as a table on desktop.',
);

assert.match(
  source,
  /display:\s*\{\s*xs:\s*'flex',\s*md:\s*'none'\s*\}/,
  'The grouped shop directory should switch to cards on mobile.',
);

assert.match(
  source,
  /data-testid="add-after-sales-platform"[\s\S]*?>新增业务平台</,
  'The primary platform action should be explicit instead of an inline blank input.',
);

for (const platformName of ['抖音小店', '微信小店', '快手小店', '小红书电商', '第三方平台']) {
  assert.ok(`${source}\n${brandSource}`.includes(platformName), `The platform chooser should expose ${platformName}.`);
}

assert.match(
  source,
  /business-platform-preset-/,
  'Preset platforms should be clickable choices instead of free-form names.',
);

for (const field of ['店铺名称', '平台店铺ID', '店铺别名', '启用店铺']) {
  assert.ok(source.includes(field), `The business shop editor should contain ${field}.`);
}
assert.match(source, /syncBusinessShop/, 'Saving a Douyin business shop should automatically sync its hidden browser binding.');
assert.match(source, /保存后系统会自动创建或更新飞鸽客服接入/, 'The editor should explain automatic Feige access.');
