import assert from 'node:assert/strict';
import { canonicalizePurchaseSnapshot } from './customerPurchaseSnapshotPolicy';

const products = new Map([
  ['product-active', {
    id: 'row-active',
    data: {
      id: 'product-active', name: 'IP口播智能体', price: 899, level: 'AI产品', isActive: true,
      description: '', features: [], deliveryStages: [], sortOrder: 1, createdAt: '', updatedAt: '',
    },
  }],
  ['product-disabled', {
    id: 'row-disabled',
    data: {
      id: 'product-disabled', name: '历史产品', price: 100, level: 'AI产品', isActive: false,
      description: '', features: [], deliveryStages: [], sortOrder: 2, createdAt: '', updatedAt: '',
    },
  }],
]);

const tx = {
  businessRecord: {
    findUnique: async ({ where }: { where: { domain_recordId: { recordId: string } } }) => (
      products.get(where.domain_recordId.recordId) || null
    ),
  },
} as never;

const canonical = await canonicalizePurchaseSnapshot(tx, {
  sourceProductId: 'product-active',
  sourceProductName: '伪造名称',
  sourcePaymentAmount: 699,
});
assert.deepEqual(canonical, {
  sourceProductId: 'product-active',
  sourceProductName: 'IP口播智能体',
  sourcePaymentAmount: 699,
});

await assert.rejects(
  canonicalizePurchaseSnapshot(tx, { sourceProductId: 'missing', sourceProductName: '任意产品' }),
  /平台购买产品不存在/,
);
await assert.rejects(
  canonicalizePurchaseSnapshot(tx, { sourceProductId: 'product-disabled' }),
  /平台购买产品已停用/,
);
assert.equal(
  (await canonicalizePurchaseSnapshot(
    tx,
    { sourceProductId: 'product-disabled' },
    { existingProductId: 'product-disabled' },
  )).sourceProductName,
  '历史产品',
);
await assert.rejects(
  canonicalizePurchaseSnapshot(tx, { sourcePaymentAmount: -0.01 }),
  /平台付款金额必须是大于或等于 0/,
);
await assert.rejects(
  canonicalizePurchaseSnapshot(tx, { sourcePaymentAmount: true }),
  /平台付款金额必须是大于或等于 0/,
);
await assert.rejects(
  canonicalizePurchaseSnapshot(tx, { sourcePaymentAmount: ' ' }),
  /平台付款金额必须是大于或等于 0/,
);

console.log('customer purchase snapshot policy: ok');
