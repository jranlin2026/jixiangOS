import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ordersSource = readFileSync(
  join(process.cwd(), 'src/pages/Orders/index.tsx'),
  'utf8',
);

const filterToolbarSource = ordersSource.slice(
  ordersSource.indexOf('<ModuleToolbar'),
  ordersSource.indexOf('</ModuleToolbar>'),
);

assert.match(
  filterToolbarSource,
  /<ModuleToolbar\s+sx=\{\{\s*pt:\s*1\.5\s*\}\}>/,
  'Order filters need top padding so floating date labels stay inside the clipped list card.',
);

assert.doesNotMatch(
  filterToolbarSource,
  /<InputLabel>产品等级<\/InputLabel>/,
  'The order list toolbar should not expose a product-level filter.',
);
