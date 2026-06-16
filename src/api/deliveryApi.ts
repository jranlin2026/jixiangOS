import type { Delivery, DeliveryFilters, DeliveryTask } from '../types/delivery';
import type { ProductLevel } from '../types/common';
import type { ApiResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS, DELIVERY_STAGES_899, DELIVERY_STAGES_COURSE, DELIVERY_STAGES_AGENT, DELIVERY_STAGES_OEM } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import type { Product } from '../types/product';

function ensureInit(): void {
  initializeMockData();
}

const fallbackStages: Record<string, string[]> = {
  '899': [...DELIVERY_STAGES_899],
  '课程': [...DELIVERY_STAGES_COURSE],
  '代理': [...DELIVERY_STAGES_AGENT],
  '贴牌': [...DELIVERY_STAGES_OEM],
  '合伙人': [...DELIVERY_STAGES_899],
};

function getStagesByProductType(productType: ProductLevel): string[] {
  const products = getStorageData<Product[]>(STORAGE_KEYS.PRODUCTS) || [];
  const product = products.find((p) => p.level === productType && p.isActive) || products.find((p) => p.level === productType);
  return product?.deliveryStages?.length ? product.deliveryStages : (fallbackStages[productType] || fallbackStages['899']);
}

function mergeStages(delivery: Delivery): Delivery {
  const configuredStages = getStagesByProductType(delivery.productType);
  const stages = Array.from(new Set([...configuredStages, ...delivery.stages]));
  const currentStage = stages.includes(delivery.currentStage) ? delivery.currentStage : stages[0];
  return { ...delivery, stages, currentStage };
}

async function fetchDeliveries(filters?: DeliveryFilters): Promise<ApiResponse<Delivery[]>> {
  ensureInit();
  await delay(200);
  const all = (getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || []).map(mergeStages);
  let filtered = [...all];

  if (filters?.productType) {
    filtered = filtered.filter((d) => d.productType === filters.productType);
  }
  if (filters?.stage) {
    filtered = filtered.filter((d) => d.currentStage === filters.stage);
  }
  if (filters?.owner) {
    filtered = filtered.filter((d) => d.owner === filters.owner);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (d) => d.customerName.toLowerCase().includes(q) || d.orderNo.toLowerCase().includes(q),
    );
  }

  return createSuccessResponse(filtered);
}

async function fetchDeliveryById(id: string): Promise<ApiResponse<Delivery | null>> {
  ensureInit();
  await delay(150);
  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  const delivery = deliveries.find((d) => d.id === id);
  return createSuccessResponse(delivery ? mergeStages(delivery) : null);
}

async function fetchDeliveryStagesByProductType(productType: ProductLevel): Promise<ApiResponse<string[]>> {
  ensureInit();
  await delay(100);
  return createSuccessResponse(getStagesByProductType(productType));
}

/** 按产品类型分组交付 */
async function fetchDeliveriesByProductType(productType: ProductLevel): Promise<ApiResponse<Delivery[]>> {
  return fetchDeliveries({ productType });
}

/** 流转交付到下一阶段 */
async function advanceDeliveryStage(id: string, targetStage: string): Promise<ApiResponse<Delivery | null>> {
  ensureInit();
  await delay(300);
  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  const idx = deliveries.findIndex((d) => d.id === id);
  if (idx === -1) return createSuccessResponse(null);

  const delivery = deliveries[idx];
  const mergedDelivery = mergeStages(delivery);
  const targetIdx = mergedDelivery.stages.indexOf(targetStage);

  if (targetIdx === -1) return createSuccessResponse(null);

  delivery.stages = mergedDelivery.stages;
  delivery.currentStage = targetStage;
  delivery.updatedAt = new Date().toISOString();

  // 同步更新子任务状态
  delivery.tasks = delivery.tasks.map((task, taskIdx) => {
    const stageIdx = delivery.stages.findIndex((s) => s === task.title);
    if (stageIdx >= 0 && stageIdx < targetIdx) {
      return { ...task, status: '已完成' as const, completedAt: task.completedAt || new Date().toISOString() };
    }
    if (stageIdx === targetIdx) {
      return { ...task, status: '进行中' as const };
    }
    if (stageIdx > targetIdx) {
      return { ...task, status: '待开始' as const, completedAt: undefined };
    }
    return taskIdx < targetIdx ? { ...task, status: '已完成' as const } : task;
  });

  setStorageData(STORAGE_KEYS.DELIVERIES, deliveries);
  return createSuccessResponse(delivery);
}

/** 更新交付 */
async function updateDelivery(id: string, data: Partial<Delivery>): Promise<ApiResponse<Delivery | null>> {
  ensureInit();
  await delay(200);
  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  const idx = deliveries.findIndex((d) => d.id === id);
  if (idx === -1) return createSuccessResponse(null);
  deliveries[idx] = { ...deliveries[idx], ...data, updatedAt: new Date().toISOString() };
  setStorageData(STORAGE_KEYS.DELIVERIES, deliveries);
  return createSuccessResponse(deliveries[idx]);
}

/** 更新交付子任务状态 */
async function updateDeliveryTask(deliveryId: string, taskId: string, data: Partial<DeliveryTask>): Promise<ApiResponse<Delivery | null>> {
  ensureInit();
  await delay(200);
  const deliveries = getStorageData<Delivery[]>(STORAGE_KEYS.DELIVERIES) || [];
  const delivery = deliveries.find((d) => d.id === deliveryId);
  if (!delivery) return createSuccessResponse(null);

  const taskIdx = delivery.tasks.findIndex((t) => t.id === taskId);
  if (taskIdx === -1) return createSuccessResponse(null);

  delivery.tasks[taskIdx] = { ...delivery.tasks[taskIdx], ...data };
  if (data.status === '已完成') {
    delivery.tasks[taskIdx].completedAt = new Date().toISOString();
  }
  delivery.updatedAt = new Date().toISOString();
  setStorageData(STORAGE_KEYS.DELIVERIES, deliveries);
  return createSuccessResponse(delivery);
}

export const deliveryApi = {
  fetchDeliveries,
  fetchDeliveryById,
  fetchDeliveryStagesByProductType,
  fetchDeliveriesByProductType,
  advanceDeliveryStage,
  updateDelivery,
  updateDeliveryTask,
};
