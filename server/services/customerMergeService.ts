import type {
  CustomerMergeField,
  CustomerMergeConflict,
  CustomerMergePrecheckResult,
  CustomerMergePrecheckInput,
} from '../../src/types/customerMerge';
import type { Customer } from '../../src/types/customer';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import {
  issueBatchPrecheckToken,
  sha256Json,
  type BatchPrecheckTokenStore,
} from './customerBatchPrecheckService';
import { createPrismaTokenStore } from './customerBatchService';
import {
  assertAssociationRegistryComplete,
  discoverCustomerAssociationDomains,
} from './customerAssociationRegistry';
import { canManageCustomer, type CustomerAccessContext } from './customerAccessPolicy';
import { createCustomerDuplicateService } from './customerDuplicateService';
import { CUSTOMER_MERGE_FIELDS, CUSTOMER_MERGE_HANDLER_KEY } from '../../src/types/customerMerge';

export function validateMergeSelection(mainCustomerId: string, secondaryCustomerIds: string[]): void {
  const ids = [String(mainCustomerId || '').trim(), ...secondaryCustomerIds.map((id) => String(id || '').trim())];
  if (ids.some((id) => !id) || ids.length < 2 || ids.length > 10 || new Set(ids).size !== ids.length) {
    throw new Error('MERGE_REQUIRES_TWO_TO_TEN_CUSTOMERS');
  }
}

export function requiredFieldDecisions(
  values: Partial<Record<CustomerMergeField, string[]>>,
): CustomerMergeField[] {
  return Object.entries(values)
    .filter(([, candidates]) => new Set((candidates ?? []).map((value) => String(value || '').trim()).filter(Boolean)).size > 1)
    .map(([field]) => field as CustomerMergeField);
}

export function buildCustomerMergeInputHash(input: CustomerMergePrecheckInput): string {
  const normalizedInput = {
    mainCustomerId: input.mainCustomerId,
    secondaryCustomerIds: [...input.secondaryCustomerIds].sort(),
    fieldDecisions: input.fieldDecisions,
    tagDecision: {
      selectedTagIds: [...input.tagDecision.selectedTagIds].sort(),
      singleGroupSelections: input.tagDecision.singleGroupSelections ?? {},
    },
  };
  return sha256Json({ input: normalizedInput, reason: input.reason.trim() });
}

type MergeServiceOptions = {
  tokenStore?: BatchPrecheckTokenStore<any>;
  now?: () => Date;
  createToken?: () => string;
  createId?: () => string;
};

type CustomerMergeRow = {
  id: string;
  domain: string;
  recordId: string;
  data: unknown;
  recordRevision?: number | null;
  updatedAt: Date | string;
};

function parseCustomer(row: CustomerMergeRow): Customer | null {
  const value = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const customer = value as Customer;
  return customer.id === row.recordId ? customer : null;
}

function normalizedPrecheckInput(input: CustomerMergePrecheckInput) {
  return {
    mainCustomerId: String(input.mainCustomerId || '').trim(),
    secondaryCustomerIds: input.secondaryCustomerIds.map((id) => String(id || '').trim()).sort(),
    fieldDecisions: input.fieldDecisions || {},
    tagDecision: {
      selectedTagIds: Array.from(new Set((input.tagDecision?.selectedTagIds || []).map((id) => String(id || '').trim()).filter(Boolean))).sort(),
      singleGroupSelections: input.tagDecision?.singleGroupSelections || {},
    },
    reason: String(input.reason || '').trim(),
  } satisfies CustomerMergePrecheckInput;
}

function fieldValue(customer: Customer, field: CustomerMergeField): string {
  return String(customer[field] ?? '').trim();
}

function conflict(code: string, message: string, recordType?: string): CustomerMergeConflict {
  return { code, message, ...(recordType ? { recordType } : {}) };
}

function associationCountsFrom(
  occurrences: Awaited<ReturnType<typeof discoverCustomerAssociationDomains>>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of occurrences) counts[item.storageDomain] = (counts[item.storageDomain] || 0) + 1;
  return counts;
}

