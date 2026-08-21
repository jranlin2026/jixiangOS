import assert from 'node:assert/strict';
import { buildCustomerWhere } from './customerListService';

const risk = buildCustomerWhere({ managementFilter: 'risk' }).strings.join('?');
const stale = buildCustomerWhere({ managementFilter: 'stale_24h' }).strings.join('?');
const intervention = buildCustomerWhere({ managementFilter: 'intervention' }).strings.join('?');
const paymentPending = buildCustomerWhere({ managementFilter: 'payment_pending' }).strings.join('?');

assert.match(risk, /nextActionTitle/);
assert.match(risk, /activityRecords/);
assert.match(stale, /INTERVAL/);
assert.match(intervention, /nextActionDueAt/);
assert.match(paymentPending, /opportunityStageCode/);

console.log('customer management filters: ok');
