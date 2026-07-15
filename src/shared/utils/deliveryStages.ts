import type { Product } from '../../types/product';

export function resolveProductDeliveryStages(product: Pick<Product, 'level' | 'deliveryStages'>): string[] {
  return (product.deliveryStages || [])
    .map((stage) => String(stage || '').trim())
    .filter(Boolean);
}
