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
assert.match(recoveryList, /queryRecoveryPage|\$queryRaw/,
  'unrestricted recovery lists should use indexed ID-first database pagination');
const recoveryPage = recoverySource.slice(recoverySource.indexOf('async function queryRecoveryPage'), recoverySource.indexOf('async function queryRecoverySettlementCounts'));
assert.match(recoveryPage, /orderBy: 'br\.eventAt DESC, br\.createdAt DESC'/,
  'recovery database pagination must use the domain/eventAt/createdAt index order');
assert.doesNotMatch(recoveryPage, /orderBy: 'COALESCE/,
  'recovery database pagination must not reintroduce the filesort expression that exhausted production sort memory');
assert.doesNotMatch(deliveryList, /queryDeliveryPage|\$queryRaw/,
  'delivery list must avoid sorting joined JSON rows in MySQL');
