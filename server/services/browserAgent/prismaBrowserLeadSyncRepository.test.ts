import assert from 'node:assert/strict';
import { createPrismaBrowserLeadSyncRepository } from './prismaBrowserLeadSyncRepository';

let row: any = null;
const delegate = {
  async create({ data }: any) {
    if (row) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
    row = {
      ...data,
      leadId: null,
      leadName: null,
      assignedTo: null,
      assignedToId: null,
      intakeStatus: null,
      lastError: null,
      orderRemarkError: null,
    };
    return row;
  },
  async findUnique() {
    return row;
  },
  async update({ data }: any) {
    row = { ...row, ...data };
    return row;
  },
  async updateMany({ where, data }: any) {
    if (!row || row.id !== where.id || row.status !== where.status) return { count: 0 };
    row = {
      ...row,
      ...data,
      attemptCount: row.attemptCount + (data.attemptCount?.increment || 0),
    };
    return { count: 1 };
  },
};

const repository = createPrismaBrowserLeadSyncRepository({ browserLeadSync: delegate } as any);
const reservationInput = {
  platform: 'DOUYIN', shopKey: 'shop-1', platformOrderNo: 'order-1',
  operatorId: 'user-1', operatorName: '客服小李',
  contactSource: 'CHAT' as const,
};

const first = await repository.reserve(reservationInput);
assert.equal(first.acquired, true);
assert.equal(first.record.status, 'PENDING');
assert.equal(first.record.attemptCount, 1);

const duplicate = await repository.reserve(reservationInput);
assert.equal(duplicate.acquired, false);
assert.equal(duplicate.record.id, first.record.id);

await repository.markFailed(first.record.id, '极享OS暂时不可用');
const retry = await repository.reserve(reservationInput);
assert.equal(retry.acquired, true, '失败记录可以被后续重试重新获取');
assert.equal(retry.record.status, 'PENDING');
assert.equal(retry.record.attemptCount, 2);

console.log('browser lead sync repository reservation: ok');
