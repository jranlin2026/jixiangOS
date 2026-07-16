import type { Product } from '../../types/product';
import type { DeliveryTask } from '../../types/delivery';

export function resolveProductDeliveryStages(product: Pick<Product, 'level' | 'deliveryStages'>): string[] {
  return (product.deliveryStages || [])
    .map((stage) => String(stage || '').trim())
    .filter(Boolean);
}

export function resolveLatestCompletedDeliveryStage(
  stages: string[],
  tasks: DeliveryTask[],
  fallback = '',
): string {
  let latestStageIndex = -1;
  tasks.forEach((task) => {
    if (task.status !== '已完成' && !task.completedAt) return;
    latestStageIndex = Math.max(latestStageIndex, stages.indexOf(task.title));
  });
  return stages[latestStageIndex >= 0 ? latestStageIndex : 0] || fallback;
}
