import { randomUUID } from 'node:crypto';
import type { Customer } from '../../src/types/customer';
import type { CustomerMergeConfidence, CustomerMergeStatus } from '../../src/types/customerMerge';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { canManageCustomer, canReadCustomer, type CustomerAccessContext } from './customerAccessPolicy';
import { sha256Json } from './customerBatchPrecheckService';

export interface DuplicateContactConflict {
  type: 'phone' | 'wechat' | 'name_company';
  activeCustomerIds: string[];
}

export interface DuplicateGroupListItem {
  id: string;
  rule: string;
  confidence: CustomerMergeConfidence;
  status: CustomerMergeStatus;
  customerIds: string[];
  visibleCustomers: Array<Pick<Customer, 'id' | 'name' | 'company' | 'phone' | 'wechat' | 'owner' | 'ownerId' | 'ownerIdentityStatus' | 'lifecycleStatusCode'>>;
  createdAt: Date;
  resolvedAt?: Date;
  mergeLedgerId?: string;
}

type DuplicateStore = {
  customerDuplicateGroup: {
    upsert(args: unknown): Promise<any>;
    findUnique(args: unknown): Promise<any>;
    findMany(args?: unknown): Promise<any[]>;
  };
  businessRecord: { findMany(args?: unknown): Promise<any[]> };
};

export interface CreateDuplicateCandidateGroupInput {
  rule: 'phone' | 'wechat' | 'name_company' | 'manual';
  customerIds: string[];
  confidence?: CustomerMergeConfidence;
  contactIdentityId?: string;
  sourceJobId?: string;
  createdById?: string;
}

export function classifyContactIdentityConflict(
  conflict: DuplicateContactConflict,
): { confidence: CustomerMergeConfidence } {
  return { confidence: conflict.type === 'name_company' ? 'possible' : 'high' };
}

export function redactOutOfScopeConflict(
  conflict: { customerId: string; customerName: string; ownerName: string },
  canRead: boolean,
): { code: string; message: string; customerId?: string; customerName?: string; ownerName?: string } {
  return canRead
    ? { code: 'CONTACT_EXISTS', message: '系统中已存在相同联系方式', ...conflict }
    : { code: 'CONTACT_EXISTS_OUT_OF_SCOPE', message: '系统中已存在相同联系方式' };
}

function normalizeCustomerIds(customerIds: string[]): string[] {
  return Array.from(new Set(customerIds.map((id) => String(id || '').trim()).filter(Boolean))).sort();
}

export function customerDuplicateGroupKey(rule: string, customerIds: string[]): string {
  return sha256Json({ rule, customerIds: normalizeCustomerIds(customerIds) });
}

function parseCustomer(row: any): Customer | null {
  const value = typeof row?.data === 'string' ? JSON.parse(row.data) : row?.data;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Customer : null;
}

function confidenceFor(input: CreateDuplicateCandidateGroupInput): CustomerMergeConfidence {
  if (input.confidence) return input.confidence;
  if (input.rule === 'manual') return 'manual';
  return classifyContactIdentityConflict({ type: input.rule, activeCustomerIds: input.customerIds }).confidence;
}

export async function createDuplicateCandidateGroup(
  store: DuplicateStore,
  input: CreateDuplicateCandidateGroupInput,
): Promise<any> {
  const customerIds = normalizeCustomerIds(input.customerIds);
  if (customerIds.length < 2 || customerIds.length > 10) {
    throw new Error('DUPLICATE_GROUP_REQUIRES_TWO_TO_TEN_CUSTOMERS');
  }
  const groupKey = customerDuplicateGroupKey(input.rule, customerIds);
  return store.customerDuplicateGroup.upsert({
    where: { groupKey },
    update: {},
    create: {
      id: `cdg_${randomUUID()}`,
      groupKey,
      rule: input.rule,
      confidence: confidenceFor(input),
      status: 'open',
      customerIds,
      contactIdentityId: input.contactIdentityId || null,
      sourceJobId: input.sourceJobId || null,
      createdById: input.createdById || null,
    },
  });
}

function assertMergePermission(context: CustomerAccessContext): void {
  if (!context.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_MERGE)) {
    throw new Error('无权合并客户');
  }
}

async function customersByIds(store: DuplicateStore, ids: string[]): Promise<Map<string, Customer>> {
  const rows = await store.businessRecord.findMany({
    where: { domain: STORAGE_KEYS.CUSTOMERS, recordId: { in: ids } },
  });
  const customers = rows.map(parseCustomer).filter((item): item is Customer => Boolean(item));
  return new Map(customers.map((customer) => [customer.id, customer]));
}

export function createCustomerDuplicateService(store: DuplicateStore) {
  return {
    async list(context: CustomerAccessContext, query: { status?: CustomerMergeStatus } = {}): Promise<DuplicateGroupListItem[]> {
      assertMergePermission(context);
      const groups = await store.customerDuplicateGroup.findMany({
        where: query.status ? { status: query.status } : undefined,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const ids = normalizeCustomerIds(groups.flatMap((group) => Array.isArray(group.customerIds) ? group.customerIds : []));
      const customerMap = await customersByIds(store, ids);
      return groups.flatMap((group): DuplicateGroupListItem[] => {
        const customerIds = normalizeCustomerIds(Array.isArray(group.customerIds) ? group.customerIds : []);
        const customers = customerIds.map((id) => customerMap.get(id)).filter((item): item is Customer => Boolean(item));
        if (
          customers.length !== customerIds.length
          || customers.some((customer) => !canReadCustomer(context, customer) || !canManageCustomer(context, customer))
        ) return [];
        return [{
          id: group.id,
          rule: group.rule,
          confidence: group.confidence,
          status: group.status,
          customerIds,
          visibleCustomers: customers.map((customer) => ({
            id: customer.id,
            name: customer.name,
            company: customer.company,
            phone: customer.phone,
            wechat: customer.wechat,
            owner: customer.owner,
            ownerId: customer.ownerId,
            ownerIdentityStatus: customer.ownerIdentityStatus,
            lifecycleStatusCode: customer.lifecycleStatusCode,
          })),
          createdAt: group.createdAt,
          ...(group.resolvedAt ? { resolvedAt: group.resolvedAt } : {}),
          ...(group.mergeLedgerId ? { mergeLedgerId: group.mergeLedgerId } : {}),
        }];
      });
    },

    async createManual(context: CustomerAccessContext, customerIdsInput: string[]): Promise<any> {
      assertMergePermission(context);
      const customerIds = normalizeCustomerIds(customerIdsInput);
      if (customerIds.length < 2 || customerIds.length > 10) {
        throw new Error('DUPLICATE_GROUP_REQUIRES_TWO_TO_TEN_CUSTOMERS');
      }
      const customerMap = await customersByIds(store, customerIds);
      const customers = customerIds.map((id) => customerMap.get(id)).filter((item): item is Customer => Boolean(item));
      if (
        customers.length !== customerIds.length
        || customers.some((customer) => customer.deletedAt || customer.mergedIntoId || !canManageCustomer(context, customer))
      ) throw new Error('客户不存在或无权管理');
      return createDuplicateCandidateGroup(store, {
        rule: 'manual',
        customerIds,
        confidence: 'manual',
        createdById: context.actorId,
      });
    },
  };
}
