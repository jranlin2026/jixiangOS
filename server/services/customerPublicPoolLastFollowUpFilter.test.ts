import assert from 'node:assert/strict';
import { buildCustomerWhere } from './customerListService';

const where = buildCustomerWhere({ lifecycleStatusCode: 'public_pool', owner: '销售乙' });
const sql = where.strings.join('?');

assert.match(sql, /JSON_TABLE/);
assert.match(sql, /activity_type.*follow/s);
assert.match(sql, /activity_operator/);
assert.match(sql, /previousOwner/);
assert.doesNotMatch(sql, /releasedBy/);

console.log('customer public-pool last follow-up filter: ok');
