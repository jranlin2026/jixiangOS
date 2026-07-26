import assert from 'node:assert/strict';
import { buildCustomerWhere } from './customerListService';

const where = buildCustomerWhere({ lifecycleStatusCode: 'public_pool', owner: '销售乙' });
const sql = where.strings.join('?');

assert.match(sql, /previousOwner/);
assert.match(sql, /TRIM\(COALESCE/);
assert.doesNotMatch(sql, /JSON_TABLE/);
assert.doesNotMatch(sql, /activity_operator/);
assert.doesNotMatch(sql, /releasedBy/);

console.log('customer public-pool previous-owner filter: ok');
