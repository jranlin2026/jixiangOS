import assert from 'node:assert/strict';
import { buildCustomerWhere } from './customerListService';

const risk = buildCustomerWhere({ managementFilter: 'risk' }).strings.join('?');
const stale = buildCustomerWhere({ managementFilter: 'stale_24h' }).strings.join('?');
const intervention = buildCustomerWhere({ managementFilter: 'intervention' }).strings.join('?');
const paymentPending = buildCustomerWhere({ managementFilter: 'payment_pending' }).strings.join('?');
const dataIncomplete = buildCustomerWhere({ managementFilter: 'data_incomplete' }).strings.join('?');
const executionException = buildCustomerWhere({ managementFilter: 'execution_exception' }).strings.join('?');
const businessRisk = buildCustomerWhere({ managementFilter: 'business_risk' }).strings.join('?');

assert.match(risk, /nextActionTitle/);
assert.match(risk, /activityRecords/);
assert.match(stale, /INTERVAL/);
assert.match(intervention, /nextActionDueAt/);
assert.match(paymentPending, /opportunityStageCode/);
assert.match(dataIncomplete, /intendedProduct/);
assert.match(executionException, /won/);
assert.match(businessRisk, /INTERVAL/);

console.log('customer management filters: ok');
