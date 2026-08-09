import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/pages/Settings/AfterSalesSourceConfig.tsx'), 'utf8');

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
