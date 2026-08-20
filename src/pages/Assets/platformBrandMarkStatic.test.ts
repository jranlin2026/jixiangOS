import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./PlatformBrandMark.tsx', import.meta.url), 'utf8');

assert.match(
  source,
  /variant === 'wecom'[\s\S]*?viewBox="55 10 165 125"[\s\S]*?stroke="#0B7FF3"/,
  '企业微信应使用蓝色圆形对话气泡和四色标识',
);
assert.match(
  source,
  /viewBox="0 0 24 24"[\s\S]*?M6\.6607 18\.9641[\s\S]*?1\.162 1\.9349[\s\S]*?fill="#FA7D18"/,
  '视频号应使用标准橙色双环绕带轮廓',
);
