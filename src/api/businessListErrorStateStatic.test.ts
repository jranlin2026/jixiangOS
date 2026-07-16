import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orders = readFileSync(new URL('../pages/Orders/index.tsx', import.meta.url), 'utf8');
const recovery = readFileSync(new URL('../pages/AfterSales/RecoveryOrderTab.tsx', import.meta.url), 'utf8');

assert.match(orders, /\{[^}]*\berror\b[^}]*\}\s*=\s*useOrderStore\(\)/s);
assert.match(orders, /error\s*&&\s*\(\s*<Alert severity="error"/s,
  'order list API failures must be visible instead of looking like an empty list');

assert.match(recovery, /const \[loadError, setLoadError\] = useState\(''\)/);
assert.match(recovery, /setLoadError\(listRes\.message/);
assert.match(recovery, /loadError\s*&&\s*\(\s*<Alert severity="error"/s,
  'recovery list API failures must be visible instead of looking like an empty list');
