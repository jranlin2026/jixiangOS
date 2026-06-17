import type { ProductLevelConfig } from '../../../types/product';
import { DEFAULT_PRODUCT_LEVEL_CONFIGS } from '../../../shared/utils/constants';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const mockProductLevelConfigs: ProductLevelConfig[] = DEFAULT_PRODUCT_LEVEL_CONFIGS.map((item) => ({
  ...item,
  createdAt: daysAgo(365),
  updatedAt: daysAgo(1),
}));
