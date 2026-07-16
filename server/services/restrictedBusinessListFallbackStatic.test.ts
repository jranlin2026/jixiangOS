import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orderSource = readFileSync(new URL('./orderQueryService.ts', import.meta.url), 'utf8');
const recoverySource = readFileSync(new URL('./recoveryOrderCommandService.ts', import.meta.url), 'utf8');
const deliverySource = readFileSync(new URL('./deliveryQueryService.ts', import.meta.url), 'utf8');

const orderList = orderSource.slice(orderSource.indexOf('async listOrders'), orderSource.indexOf('async getOrder'));
const recoveryList = recoverySource.slice(recoverySource.indexOf('async list('), recoverySource.indexOf('async create('));
const deliveryList = deliverySource.slice(deliverySource.indexOf('async list('), deliverySource.indexOf('async get('));

assert.doesNotMatch(orderList, /queryOrderPage|\$queryRaw/,
  'order list must avoid MySQL filesort because its default deletedAt filter reads JSON');
assert.doesNotMatch(recoveryList, /queryRecoveryPage|\$queryRaw/,
  'recovery list must avoid MySQL filesort because its default deletedAt filter reads JSON');
assert.doesNotMatch(deliveryList, /queryDeliveryPage|\$queryRaw/,
  'delivery list must avoid sorting joined JSON rows in MySQL');
