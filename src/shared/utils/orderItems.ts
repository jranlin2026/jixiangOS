import type { OrderItem, OrderItemInput } from '../../types/order';
import type { Product } from '../../types/product';

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function canonicalizeOrderItems(
  inputs: OrderItemInput[],
  products: Product[],
): { items: OrderItem[]; standardTotalAmount: number } {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('请至少添加一个产品');
  const productById = new Map(products.map((product) => [product.id, product]));
  const seen = new Set<string>();
  const seenItemIds = new Set<string>();
  const explicitPrimaryIndex = inputs.findIndex((item) => item.isPrimary);
  const primaryIndex = explicitPrimaryIndex >= 0 ? explicitPrimaryIndex : 0;

  const items = inputs.map((input, index): OrderItem => {
    const productId = String(input.productId || '').trim();
    if (!productId) throw new Error(`第 ${index + 1} 项产品不能为空`);
    if (seen.has(productId)) throw new Error('同一产品不能重复添加，请直接修改数量');
    seen.add(productId);
    const product = productById.get(productId);
    if (!product || product.isActive === false) throw new Error(`第 ${index + 1} 项产品不存在或已停用`);
    const quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 999) {
      throw new Error('产品数量必须是 1-999 的正整数');
    }
    const unitPrice = money(Number(product.price));
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`产品“${product.name}”价格无效`);
    const itemId = String(input.id || '').trim() || `item-${crypto.randomUUID()}`;
    if (seenItemIds.has(itemId)) throw new Error('产品明细标识重复，请刷新后重试');
    seenItemIds.add(itemId);
    return {
      id: itemId,
      productId: product.id,
      productName: product.name,
      productLevel: product.level,
      unitPrice,
      quantity,
      subtotal: money(unitPrice * quantity),
      isPrimary: index === primaryIndex,
      sortOrder: index + 1,
    };
  });

  return {
    items,
    standardTotalAmount: money(items.reduce((sum, item) => sum + item.subtotal, 0)),
  };
}

export function allocateOrderItemActualAmounts(items: OrderItem[], actualAmount: number): OrderItem[] {
  const totalCents = Math.round(Number(actualAmount) * 100);
  const standardTotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  let allocatedCents = 0;
  return items.map((item, index) => {
    const itemCents = index === items.length - 1
      ? totalCents - allocatedCents
      : Math.round(totalCents * (standardTotal > 0 ? item.subtotal / standardTotal : 1 / items.length));
    allocatedCents += itemCents;
    return { ...item, allocatedActualAmount: itemCents / 100 };
  });
}
