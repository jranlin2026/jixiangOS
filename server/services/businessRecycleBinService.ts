import { failure, success } from '../api/response';
import { DEFAULT_PAGE_SIZE } from '../../src/shared/utils/constants';
import { isSuperAdmin } from '../../src/shared/utils/permissions';
import type { ApiResponse, PaginatedResponse } from '../../src/api/types';
import type {
  BusinessRecycleBinFilters,
  BusinessRecycleBinItem,
  BusinessRecycleBinType,
} from '../../src/types/businessRecycleBin';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer } from '../../src/types/customer';
import type { Lead } from '../../src/types/lead';
import type { Order } from '../../src/types/order';
import type { BusinessRecycleBinRepository } from './businessRecycleBinRepository';

type RecyclableRecord = Customer | Lead | Order;

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

function parseRecord(data: unknown): RecyclableRecord | null {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    return parsed && typeof parsed === 'object' ? parsed as RecyclableRecord : null;
  } catch {
    return null;
  }
}

function toItem(type: BusinessRecycleBinType, record: RecyclableRecord): BusinessRecycleBinItem {
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
    return {
      id: customer.id,
      type,
      title: customer.name,
      subtitle: customer.company || customer.phone,
      owner: customer.owner,
      deletedAt: customer.deletedAt || '',
      deletedBy: customer.deletedBy,
      deleteReason: customer.deleteReason,
      relationStatus: customer.cascadeDeletedLeadIds?.length
        ? `联合删除线索 ${customer.cascadeDeletedLeadIds.length} 条`
        : '已删除客户',
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

export function createBusinessRecycleBinService(repository: BusinessRecycleBinRepository) {
  return {
    async list(
      filters: BusinessRecycleBinFilters = {},
      currentUser?: AuthenticatedUser | null,
    ): Promise<ApiResponse<PaginatedResponse<BusinessRecycleBinItem> | null>> {
      if (!isSuperAdmin(currentUser)) return failure('仅超级管理员可以管理业务回收站', 403);
      const requestedType = filters.type && filters.type !== 'all' ? filters.type : null;
      const search = String(filters.search || '').trim().toLowerCase();
      const page = positiveInt(filters.page, 1);
      const pageSize = Math.min(positiveInt(filters.pageSize, DEFAULT_PAGE_SIZE), 100);
      const { rows, total } = await repository.listDeleted({
        type: requestedType || undefined,
        search: search || undefined,
        offset: (page - 1) * pageSize,
        limit: pageSize,
      });
      const items = rows
        .map((row) => ({ type: row.type, record: parseRecord(row.data) }))
        .filter((entry): entry is { type: BusinessRecycleBinType; record: RecyclableRecord } => (
          Boolean(entry.record?.id && entry.record.deletedAt)
        ))
        .map(({ type, record }) => toItem(type, record))
        .sort((left, right) => new Date(right.deletedAt).getTime() - new Date(left.deletedAt).getTime());
      return success({
        items,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    },
  };
}
