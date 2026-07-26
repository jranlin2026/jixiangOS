import assert from 'node:assert/strict';
import type { Product } from '../../types/product';
import { canonicalizeOrderItems } from './orderItems';

const products: Product[] = [
  {
    id: 'product-1',
    name: '899智能体',
    level: '899',
    price: 899,
    description: '',
    features: [],
    deliveryStages: ['交付'],
    isActive: true,
    sortOrder: 1,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'product-2',
    name: '29800贴牌',
    level: '贴牌',
    price: 29800,
    description: '',
    features: [],
    deliveryStages: ['交付'],
    isActive: true,
    sortOrder: 2,
    createdAt: '',
    updatedAt: '',
  },
];

const result = canonicalizeOrderItems([
  { id: 'item-stable-1', productId: 'product-1', quantity: 2 },
  { productId: 'product-2', quantity: 1 },
], products);

assert.equal(result.standardTotalAmount, 31598);
assert.equal(result.items[0].id, 'item-stable-1', '正式订单更正时应保留产品明细稳定 ID');
assert.deepEqual(result.items.map((item) => ({
  productId: item.productId,
  productName: item.productName,
  quantity: item.quantity,
  unitPrice: item.unitPrice,
  subtotal: item.subtotal,
  isPrimary: item.isPrimary,
})), [
  {
    productId: 'product-1', productName: '899智能体', quantity: 2, unitPrice: 899, subtotal: 1798, isPrimary: true,
  },
  {
    productId: 'product-2', productName: '29800贴牌', quantity: 1, unitPrice: 29800, subtotal: 29800, isPrimary: false,
  },
]);

assert.throws(
  () => canonicalizeOrderItems([{ productId: 'product-1', quantity: 1 }, { productId: 'product-1', quantity: 2 }], products),
  /不能重复/,
);
assert.throws(
  () => canonicalizeOrderItems([{ productId: 'product-1', quantity: 0 }], products),
  /正整数/,
);
assert.throws(
  () => canonicalizeOrderItems([
    { id: 'duplicate-item', productId: 'product-1', quantity: 1 },
    { id: 'duplicate-item', productId: 'product-2', quantity: 1 },
  ], products),
  /标识重复/,
);

console.log('orderItems tests passed');
