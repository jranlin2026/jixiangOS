import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { createOrderTypeConfigCommandService } from './orderTypeConfigCommandService';

const storage = new Map<string, any>([
  [STORAGE_KEYS.ORDER_TYPE_CONFIGS, [{
    id: 'type-1', name: '旧类型', description: '', isActive: true, sortOrder: 1,
    createdAt: '2026-07-24T00:00:00.000Z', updatedAt: '2026-07-24T00:00:00.000Z',
  }]],
  [STORAGE_KEYS.COMMISSION_RULES, [{ id: 'rule-1', orderType: '旧类型', scene: '旧类型' }]],
]);
const rows = new Map<string, any>([
  ['row-1', {
    id: 'row-1', domain: STORAGE_KEYS.ORDERS, recordId: 'order-1', recordRevision: 0,
    data: { id: 'order-1', orderType: '旧类型', dealScene: '旧类型', updatedAt: '2026-07-24T00:00:00.000Z' },
  }],
]);

const transaction = {
  appStorage: {
    async findUnique({ where }: any) {
      return storage.has(where.key) ? { key: where.key, value: structuredClone(storage.get(where.key)) } : null;
    },
    async upsert({ where, update, create }: any) {
      const value = structuredClone(storage.has(where.key) ? update.value : create.value);
      storage.set(where.key, value);
      return { key: where.key, value };
    },
    async update({ where, data }: any) {
      storage.set(where.key, structuredClone(data.value));
      return { key: where.key, value: structuredClone(data.value) };
    },
  },
  businessRecord: {
    async findMany({ where }: any) {
      return Array.from(rows.values()).filter((row) => row.domain === where.domain).map((row) => structuredClone(row));
    },
    async update({ where, data }: any) {
      const current = rows.get(where.id);
      const next = {
        ...current,
        data: structuredClone(data.data),
        recordRevision: current.recordRevision + Number(data.recordRevision?.increment || 0),
      };
      rows.set(where.id, next);
      return structuredClone(next);
    },
  },
};
const prisma = {
  ...transaction,
  async $transaction(callback: (tx: any) => Promise<any>) { return callback(transaction); },
};

const service = createOrderTypeConfigCommandService(prisma as any);
const result = await service.update('type-1', { name: '新类型' });

assert.equal(result.code, 0);
assert.equal((result.data as any)?.name, '新类型');
assert.equal(storage.get(STORAGE_KEYS.ORDER_TYPE_CONFIGS)[0].name, '新类型');
assert.equal(rows.get('row-1').data.orderType, '新类型');
assert.equal(rows.get('row-1').data.dealScene, '新类型');
assert.equal(rows.get('row-1').recordRevision, 1, '历史订单必须通过单记录更新');
assert.equal(storage.get(STORAGE_KEYS.COMMISSION_RULES)[0].orderType, '新类型');
