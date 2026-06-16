import type { Product } from '../types/product';
import type { ApiResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import type { Delivery } from '../types/delivery';

function ensureInit(): void {
  initializeMockData();
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
  createProduct,
  updateProduct,
  deleteProduct,
};
