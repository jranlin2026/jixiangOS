import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orderSource = readFileSync(new URL('./orderQueryService.ts', import.meta.url), 'utf8');
const recoverySource = readFileSync(new URL('./recoveryOrderCommandService.ts', import.meta.url), 'utf8');
const deliverySource = readFileSync(new URL('./deliveryQueryService.ts', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('./businessRecordPageService.ts', import.meta.url), 'utf8');

assert.match(pageSource, /\$queryRaw/, 'shared page query must execute in the database');
assert.match(pageSource, /COUNT\(\*\)/, 'shared page query must count without loading every JSON record');
assert.match(pageSource, /LIMIT/, 'shared page query must limit records in SQL');

for (const [name, source] of [
  ['orders', orderSource],
  ['recovery orders', recoverySource],
  ['deliveries', deliverySource],
] as const) {
  assert.match(source, /queryBusinessRecordPage/, `${name} list must page in the database`);
}
