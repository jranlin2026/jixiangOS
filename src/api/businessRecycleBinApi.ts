import type { BusinessRecycleBinFilters, BusinessRecycleBinItem, BusinessRecycleBinType } from '../types/businessRecycleBin';
import type { Customer } from '../types/customer';
import type { Lead } from '../types/lead';
import type { Order } from '../types/order';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { backendRequest, shouldUseBackendApi } from './backendClient';
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
    const linkedCustomerExists = Boolean(
      lead.customerId
      && (getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [])
        .some((customer) => customer.id === lead.customerId),
    );
    return {
      id: lead.id,
      type,
      title: lead.name,
      subtitle: lead.company || lead.phone,
      owner: lead.assignedTo || lead.owner,
      deletedAt: lead.deletedAt || '',
      deletedBy: lead.deletedBy,
      deleteReason: lead.deleteReason,
      relationStatus: linkedCustomerExists ? '已关联客户' : '未关联客户',
      purgeBlockedReason: linkedCustomerExists ? '请从关联客户统一永久删除' : undefined,
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
  if (shouldUseBackendApi()) {
    const params = new URLSearchParams();
    if (filters.type) params.set('type', filters.type);
    if (filters.search) params.set('search', filters.search);
    if (filters.page) params.set('page', String(filters.page));
    if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
    const suffix = params.size ? `?${params.toString()}` : '';
    return backendRequest<PaginatedResponse<BusinessRecycleBinItem>>(`/business-recycle-bin${suffix}`);
  }
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
  if (shouldUseBackendApi()) {
    if (type === 'lead' || type === 'customer') {
      return createErrorResponse('服务器模式暂不支持恢复线索或客户；记录级恢复命令完成前已安全禁用', 409);
    }
    return backendRequest<boolean>(`/business-recycle-bin/${type}/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
    });
  }
  ensureInit();
  await delay(120);

  const rows = readRows(type);
  const index = rows.findIndex((item) => item.id === id);
  if (index === -1 || !isDeleted(rows[index])) return createErrorResponse(`${getTypeLabel(type)}不在业务回收站中`);

  const now = new Date().toISOString();
  const deletionCascadeId = (rows[index] as Customer | Lead).deletionCascadeId;
  if (deletionCascadeId && (type === 'lead' || type === 'customer')) {
    const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
    const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
    setStorageData(STORAGE_KEYS.CUSTOMERS, customers.map((customer) => customer.deletionCascadeId === deletionCascadeId
      ? {
        ...customer, deletedAt: undefined, deletedBy: undefined, deleteReason: undefined,
        deletionCascadeId: undefined, cascadeDeletedLeadIds: undefined, updatedAt: now,
      }
      : customer));
    setStorageData(STORAGE_KEYS.LEADS, leads.map((lead) => lead.deletionCascadeId === deletionCascadeId
      ? {
        ...lead, deletedAt: undefined, deletedBy: undefined, deleteReason: undefined,
        deletionCascadeId: undefined, updatedAt: now,
      }
      : lead));
    return createSuccessResponse(true);
  }
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

  if (shouldUseBackendApi()) {
    return backendRequest<boolean>(`/business-recycle-bin/${type}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason: normalizedReason }),
    });
  }

  const rows = readRows(type);
  const target = rows.find((item) => item.id === id);
  if (!target || !isDeleted(target)) return createErrorResponse(`${getTypeLabel(type)}不在业务回收站中`);

  if (type === 'customer') {
    const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
    const linkedLeads = leads.filter((lead) => lead.customerId === id);
    if (linkedLeads.some((lead) => !isDeleted(lead))) {
      return createErrorResponse('客户仍有关联的有效线索，不能永久删除');
    }
    setStorageData(
      STORAGE_KEYS.LEADS,
      leads.filter((lead) => lead.customerId !== id),
    );
  }
  if (type === 'lead') {
    const lead = target as Lead;
    const linkedCustomerId = String(lead.customerId || '').trim();
    const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
    if (linkedCustomerId && customers.some((customer) => customer.id === linkedCustomerId)) {
      return createErrorResponse('该线索仍关联客户，请从关联客户统一永久删除');
    }
  }
  saveRows(type, rows.filter((item) => item.id !== id));
  return createSuccessResponse(true);
}

export const businessRecycleBinApi = {
  fetchRecycleBinItems,
  restoreRecycleBinItem,
  permanentlyDeleteRecycleBinItem,
};
