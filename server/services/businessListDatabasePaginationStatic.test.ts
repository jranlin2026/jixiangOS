import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orderSource = readFileSync(new URL('./orderQueryService.ts', import.meta.url), 'utf8');
const recoverySource = readFileSync(new URL('./recoveryOrderCommandService.ts', import.meta.url), 'utf8');
const deliverySource = readFileSync(new URL('./deliveryQueryService.ts', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('./businessRecordPageService.ts', import.meta.url), 'utf8');

assert.match(pageSource, /\$queryRaw/, 'shared page query must execute in the database');
assert.match(pageSource, /COUNT\(\*\)/, 'shared page query must count without loading every JSON record');
assert.match(pageSource, /LIMIT/, 'shared page query must limit records in SQL');
assert.match(orderSource, /JSON_TABLE\([\s\S]*\$\.payments/, '订单付款日期筛选必须检查所有分期付款');

const leadSource = readFileSync(new URL('./leadListService.ts', import.meta.url), 'utf8');
assert.match(leadSource, /T00:00:00\.000.*\+08:00/, '线索开始日必须使用上海自然日边界');
assert.match(leadSource, /T23:59:59\.999.*\+08:00/, '线索结束日必须包含上海当天全日');

for (const [name, source] of [
  ['orders', orderSource],
  ['recovery orders', recoverySource],
  ['deliveries', deliverySource],
] as const) {
  assert.match(source, /queryBusinessRecordPage/, `${name} list must page in the database`);
}
