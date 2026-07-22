import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/pages/Settings/AfterSalesSourceConfig.tsx'), 'utf8');

assert.match(
  source,
  /flexDirection:\s*\{\s*xs:\s*'column',\s*sm:\s*'row'\s*\}/,
  'The add-platform controls should stack on narrow screens instead of squeezing the action button.',
);

assert.match(
  source,
  /data-testid="add-after-sales-platform"[\s\S]*?minWidth:\s*112[\s\S]*?whiteSpace:\s*'nowrap'[\s\S]*?flexShrink:\s*0/,
  'The add-platform button should keep a stable width and render its label on one line.',
);
