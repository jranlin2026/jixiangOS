import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orderSource = readFileSync(new URL('./orderQueryService.ts', import.meta.url), 'utf8');
const recoverySource = readFileSync(new URL('./recoveryOrderCommandService.ts', import.meta.url), 'utf8');
const deliverySource = readFileSync(new URL('./deliveryQueryService.ts', import.meta.url), 'utf8');

for (const [name, source] of [
  ['orders', orderSource],
  ['recovery orders', recoverySource],
  ['deliveries', deliverySource],
] as const) {
  assert.match(
    source,
    /scope\.unrestricted\s*&&\s*typeof prisma\.\$queryRaw === ['"]function['"]|typeof prisma\.\$queryRaw === ['"]function['"]\s*&&\s*scope\.unrestricted/,
    `${name} must avoid MySQL JSON filesort for restricted data scopes`,
  );
}
