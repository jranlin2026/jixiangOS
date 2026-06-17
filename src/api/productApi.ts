import type { Product, ProductLevelConfig } from '../types/product';
import type { ApiResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { PRODUCT_LEVEL_COLOR_MAP, STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import type { Delivery } from '../types/delivery';
import type { Order } from '../types/order';
import type { Customer } from '../types/customer';
import type { Commission, CommissionRule } from '../types/commission';
import type { Refund } from '../types/refund';
import type { UpgradeOpportunity } from '../types/upgrade';
import { mockProductLevelConfigs } from './mock/data/productLevels';

function ensureInit(): void {
  initializeMockData();
  ensureProductLevelConfigs();
}

function ensureProductLevelConfigs(): ProductLevelConfig[] {
  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS) || [];
  const existing = getStorageData<ProductLevelConfig[]>(STORAGE_KEYS.PRODUCT_LEVELS);
  const now = new Date().toISOString();
  let configs = existing?.length ? existing : mockProductLevelConfigs;
  let changed = !existing?.length;

  products.forEach((product) => {
    if (configs.some((config) => config.name === product.level)) return;
    configs = [
      ...configs,
      {
        id: `plc-${uuidv4().slice(0, 8)}`,
        name: product.level,
        color: PRODUCT_LEVEL_COLOR_MAP[product.level] || '#2196F3',
        isActive: true,
        sortOrder: configs.length + 1,
        createdAt: now,
        updatedAt: now,
      },
    ];
    changed = true;
  });

  if (changed) {
    setStorageData(STORAGE_KEYS.PRODUCT_LEVELS, configs);
  }
  return [...configs].sort((a, b) => a.sortOrder - b.sortOrder);
}

function replaceProductLevelReferences(oldName: string, newName: string): void {
  const now = new Date().toISOString();

  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS) || [];
  setStorageData(STORAGE_KEYS.PRODUCTS, products.map((product) => (
    product.level === oldName ? { ...product, level: newName, updatedAt: now } : product
  )));

  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  setStorageData(STORAGE_KEYS.DELIVERIES, deliveries.map((delivery) => (
    delivery.productType === oldName ? { ...delivery, productType: newName, updatedAt: now } : delivery
  )));

  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  setStorageData(STORAGE_KEYS.ORDERS, orders.map((order) => (
    order.productLevel === oldName ? { ...order, productLevel: newName, updatedAt: now } : order
  )));

  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  setStorageData(STORAGE_KEYS.CUSTOMERS, customers.map((customer) => ({
    ...customer,
    productLevel: customer.productLevel === oldName ? newName : customer.productLevel,
    growthPath: customer.growthPath.map((item) => ({
      ...item,
      productLevel: item.productLevel === oldName ? newName : item.productLevel,
    })),
    growthRecords: customer.growthRecords.map((item) => ({
      ...item,
      fromProduct: item.fromProduct === oldName ? newName : item.fromProduct,
      toProduct: item.toProduct === oldName ? newName : item.toProduct,
    })),
    updatedAt: customer.productLevel === oldName ? now : customer.updatedAt,
  })));

  const commissions = getStorageData<Commission[]>(STORAGE_KEYS.COMMISSIONS) || [];
  setStorageData(STORAGE_KEYS.COMMISSIONS, commissions.map((commission) => (
    commission.productLevel === oldName ? { ...commission, productLevel: newName, updatedAt: now } : commission
  )));

  const refunds = getStorageData<Refund[]>(STORAGE_KEYS.REFUNDS) || [];
  setStorageData(STORAGE_KEYS.REFUNDS, refunds.map((refund) => (
    refund.productLevel === oldName ? { ...refund, productLevel: newName, updatedAt: now } : refund
  )));

  const upgradePool = getStorageData<UpgradeOpportunity[]>(STORAGE_KEYS.UPGRADE_POOL) || [];
  setStorageData(STORAGE_KEYS.UPGRADE_POOL, upgradePool.map((item) => ({
    ...item,
    currentProduct: item.currentProduct === oldName ? newName : item.currentProduct,
    targetProduct: item.targetProduct === oldName ? newName : item.targetProduct,
    updatedAt: item.currentProduct === oldName || item.targetProduct === oldName ? now : item.updatedAt,
  })));

  const commissionRules = getStorageData<CommissionRule[]>(STORAGE_KEYS.COMMISSION_RULES) || [];
  setStorageData(STORAGE_KEYS.COMMISSION_RULES, commissionRules.map((rule) => (
    rule.productLevel === oldName ? { ...rule, productLevel: newName } : rule
  )));
}