export function createCustomerMergeService(prisma: any, options: MergeServiceOptions = {}) {
  const tokenStore = options.tokenStore || createPrismaTokenStore(prisma);
  const now = options.now || (() => new Date());
  const duplicateService = createCustomerDuplicateService(prisma);

  return {
    async precheck(
      inputValue: CustomerMergePrecheckInput,
      context: CustomerAccessContext,
    ): Promise<CustomerMergePrecheckResult> {
      if (!context.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_MERGE)) {
        throw new Error('无权合并客户');
      }
      const input = normalizedPrecheckInput(inputValue);
      validateMergeSelection(input.mainCustomerId, input.secondaryCustomerIds);
      if (!input.reason) throw new Error('合并原因不能为空');
      const selectedIds = [input.mainCustomerId, ...input.secondaryCustomerIds].sort();
      const rows: CustomerMergeRow[] = await prisma.businessRecord.findMany({
        where: { domain: STORAGE_KEYS.CUSTOMERS, recordId: { in: selectedIds } },
        select: { id: true, domain: true, recordId: true, data: true, recordRevision: true, updatedAt: true },
      });
      const rowById = new Map(rows.map((row) => [row.recordId, row]));
      const customerById = new Map(rows.map((row) => [row.recordId, parseCustomer(row)]));
      const conflicts: CustomerMergeConflict[] = [];
      for (const id of selectedIds) {
        const customer = customerById.get(id);
        if (!customer) {
          conflicts.push(conflict('CUSTOMER_UNAVAILABLE', '客户不存在或当前不可用', 'Customer'));
          continue;
        }
        if (customer.deletedAt || customer.mergedIntoId) {
          conflicts.push(conflict('CUSTOMER_NOT_ACTIVE', '只能合并有效且尚未合并的客户', 'Customer'));
        } else if (!canManageCustomer(context, customer)) {
          conflicts.push(conflict('CUSTOMER_OUT_OF_SCOPE', '存在无权管理的客户', 'Customer'));
        }
      }

      let associationCounts: Record<string, number> = {};
      if (!conflicts.length) {
        try {
          await assertAssociationRegistryComplete(prisma, selectedIds);
          associationCounts = associationCountsFrom(await discoverCustomerAssociationDomains(prisma, selectedIds));
        } catch (error) {
          conflicts.push(conflict('ASSOCIATION_REGISTRY_INCOMPLETE', String((error as Error).message || error), 'CustomerAssociation'));
        }
      }

      const customers = selectedIds
        .map((id) => customerById.get(id))
        .filter((customer): customer is Customer => Boolean(customer));
      const differingValues = Object.fromEntries(CUSTOMER_MERGE_FIELDS.map((field) => [
        field,
        customers.map((customer) => fieldValue(customer, field)),
      ])) as Partial<Record<CustomerMergeField, string[]>>;
      const requiredDecisions = requiredFieldDecisions(differingValues);
      const selectedSet = new Set(selectedIds);
      for (const field of requiredDecisions) {
        const sourceId = input.fieldDecisions[field]?.sourceCustomerId;
        if (!sourceId || !selectedSet.has(sourceId)) {
          conflicts.push(conflict('FIELD_DECISION_REQUIRED', `请选择“${field}”保留值`, 'CustomerField'));
        }
      }
      for (const [field, decision] of Object.entries(input.fieldDecisions)) {
        if (!CUSTOMER_MERGE_FIELDS.includes(field as CustomerMergeField) || !selectedSet.has(decision.sourceCustomerId)) {
          conflicts.push(conflict('FIELD_DECISION_INVALID', '字段保留来源无效', 'CustomerField'));
        }
      }
      const availableTags = new Set(customers.flatMap((customer) => customer.manualTagIds || []));
      if (input.tagDecision.selectedTagIds.some((tagId) => !availableTags.has(tagId))) {
        conflicts.push(conflict('TAG_DECISION_INVALID', '标签保留选择不属于待合并客户', 'CustomerTag'));
      }

      if (conflicts.length) {
        return { executable: false, conflicts, associationCounts, requiredDecisions };
      }

      const groups = await duplicateService.list(context, { status: 'open' });
      const hasExactGroup = groups.some((group) => (
        group.customerIds.length === selectedIds.length
        && group.customerIds.every((id, index) => id === selectedIds[index])
      ));
      if (!hasExactGroup) await duplicateService.createManual(context, selectedIds);

      const canonicalInput = {
        input: {
          mainCustomerId: input.mainCustomerId,
          secondaryCustomerIds: input.secondaryCustomerIds,
          fieldDecisions: input.fieldDecisions,
          tagDecision: input.tagDecision,
        },
        reason: input.reason,
      };
      const inputHash = buildCustomerMergeInputHash(input);
      const customerVersionManifest = Object.fromEntries(selectedIds.map((id) => {
        const row = rowById.get(id)!;
        return [id, {
          recordRevision: Number(row.recordRevision ?? 0),
          updatedAt: new Date(row.updatedAt).toISOString(),
        }];
      }));
      const issued = await issueBatchPrecheckToken({
        store: tokenStore,
        actorId: context.actorId,
        handlerKey: CUSTOMER_MERGE_HANDLER_KEY,
        operation: CUSTOMER_MERGE_HANDLER_KEY,
        selectionHash: sha256Json(selectedIds),
        inputHash,
        selectedCustomerIds: selectedIds,
        customerVersionManifest,
        guardManifest: {
          command: canonicalInput,
          customerVersions: customerVersionManifest,
          associationCounts,
        },
        canonicalInput,
        now,
        createId: options.createId,
        createToken: options.createToken,
      });
      return {
        executable: true,
        precheckToken: issued.confirmationToken,
        expiresAt: issued.expiresAt,
        conflicts: [],
        associationCounts,
        requiredDecisions,
      };
    },
  };
}
