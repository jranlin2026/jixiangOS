import type { BusinessRecycleBinFilters, BusinessRecycleBinItem, BusinessRecycleBinType } from '../types/businessRecycleBin';
import type { Customer } from '../types/customer';
import type { Lead } from '../types/lead';
import type { Order } from '../types/order';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { shouldUseBackendApi } from './backendClient';
import { DEFAULT_PAGE_SIZE, STORAGE_KEYS } from '../shared/utils/constants';
import { getCurrentOperatorUser } from '../shared/utils/currentOperator';
import { isSuperAdminRoleName } from '../shared/utils/roles';
import { initializeMockData } from './mock';

type RecyclableRecord = Lead | Customer | Order;

function ensureInit(): void {
  initializeMockData();
}

function isDeleted(record: { deletedAt?: string }): boolean {
  return Boolean(record.deletedAt);
}

function requireSuperAdmin(): ApiResponse<null> | null {
  const currentUser = getCurrentOperatorUser();
  if (!currentUser || !isSuperAdminRoleName(currentUser.role)) {
    return createErrorResponse('仅超级管理员可以管理业务回收站');
  }
  return null;
}

function readRows(type: BusinessRecycleBinType): RecyclableRecord[] {
  if (type === 'lead') return getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  if (type === 'customer') return getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  return getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
}

function saveRows(type: BusinessRecycleBinType, rows: RecyclableRecord[]): void {
  if (type === 'lead') setStorageData(STORAGE_KEYS.LEADS, rows as Lead[]);
  else if (type === 'customer') setStorageData(STORAGE_KEYS.CUSTOMERS, rows as Customer[]);
  else setStorageData(STORAGE_KEYS.ORDERS, rows as Order[]);
}

function countRelatedOrders(customer: Customer): number {
  return (getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [])
    .filter((order) => !isDeleted(order))
    .filter((order) => (
      order.customerId === customer.id
      || order.customerName === customer.company
      || order.customerName === customer.name
    )).length;
}

function toRecycleItem(type: BusinessRecycleBinType, record: RecyclableRecord): BusinessRecycleBinItem {
  if (type === 'lead') {
    const lead = record as Lead;
    return {
      id: lead.id,
      type,
      title: lead.name,
      subtitle: lead.company || lead.phone,
      owner: lead.assignedTo || lead.owner,
      deletedAt: lead.deletedAt || '',
      deletedBy: lead.deletedBy,
      deleteReason: lead.deleteReason,
      relationStatus: lead.customerId ? '已关联客户' : '未关联客户',
    };
  }

  if (type === 'customer') {
    const customer = record as Customer;
    const relatedOrderCount = countRelatedOrders(customer);
    return {
      id: customer.id,
      type,
      title: customer.name,
      subtitle: customer.company || customer.phone,
      owner: customer.owner,
      deletedAt: customer.deletedAt || '',
      deletedBy: customer.deletedBy,
      deleteReason: customer.deleteReason,
      relationStatus: relatedOrderCount ? `关联订单 ${relatedOrderCount} 笔` : '无有效订单',
    };
  }

  const order = record as Order;
  return {
    id: order.id,
    type,
    title: order.orderNo,
    subtitle: order.customerName,
    owner: order.salesName || order.owner,
    deletedAt: order.deletedAt || '',
    deletedBy: order.deletedBy,
    deleteReason: order.deleteReason,
    relationStatus: '订单已移入回收站',
  };
}

function getTypeLabel(type: BusinessRecycleBinType): string {
  if (type === 'lead') return '线索';
  if (type === 'customer') return '客户';
  return '订单';
}

async function fetchRecycleBinItems(filters: BusinessRecycleBinFilters = {}): Promise<ApiResponse<PaginatedResponse<BusinessRecycleBinItem>>> {
  ensureInit();
  await delay(120);
  const forbidden = requireSuperAdmin();
  if (forbidden) return createErrorResponse(forbidden.message || '仅超级管理员可以管理业务回收站');

  const types: BusinessRecycleBinType[] = filters.type && filters.type !== 'all'
    ? [filters.type]
    : ['lead', 'customer', 'order'];
  let items = types.flatMap((type) => readRows(type).filter(isDeleted).map((record) => toRecycleItem(type, record)));

  if (filters.search) {
    const q = filters.search.toLowerCase();
    items = items.filter((item) => (
      item.title.toLowerCase().includes(q)
      || (item.subtitle || '').toLowerCase().includes(q)
      || (item.owner || '').toLowerCase().includes(q)
    ));
  }

  items.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  const page = filters.page || 1;
  const pageSize = filters.pageSize || DEFAULT_PAGE_SIZE;
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  return createSuccessResponse({
    items: items.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total, totalPages },
  });
}

async function restoreRecycleBinItem(type: BusinessRecycleBinType, id: string): Promise<ApiResponse<boolean>> {
  const forbidden = requireSuperAdmin();
  if (forbidden) return createErrorResponse(forbidden.message || '仅超级管理员可以管理业务回收站');
  if (shouldUseBackendApi() && (type === 'lead' || type === 'customer')) {
    return createErrorResponse('服务器模式暂不支持恢复线索或客户；记录级恢复命令完成前已安全禁用', 409);
  }
  ensureInit();
  await delay(120);

  const rows = readRows(type);
  const index = rows.findIndex((item) => item.id === id);
  if (index === -1 || !isDeleted(rows[index])) return createErrorResponse(`${getTypeLabel(type)}不在业务回收站中`);

  const now = new Date().toISOString();
  rows[index] = {
    ...rows[index],
    deletedAt: undefined,
    deletedBy: undefined,
    deleteReason: undefined,
    updatedAt: now,
  } as RecyclableRecord;
  saveRows(type, rows);
  return createSuccessResponse(true);
}

async function permanentlyDeleteRecycleBinItem(type: BusinessRecycleBinType, id: string, reason: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(120);
  const forbidden = requireSuperAdmin();
  if (forbidden) return createErrorResponse(forbidden.message || '仅超级管理员可以管理业务回收站');

  const normalizedReason = reason.trim();
  if (!normalizedReason) return createErrorResponse('永久删除必须填写原因');

  if (shouldUseBackendApi() && (type === 'lead' || type === 'customer')) {
    return createErrorResponse('服务器模式暂不支持永久删除线索或客户，请先保留在业务回收站');
  }

  const rows = readRows(type);
  const target = rows.find((item) => item.id === id);
  if (!target || !isDeleted(target)) return createErrorResponse(`${getTypeLabel(type)}不在业务回收站中`);

  saveRows(type, rows.filter((item) => item.id !== id));
  return createSuccessResponse(true);
}

export const businessRecycleBinApi = {
  fetchRecycleBinItems,
  restoreRecycleBinItem,
  permanentlyDeleteRecycleBinItem,
};
