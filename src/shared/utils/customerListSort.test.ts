import assert from 'node:assert/strict';
import test from 'node:test';
import type { Customer } from '../../types/customer';
import { sortCustomersForList } from './customerListSort';

const customer = (id: string, createdAt: string, updatedAt: string, sourcePaymentAt?: string | null) => ({
  id,
  createdAt,
  updatedAt,
  sourcePaymentAt,
} as Customer);

const rows = [
  customer('without-payment', '2026-08-13T12:00:00.000Z', '2026-08-13T12:00:00.000Z', null),
  customer('older-payment', '2026-08-10T12:00:00.000Z', '2026-08-14T12:00:00.000Z', '2026-08-11T12:00:00.000Z'),
  customer('newer-payment', '2026-08-11T12:00:00.000Z', '2026-08-12T12:00:00.000Z', '2026-08-12T12:00:00.000Z'),
];

test('客户列表三种排序在分页前返回稳定顺序', () => {
  assert.deepEqual(sortCustomersForList(rows, 'created_at').map(({ id }) => id), ['without-payment', 'newer-payment', 'older-payment']);
  assert.deepEqual(sortCustomersForList(rows, 'recent_activity').map(({ id }) => id), ['older-payment', 'without-payment', 'newer-payment']);
  assert.deepEqual(sortCustomersForList(rows, 'platform_payment').map(({ id }) => id), ['newer-payment', 'older-payment', 'without-payment']);
});

test('平台付款时间相同或为空时用 ID 倒序保证跨页顺序稳定', () => {
  const sameTime = [
    customer('a', '2026-08-10T12:00:00.000Z', '2026-08-10T12:00:00.000Z', null),
    customer('b', '2026-08-10T12:00:00.000Z', '2026-08-10T12:00:00.000Z', null),
    customer('c', '2026-08-10T12:00:00.000Z', '2026-08-10T12:00:00.000Z', '2026-08-12T12:00:00.000Z'),
    customer('d', '2026-08-10T12:00:00.000Z', '2026-08-10T12:00:00.000Z', '2026-08-12T12:00:00.000Z'),
  ];
  assert.deepEqual(sortCustomersForList(sameTime, 'platform_payment').map(({ id }) => id), ['d', 'c', 'b', 'a']);
});
