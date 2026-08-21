import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');

assert.match(config, /loadEnv\(/, '前端构建应显式解析后端模式配置');
assert.match(
  config,
  /VITE_USE_BACKEND_API[^\n]+\?\?\s*['"]true['"]/,
  '未配置 VITE_USE_BACKEND_API 时应默认使用后端，避免内容库与发布计划分裂数据源',
);
assert.match(
  config,
  /import\.meta\.env\.VITE_USE_BACKEND_API/,
  '默认后端模式必须注入浏览器构建',
);