function syncDeliveryStages(product: Product): void {
  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  const now = new Date().toISOString();
  const next = deliveries.map((delivery) => {
    if (delivery.productType !== product.level) return delivery;
    const stages = Array.from(new Set([...product.deliveryStages, ...delivery.stages]));
    const currentStage = stages.includes(delivery.currentStage) ? delivery.currentStage : stages[0];
    const existingTaskTitles = new Set(delivery.tasks.map((task) => task.title));
    const stageTasks = product.deliveryStages
      .filter((stage) => !existingTaskTitles.has(stage))
      .map((stage, index) => ({
        id: `task-${Date.now()}-${index}`,
        title: stage,
        description: `${stage}阶段任务`,
        status: '待开始' as const,
        records: [],
      }));

    return {
      ...delivery,
      stages,
      currentStage,
      tasks: [...delivery.tasks, ...stageTasks],
      updatedAt: now,
    };
  });
  setStorageData(STORAGE_KEYS.DELIVERIES, next);
}

async function getProducts(): Promise<ApiResponse<Product[]>> {
  ensureInit();
  await delay(200);
  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS) || [];
  return createSuccessResponse(products.filter((p) => p.isActive));
}

async function getAllProducts(): Promise<ApiResponse<Product[]>> {
  ensureInit();
  await delay(200);
  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS) || [];
  return createSuccessResponse([...products].sort((a, b) => a.sortOrder - b.sortOrder));
}

async function getProductById(id: string): Promise<ApiResponse<Product | null>> {
  ensureInit();
  await delay(150);
  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS) || [];
  return createSuccessResponse(products.find((p) => p.id === id) || null);
}

async function getProductLevelConfigs(): Promise<ApiResponse<ProductLevelConfig[]>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(ensureProductLevelConfigs());
}

async function createProductLevelConfig(
  data: Omit<ProductLevelConfig, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<ApiResponse<ProductLevelConfig | null>> {
  ensureInit();
  await delay(150);
  const configs = ensureProductLevelConfigs();
  const name = data.name.trim();
  if (!name) return createErrorResponse('等级名称不能为空');
  if (configs.some((config) => config.name === name)) return createErrorResponse('等级名称已存在');
  const now = new Date().toISOString();
  const config: ProductLevelConfig = {
    ...data,
    name,
    id: `plc-${uuidv4().slice(0, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.PRODUCT_LEVELS, [...configs, config]);
  return createSuccessResponse(config);
}

async function updateProductLevelConfig(
  id: string,
  data: Partial<Omit<ProductLevelConfig, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<ApiResponse<ProductLevelConfig | null>> {
  ensureInit();
  await delay(150);
  const configs = ensureProductLevelConfigs();
  const idx = configs.findIndex((config) => config.id === id);
  if (idx === -1) return createSuccessResponse(null);
  const oldName = configs[idx].name;
  const nextName = typeof data.name === 'string' ? data.name.trim() : oldName;
  if (!nextName) return createErrorResponse('等级名称不能为空');
  if (configs.some((config) => config.id !== id && config.name === nextName)) {
    return createErrorResponse('等级名称已存在');
  }

  const updated: ProductLevelConfig = {
    ...configs[idx],
    ...data,
    name: nextName,
    updatedAt: new Date().toISOString(),
  };
  const next = [...configs];
  next[idx] = updated;
  setStorageData(STORAGE_KEYS.PRODUCT_LEVELS, next);
  if (oldName !== nextName) {
    replaceProductLevelReferences(oldName, nextName);
  }
  return createSuccessResponse(updated);
}

async function deleteProductLevelConfig(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const configs = ensureProductLevelConfigs();
  const target = configs.find((config) => config.id === id);
  if (!target) return createSuccessResponse(false);
  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS) || [];
  if (products.some((product) => product.level === target.name)) {
    return createErrorResponse('已有产品使用该等级，不能删除');
  }
  setStorageData(STORAGE_KEYS.PRODUCT_LEVELS, configs.filter((config) => config.id !== id));
  return createSuccessResponse(true);
}

async function createProduct(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Product>> {
  ensureInit();
  await delay(200);
  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS) || [];
  const now = new Date().toISOString();
  const newProduct: Product = {
    ...data,
    id: `prod-${uuidv4().slice(0, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  products.push(newProduct);
  setStorageData(STORAGE_KEYS.PRODUCTS, products);
  syncDeliveryStages(newProduct);
  return createSuccessResponse(newProduct);
}

async function updateProduct(id: string, data: Partial<Product>): Promise<ApiResponse<Product | null>> {
  ensureInit();
  await delay(200);
  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS) || [];
  const idx = products.findIndex((p) => p.id === id);
  if (idx === -1) return createSuccessResponse(null);
  products[idx] = { ...products[idx], ...data, updatedAt: new Date().toISOString() };
  setStorageData(STORAGE_KEYS.PRODUCTS, products);
  syncDeliveryStages(products[idx]);
  return createSuccessResponse(products[idx]);
}

async function deleteProduct(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS) || [];
  setStorageData(STORAGE_KEYS.PRODUCTS, products.filter((p) => p.id !== id));
  return createSuccessResponse(true);
}

export const productApi = {
  getProducts,
  getAllProducts,
  getProductById,
  getProductLevelConfigs,
  createProductLevelConfig,
  updateProductLevelConfig,
  deleteProductLevelConfig,
  createProduct,
  updateProduct,
  deleteProduct,
};
