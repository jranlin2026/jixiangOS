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
import {
  BusinessRecycleBinCommandError,
  type BusinessRecycleBinRepository,
} from './businessRecycleBinRepository';

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

function toItem(
  type: BusinessRecycleBinType,
  record: RecyclableRecord,
  linkedCustomerExists = false,
): BusinessRecycleBinItem {
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
      relationStatus: linkedCustomerExists ? '已关联客户' : '未关联客户',
      purgeBlockedReason: linkedCustomerExists ? '请从关联客户统一永久删除' : undefined,
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
        .map((row) => ({
          type: row.type,
          record: parseRecord(row.data),
          linkedCustomerExists: row.linkedCustomerExists,
        }))
        .filter((entry): entry is {
          type: BusinessRecycleBinType;
          record: RecyclableRecord;
          linkedCustomerExists: boolean | undefined;
        } => (
          Boolean(entry.record?.id && entry.record.deletedAt)
        ))
        .map(({ type, record, linkedCustomerExists }) => (
          toItem(type, record, linkedCustomerExists)
        ))
        .sort((left, right) => new Date(right.deletedAt).getTime() - new Date(left.deletedAt).getTime());
      return success({
        items,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    },
    async restore(
      type: BusinessRecycleBinType,
      id: string,
      currentUser?: AuthenticatedUser | null,
    ): Promise<ApiResponse<boolean | null>> {
      if (!isSuperAdmin(currentUser)) return failure<boolean>('仅超级管理员可以管理业务回收站', 403);
      if (type !== 'order') return failure<boolean>('服务器模式暂不支持恢复线索或客户', 409);
      const cleanId = String(id || '').trim();
      if (!cleanId) return failure<boolean>('订单ID不能为空', 400);
      try {
        await repository.restoreOrder(cleanId, currentUser!.name);
        return success(true);
      } catch (error) {
        if (error instanceof BusinessRecycleBinCommandError) return failure<boolean>(error.message, error.responseCode);
        throw error;
      }
    },
    async purge(
      type: BusinessRecycleBinType,
      id: string,
      reason: string,
      currentUser?: AuthenticatedUser | null,
    ): Promise<ApiResponse<boolean | null>> {
      if (!isSuperAdmin(currentUser)) return failure<boolean>('仅超级管理员可以管理业务回收站', 403);
      if (!['lead', 'customer', 'order'].includes(type)) return failure<boolean>('不支持的业务记录类型', 400);
      const cleanId = String(id || '').trim();
      const cleanReason = String(reason || '').trim();
      if (!cleanId) return failure<boolean>('业务记录ID不能为空', 400);
      if (!cleanReason) return failure<boolean>('永久删除必须填写原因', 400);
      try {
        await repository.purge(type, cleanId, cleanReason, currentUser!.name);
        return success(true);
      } catch (error) {
        if (error instanceof BusinessRecycleBinCommandError) return failure<boolean>(error.message, error.responseCode);
        throw error;
      }
    },
  };
}
