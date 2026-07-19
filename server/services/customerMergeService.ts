import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  CustomerMergeField,
  CustomerMergeConflict,
  CustomerMergeExecutionInput,
  CustomerMergeLedgerView,
  CustomerMergeUndoExecutionInput,
  CustomerMergeUndoPrecheckResult,
  CustomerMergePrecheckResult,
  CustomerMergePrecheckInput,
} from '../../src/types/customerMerge';
import type { Customer } from '../../src/types/customer';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import {
  BatchPrecheckAuthorizationError,
  BatchPrecheckConflictError,
  consumeBatchPrecheckToken,
  issueBatchPrecheckToken,
  sha256Json,
  type BatchPrecheckTokenStore,
} from './customerBatchPrecheckService';
import { createPrismaTokenStore } from './customerBatchService';
import {
  assertAssociationRegistryComplete,
  discoverCustomerAssociationDomains,
  lockCustomerAssociationScope,
} from './customerAssociationRegistry';
import { canManageCustomer, canManageHistoricalMergedCustomer, type CustomerAccessContext } from './customerAccessPolicy';
import { createCustomerDuplicateService } from './customerDuplicateService';
import { CUSTOMER_MERGE_FIELDS, CUSTOMER_MERGE_HANDLER_KEY, CUSTOMER_MERGE_UNDO_HANDLER_KEY } from '../../src/types/customerMerge';
import { createCustomerBusinessRecordRepository, type CustomerRecordSnapshot } from './customerBusinessRecordRepository';
import { appendCustomerAuditEvent } from './customerAuditService';
import {
  createCustomerMergeSnapshotKeyringFromEnv,
  openMergeSnapshot,
  sealMergeSnapshot,
  type CustomerMergeSnapshotKeyring,
} from './customerMergeSnapshotCrypto';
import { migrateCustomerAssociations, restoreCustomerAssociations, type CustomerAssociationMergeEntry } from './customerAssociationMergeService';

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

export function buildCustomerMergeUndoInputHash(ledgerId: string): string {
  return sha256Json({ input: { ledgerId: String(ledgerId || '').trim() }, reason: CUSTOMER_MERGE_UNDO_HANDLER_KEY });
}

export function buildLockOrder(
  mainCustomerId: string,
  secondaryCustomerIds: string[],
  identityIds: string[],
  identityLinkIds: string[],
  associationDomains: string[],
): string[] {
  const customerIds = Array.from(new Set([mainCustomerId, ...secondaryCustomerIds])).sort();
  return [
    ...customerIds.map((id) => `customer:${id}`),
    ...Array.from(new Set(identityIds)).sort().map((id) => `identity:${id}`),
    ...Array.from(new Set(identityLinkIds)).sort().map((id) => `identity_link:${id}`),
    ...Array.from(new Set(associationDomains)).map((domain) => `domain:${domain}`),
  ];
}

type MergeServiceOptions = {
  tokenStore?: BatchPrecheckTokenStore<any>;
  now?: () => Date;
  createToken?: () => string;
  createId?: () => string;
  snapshotKeyring?: CustomerMergeSnapshotKeyring;
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

function object(value: unknown): Record<string, any> {
  if (typeof value === 'string') {
    try { return object(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function stringArray(value: unknown): string[] {
  const decoded = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return []; } })() : value;
  return Array.isArray(decoded) ? decoded.map((item) => String(item || '')).filter(Boolean) : [];
}

function ledgerView(row: any): CustomerMergeLedgerView {
  return {
    id: row.id,
    mainCustomerId: row.mainCustomerId,
    secondaryCustomerIds: stringArray(row.secondaryCustomerIds),
    status: row.status,
    mergedAt: new Date(row.mergedAt).toISOString(),
    undoDeadlineAt: new Date(row.undoDeadlineAt).toISOString(),
    reason: row.reason,
    actor: { id: row.actorId, name: row.actorName },
    ...(row.undoneAt ? { undoneAt: new Date(row.undoneAt).toISOString() } : {}),
    ...(row.undoneById ? { undoneBy: { id: row.undoneById, name: row.undoneByName || '' } } : {}),
  };
}

function canManageLedgerParticipant(
  context: CustomerAccessContext,
  customer: Customer,
  ledger: any,
): boolean {
  if (customer.id === ledger.mainCustomerId || ledger.status === 'undone') return canManageCustomer(context, customer);
  return canManageHistoricalMergedCustomer(context, customer, ledger.mainCustomerId, ledger.id);
}

function uniqueSubrecords(values: unknown[][]): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const item of values.flat()) {
    const key = object(item).id ? `id:${object(item).id}` : `json:${JSON.stringify(item)}`;
    if (!seen.has(key)) { seen.add(key); result.push(item); }
  }
  return result;
}

function mergedCustomerValue(
  main: Customer,
  customers: Customer[],
  input: CustomerMergePrecheckInput,
  timestamp: string,
): Customer {
  const result = structuredClone(main);
  for (const field of CUSTOMER_MERGE_FIELDS) {
    const chosen = input.fieldDecisions[field]?.sourceCustomerId;
    const source = chosen ? customers.find((customer) => customer.id === chosen) : undefined;
    const fallback = customers.find((customer) => fieldValue(customer, field));
    (result as any)[field] = source ? (source as any)[field] : (result as any)[field] || (fallback as any)?.[field];
    if (field === 'ownerId' && source) {
      result.owner = source.owner;
      result.ownerIdentityStatus = source.ownerIdentityStatus;
      result.ownerSince = source.ownerSince;
    }
  }
  result.manualTagIds = [...input.tagDecision.selectedTagIds];
  result.tags = Array.from(new Set(customers.flatMap((customer) => customer.tags || [])));
  result.activityRecords = uniqueSubrecords(customers.map((customer) => customer.activityRecords || [])) as Customer['activityRecords'];
  result.growthPath = uniqueSubrecords(customers.map((customer) => customer.growthPath || [])) as Customer['growthPath'];
  result.growthRecords = uniqueSubrecords(customers.map((customer) => customer.growthRecords || [])) as Customer['growthRecords'];
  result.totalSpent = Math.max(...customers.map((customer) => Number(customer.totalSpent || 0)));
  result.orderCount = Math.max(...customers.map((customer) => Number(customer.orderCount || 0)));
  result.updatedAt = timestamp;
  delete result.mergedIntoId;
  delete result.mergedAt;
  delete result.mergedById;
  delete result.mergedByName;
  delete result.mergeLedgerId;
  return result;
}

type LockedMergeState = {
  input: CustomerMergePrecheckInput;
  snapshots: CustomerRecordSnapshot[];
  identities: any[];
  identityLinks: any[];
  duplicateGroupId: string | null;
};

type MergeSnapshotPayload = {
  customers: Array<{
    recordId: string;
    recordRevision: number;
    businessRecordUpdatedAt: string;
    customer: Customer;
  }>;
  identities: any[];
  identityLinks: any[];
};

async function loadCurrentAssociationSnapshot(tx: any, entry: CustomerAssociationMergeEntry): Promise<Record<string, unknown> | null> {
  if (entry.domain === 'lead_records') {
    const row = await tx.leadRecord.findUnique({ where: { id: entry.recordId }, select: { data: true } });
    return row ? { data: object(row.data) } : null;
  }
  if (entry.domain === 'customer_todos') {
    const row = await tx.customerTodo.findUnique({ where: { id: entry.recordId }, select: { customerId: true, customerName: true } });
    return row ? { customerId: row.customerId, customerName: row.customerName } : null;
  }
  if (entry.domain === STORAGE_KEYS.FINANCE && entry.recordId === STORAGE_KEYS.FINANCE) {
    const row = await tx.appStorage.findUnique({ where: { key: STORAGE_KEYS.FINANCE } });
    return row ? { value: object(row.value) } : null;
  }
  const row = await tx.businessRecord.findUnique({
    where: { domain_recordId: { domain: entry.domain, recordId: entry.recordId } },
    select: { customerId: true, data: true },
  });
  return row ? { customerId: row.customerId ?? null, data: object(row.data) } : null;
}

function mergeEntries(rows: any[]): CustomerAssociationMergeEntry[] {
  return rows.map((row) => ({
    domain: row.domain,
    recordId: row.recordId,
    beforeSnapshot: object(row.beforeSnapshot),
    afterSnapshot: object(row.afterSnapshot),
    rowRevision: row.rowRevision,
    updatedAtValue: row.updatedAtValue,
  }));
}

export function createCustomerMergeService(prisma: any, options: MergeServiceOptions = {}) {
  const tokenStore = options.tokenStore || createPrismaTokenStore(prisma);
  const now = options.now || (() => new Date());
  const duplicateService = createCustomerDuplicateService(prisma);

  return {
    async listDuplicateCandidates(context: CustomerAccessContext) {
      return duplicateService.list(context, { status: 'open' });
    },

    async createDuplicateCandidate(customerIds: string[], context: CustomerAccessContext) {
      return duplicateService.createManual(context, customerIds);
    },

    async listHistory(context: CustomerAccessContext): Promise<CustomerMergeLedgerView[]> {
      if (!context.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_MERGE)
        && !context.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_MERGE_UNDO)) {
        throw new BatchPrecheckAuthorizationError('无权查看客户合并记录');
      }
      const ledgers = await prisma.customerMergeLedger.findMany({ orderBy: { mergedAt: 'desc' }, take: 200 });
      const result: CustomerMergeLedgerView[] = [];
      for (const ledger of ledgers) {
        const ids = [ledger.mainCustomerId, ...stringArray(ledger.secondaryCustomerIds)];
        const rows: CustomerMergeRow[] = await prisma.businessRecord.findMany({
          where: { domain: STORAGE_KEYS.CUSTOMERS, recordId: { in: ids } },
          select: { id: true, domain: true, recordId: true, data: true, recordRevision: true, updatedAt: true },
        });
        if (rows.length === ids.length && rows.every((row) => {
          const customer = parseCustomer(row);
          return customer && canManageLedgerParticipant(context, customer, ledger);
        })) result.push(ledgerView(ledger));
      }
      return result;
    },

    async getHistory(id: string, context: CustomerAccessContext): Promise<CustomerMergeLedgerView | null> {
      const ledger = await prisma.customerMergeLedger.findUnique({ where: { id } });
      if (!ledger) return null;
      const visible = await this.listHistory(context);
      return visible.find((item) => item.id === id) || null;
    },

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

    async execute(
      inputValue: CustomerMergeExecutionInput,
      context: CustomerAccessContext,
    ): Promise<CustomerMergeLedgerView> {
      if (!context.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_MERGE)) {
        throw new BatchPrecheckAuthorizationError('无权合并客户');
      }
      const input = normalizedPrecheckInput(inputValue);
      validateMergeSelection(input.mainCustomerId, input.secondaryCustomerIds);
      const selectedIds = [input.mainCustomerId, ...input.secondaryCustomerIds].sort();
      const inputHash = buildCustomerMergeInputHash(input);
      let locked: LockedMergeState | null = null;

      const loadLedgerResult = async (tx: any, resultId: string) => {
        const row = await tx.customerMergeLedger.findUnique({ where: { id: resultId } });
        if (!row) return null;
        const customerRows = await tx.businessRecord.findMany({
          where: { domain: STORAGE_KEYS.CUSTOMERS, recordId: { in: [row.mainCustomerId, ...stringArray(row.secondaryCustomerIds)] } },
          select: { id: true, domain: true, recordId: true, data: true, recordRevision: true, updatedAt: true },
        });
        if (customerRows.some((item: CustomerMergeRow) => {
          const customer = parseCustomer(item);
          return !customer || !canManageLedgerParticipant(context, customer, row);
        })) throw new BatchPrecheckAuthorizationError();
        return { type: 'customer_merge_ledger' as const, id: row.id, idempotencyFingerprint: row.mergeIdempotencyFingerprint, value: ledgerView(row) };
      };

      return consumeBatchPrecheckToken({
        store: tokenStore,
        token: inputValue.precheckToken,
        actorId: context.actorId,
        handlerKey: CUSTOMER_MERGE_HANDLER_KEY,
        operation: CUSTOMER_MERGE_HANDLER_KEY,
        selectionHash: sha256Json(selectedIds),
        inputHash,
        idempotencyKey: inputValue.idempotencyKey,
        now,
      }, {
        resultType: 'customer_merge_ledger',
        async loadResult(tx: any, resultId: string) {
          return loadLedgerResult(tx, resultId);
        },
        async findExistingResult(tx: any, query) {
          const row = await tx.customerMergeLedger.findUnique({
            where: { actorId_mergeIdempotencyKey: { actorId: query.actorId, mergeIdempotencyKey: query.idempotencyKey } },
          });
          if (!row) return null;
          return loadLedgerResult(tx, row.id);
        },
        async lockAndRevalidate(tx: any, precheck) {
          const manifest = object(precheck.guardManifest);
          const command = object(manifest.command);
          const frozenInput = normalizedPrecheckInput({ ...(object(command.input) as CustomerMergePrecheckInput), reason: String(command.reason || '') });
          if (buildCustomerMergeInputHash(frozenInput) !== inputHash) throw new BatchPrecheckConflictError('预检操作参数已变化');
          const repository = createCustomerBusinessRecordRepository(tx);
          const snapshots: CustomerRecordSnapshot[] = [];
          const versions = object(precheck.customerVersionManifest);
          for (const id of selectedIds) {
            const snapshot = await repository.lockById(id);
            const expected = object(versions[id]);
            if (
              !snapshot
              || snapshot.customer.deletedAt
              || snapshot.customer.mergedIntoId
              || !canManageCustomer(context, snapshot.customer)
              || snapshot.recordRevision !== Number(expected.recordRevision ?? -1)
              || snapshot.businessRecordUpdatedAt.toISOString() !== String(expected.updatedAt || '')
            ) throw new BatchPrecheckConflictError('客户在预检后已变化，请刷新后重新预检');
            snapshots.push(snapshot);
          }
          await lockCustomerAssociationScope(tx, selectedIds);
          await assertAssociationRegistryComplete(tx, selectedIds);

          const links = await tx.contactIdentityLink.findMany({
            where: { entityType: 'customer', entityId: { in: selectedIds }, linkStatus: 'active' },
          });
          const identityIds = Array.from(new Set(links.map((link: any) => String(link.identityId)))).sort();
          for (const identityId of identityIds) {
            await tx.$queryRaw(Prisma.sql`SELECT id FROM contact_identities WHERE id = ${identityId} FOR UPDATE`);
          }
          const identityLinks = identityIds.length ? await tx.contactIdentityLink.findMany({
            where: { identityId: { in: identityIds }, entityType: 'customer' },
          }) : [];
          for (const link of identityLinks) {
            if (link.linkStatus === 'active' && !selectedIds.includes(link.entityId)) {
              throw new BatchPrecheckConflictError('联系方式仍关联未选中的其他客户，禁止合并');
            }
          }
          const identities = identityIds.length
            ? await tx.contactIdentity.findMany({ where: { id: { in: identityIds } } })
            : [];
          const groups = await tx.customerDuplicateGroup.findMany({ where: { status: 'open' } });
          const group = groups.find((candidate: any) => {
            const ids = stringArray(candidate.customerIds).sort();
            return ids.length === selectedIds.length && ids.every((id, index) => id === selectedIds[index]);
          });
          locked = { input: frozenInput, snapshots, identities, identityLinks, duplicateGroupId: group?.id || null };
        },
        async createResult(tx: any, precheck, idempotency) {
          if (!locked) throw new BatchPrecheckConflictError('合并锁定状态缺失');
          const state = locked;
          const timestamp = now();
          const timestampIso = timestamp.toISOString();
          const ledgerId = `merge-${randomUUID()}`;
          const repository = createCustomerBusinessRecordRepository(tx);
          const mainSnapshot = state.snapshots.find((item) => item.recordId === input.mainCustomerId)!;
          const customers = state.snapshots.map((item) => item.customer);
          const nextMain = mergedCustomerValue(mainSnapshot.customer, customers, state.input, timestampIso);
          nextMain.mergeLedgerId = ledgerId;
          const keyring = options.snapshotKeyring || createCustomerMergeSnapshotKeyringFromEnv(process.env);
          const sealed = sealMergeSnapshot({
            customers: state.snapshots.map((snapshot) => ({
              recordId: snapshot.recordId,
              recordRevision: snapshot.recordRevision,
              businessRecordUpdatedAt: snapshot.businessRecordUpdatedAt.toISOString(),
              customer: snapshot.customer,
            })),
            identities: state.identities,
            identityLinks: state.identityLinks,
          }, keyring);

          await repository.compareAndSave(mainSnapshot, nextMain, timestamp);
          for (const snapshot of state.snapshots) {
            if (snapshot.recordId === input.mainCustomerId) continue;
            await repository.compareAndSave(snapshot, {
              ...snapshot.customer,
              mergedIntoId: input.mainCustomerId,
              mergedAt: timestampIso,
              mergedById: context.actorId,
              mergedByName: context.actorName,
              mergeLedgerId: ledgerId,
              updatedAt: timestampIso,
            }, timestamp);
            await tx.businessRecord.update({
              where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: snapshot.recordId } },
              data: { mergedIntoId: input.mainCustomerId, mergedAt: timestamp, mergedById: context.actorId, mergedByName: context.actorName, mergeLedgerId: ledgerId },
            });
          }
          await tx.businessRecord.update({
            where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: input.mainCustomerId } },
            data: { mergedIntoId: null, mergedAt: null, mergedById: null, mergedByName: null, mergeLedgerId: ledgerId },
          });

          const associationEntries = await migrateCustomerAssociations(
            tx,
            input.mainCustomerId,
            input.secondaryCustomerIds,
            nextMain.name,
          );

          for (const identity of state.identities) {
            const links = state.identityLinks.filter((link) => link.identityId === identity.id);
            const mainLink = links.find((link) => link.entityId === input.mainCustomerId);
            if (mainLink) {
              await tx.contactIdentityLink.update({ where: { id: mainLink.id }, data: { linkStatus: 'active', endedAt: null } });
            } else {
              await tx.contactIdentityLink.create({ data: {
                id: `contact-link-${randomUUID()}`,
                identityId: identity.id,
                entityType: 'customer',
                entityId: input.mainCustomerId,
                linkStatus: 'active',
                source: 'customer_merge',
              } });
            }
            for (const link of links) {
              if (input.secondaryCustomerIds.includes(link.entityId) && link.linkStatus === 'active') {
                await tx.contactIdentityLink.update({ where: { id: link.id }, data: { linkStatus: 'ended', endedAt: timestamp } });
              }
            }
            await tx.contactIdentity.update({ where: { id: identity.id }, data: { canonicalCustomerId: input.mainCustomerId, status: 'active', conflictReason: null } });
          }

          const postVersions = Object.fromEntries(state.snapshots.map((snapshot) => [snapshot.recordId, snapshot.recordRevision + 1]));
          const associationOccurrenceKeys = (await discoverCustomerAssociationDomains(tx, [input.mainCustomerId]))
            .map((item) => `${item.storageDomain}:${item.pathKey}:${item.recordId}`)
            .sort();
          const ledger = await tx.customerMergeLedger.create({
            data: {
              id: ledgerId,
              duplicateGroupId: state.duplicateGroupId,
              mainCustomerId: input.mainCustomerId,
              secondaryCustomerIds: input.secondaryCustomerIds,
              fieldDecisions: input.fieldDecisions,
              tagDecision: input.tagDecision,
              encryptedCustomerSnapshots: sealed.value,
              snapshotKeyVersion: sealed.keyVersion,
              guardManifest: {
                postCustomerVersions: postVersions,
                associationRecordKeys: associationEntries.map((entry) => `${entry.domain}:${entry.recordId}`).sort(),
                associationOccurrenceKeys,
              },
              reason: input.reason,
              actorId: context.actorId,
              actorName: context.actorName,
              mergeInputHash: precheck.inputHash,
              mergeIdempotencyKey: idempotency.idempotencyKey,
              mergeIdempotencyFingerprint: idempotency.idempotencyFingerprint,
              mergedAt: timestamp,
              undoDeadlineAt: new Date(timestamp.getTime() + 72 * 60 * 60 * 1_000),
              status: 'merged',
              entries: { create: associationEntries.map((entry) => ({
                domain: entry.domain,
                recordId: entry.recordId,
                beforeSnapshot: entry.beforeSnapshot,
                afterSnapshot: entry.afterSnapshot,
                rowRevision: entry.rowRevision ?? null,
                updatedAtValue: entry.updatedAtValue ?? null,
              })) },
            },
          });
          if (state.duplicateGroupId) {
            await tx.customerDuplicateGroup.update({ where: { id: state.duplicateGroupId }, data: { status: 'merged', resolvedAt: timestamp, mergeLedgerId: ledgerId } });
          }
          for (const snapshot of state.snapshots) {
            const after = snapshot.recordId === input.mainCustomerId
              ? nextMain
              : { ...snapshot.customer, mergedIntoId: input.mainCustomerId, mergeLedgerId: ledgerId };
            await appendCustomerAuditEvent(tx, {
              customerId: snapshot.recordId,
              operation: snapshot.recordId === input.mainCustomerId ? 'merge_customer_main' : 'merge_customer_secondary',
              actor: { id: context.actorId, name: context.actorName },
              reason: input.reason,
              beforeSnapshot: snapshot.customer,
              afterSnapshot: after,
              idempotencyKey: inputValue.idempotencyKey,
              canonicalInput: { ledgerId, mainCustomerId: input.mainCustomerId, customerId: snapshot.recordId },
            });
          }
          return { type: 'customer_merge_ledger', id: ledger.id, idempotencyFingerprint: idempotency.idempotencyFingerprint, value: ledgerView(ledger) };
        },
      });
    },

    async undoPrecheck(
      ledgerIdValue: string,
      context: CustomerAccessContext,
    ): Promise<CustomerMergeUndoPrecheckResult> {
      if (!context.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_MERGE_UNDO)) {
        throw new BatchPrecheckAuthorizationError('无权撤销客户合并');
      }
      const ledgerId = String(ledgerIdValue || '').trim();
      const ledger = ledgerId ? await prisma.customerMergeLedger.findUnique({ where: { id: ledgerId }, include: { entries: true } }) : null;
      if (!ledger) throw new BatchPrecheckConflictError('合并记录不存在');
      const conflicts: CustomerMergeConflict[] = [];
      const undoDeadlineAt = new Date(ledger.undoDeadlineAt);
      if (ledger.status !== 'merged') conflicts.push(conflict('MERGE_ALREADY_UNDONE', '该合并已经撤销', 'CustomerMergeLedger'));
      if (undoDeadlineAt.getTime() <= now().getTime()) conflicts.push(conflict('UNDO_DEADLINE_EXPIRED', '已超过 72 小时撤销期限', 'CustomerMergeLedger'));
      const selectedIds = [ledger.mainCustomerId, ...stringArray(ledger.secondaryCustomerIds)].sort();
      const rows: CustomerMergeRow[] = await prisma.businessRecord.findMany({
        where: { domain: STORAGE_KEYS.CUSTOMERS, recordId: { in: selectedIds } },
        select: { id: true, domain: true, recordId: true, data: true, recordRevision: true, updatedAt: true },
      });
      const guard = object(ledger.guardManifest);
      const postVersions = object(guard.postCustomerVersions);
      for (const row of rows) {
        const customer = parseCustomer(row);
        if (!customer || !canManageLedgerParticipant(context, customer, ledger)) conflicts.push(conflict('CUSTOMER_OUT_OF_SCOPE', '存在无权管理的客户', 'Customer'));
        if (Number(row.recordRevision ?? 0) !== Number(postVersions[row.recordId] ?? -1)) {
          conflicts.push(conflict('CUSTOMER_CHANGED_AFTER_MERGE', '客户在合并后已发生变化', 'Customer'));
        }
      }
      if (rows.length !== selectedIds.length) conflicts.push(conflict('CUSTOMER_UNAVAILABLE', '合并客户记录不完整', 'Customer'));
      const occurrences = (await discoverCustomerAssociationDomains(prisma, [ledger.mainCustomerId]))
        .map((item) => `${item.storageDomain}:${item.pathKey}:${item.recordId}`).sort();
      if (sha256Json(occurrences) !== sha256Json(stringArray(guard.associationOccurrenceKeys).sort())) {
        conflicts.push(conflict('ASSOCIATIONS_CHANGED_AFTER_MERGE', '客户关联记录在合并后已发生变化', 'CustomerAssociation'));
      }
      for (const entry of mergeEntries(ledger.entries)) {
        const current = await loadCurrentAssociationSnapshot(prisma, entry);
        if (!current || sha256Json(current) !== sha256Json(entry.afterSnapshot)) {
          conflicts.push(conflict('ASSOCIATION_RECORD_CHANGED', '已有业务关联在合并后已被修改', entry.domain));
          break;
        }
      }
      if (conflicts.length) return { executable: false, conflicts, undoDeadlineAt: undoDeadlineAt.toISOString() };
      const inputHash = buildCustomerMergeUndoInputHash(ledgerId);
      const canonicalInput = { input: { ledgerId }, reason: CUSTOMER_MERGE_UNDO_HANDLER_KEY };
      const customerVersionManifest = Object.fromEntries(rows.map((row) => [row.recordId, {
        recordRevision: Number(row.recordRevision ?? 0),
        updatedAt: new Date(row.updatedAt).toISOString(),
      }]));
      const issued = await issueBatchPrecheckToken({
        store: tokenStore,
        actorId: context.actorId,
        handlerKey: CUSTOMER_MERGE_UNDO_HANDLER_KEY,
        operation: CUSTOMER_MERGE_UNDO_HANDLER_KEY,
        selectionHash: sha256Json(selectedIds),
        inputHash,
        selectedCustomerIds: selectedIds,
        customerVersionManifest,
        guardManifest: { command: canonicalInput, ledgerId, customerVersions: customerVersionManifest },
        canonicalInput,
        now,
        createId: options.createId,
        createToken: options.createToken,
      });
      return { executable: true, conflicts: [], undoDeadlineAt: undoDeadlineAt.toISOString(), precheckToken: issued.confirmationToken, expiresAt: issued.expiresAt };
    },

    async undo(
      input: CustomerMergeUndoExecutionInput,
      context: CustomerAccessContext,
    ): Promise<CustomerMergeLedgerView> {
      if (!context.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_MERGE_UNDO)) {
        throw new BatchPrecheckAuthorizationError('无权撤销客户合并');
      }
      const ledgerId = String(input.ledgerId || '').trim();
      const inputHash = buildCustomerMergeUndoInputHash(ledgerId);
      let lockedState: { ledger: any; snapshots: CustomerRecordSnapshot[]; entries: CustomerAssociationMergeEntry[]; payload: MergeSnapshotPayload } | null = null;
      const loadUndoResult = async (tx: any, id: string) => {
        const row = await tx.customerMergeLedger.findUnique({ where: { id } });
        if (!row || !row.undoIdempotencyFingerprint) return null;
        const participantIds = [row.mainCustomerId, ...stringArray(row.secondaryCustomerIds)];
        const participantRows: CustomerMergeRow[] = await tx.businessRecord.findMany({
          where: { domain: STORAGE_KEYS.CUSTOMERS, recordId: { in: participantIds } },
          select: { id: true, domain: true, recordId: true, data: true, recordRevision: true, updatedAt: true },
        });
        if (participantRows.length !== participantIds.length || participantRows.some((participant) => {
          const customer = parseCustomer(participant);
          return !customer || !canManageLedgerParticipant(context, customer, row);
        })) throw new BatchPrecheckAuthorizationError();
        return { type: 'customer_merge_ledger_undo' as const, id: row.id, idempotencyFingerprint: row.undoIdempotencyFingerprint, value: ledgerView(row) };
      };
      return consumeBatchPrecheckToken({
        store: tokenStore,
        token: input.precheckToken,
        actorId: context.actorId,
        handlerKey: CUSTOMER_MERGE_UNDO_HANDLER_KEY,
        operation: CUSTOMER_MERGE_UNDO_HANDLER_KEY,
        inputHash,
        idempotencyKey: input.idempotencyKey,
        now,
      }, {
        resultType: 'customer_merge_ledger_undo',
        loadResult: loadUndoResult,
        async findExistingResult(tx: any, query) {
          const row = await tx.customerMergeLedger.findUnique({
            where: { undoneById_undoIdempotencyKey: { undoneById: query.actorId, undoIdempotencyKey: query.idempotencyKey } },
          });
          return row ? loadUndoResult(tx, row.id) : null;
        },
        async lockAndRevalidate(tx: any, precheck) {
          const rows = await tx.$queryRaw(Prisma.sql`SELECT * FROM customer_merge_ledgers WHERE id = ${ledgerId} FOR UPDATE`) as any[];
          const ledger = rows[0]
            ? await tx.customerMergeLedger.findUnique({ where: { id: ledgerId }, include: { entries: true } })
            : null;
          if (!ledger || ledger.status !== 'merged') throw new BatchPrecheckConflictError('合并记录已撤销或不存在');
          if (new Date(ledger.undoDeadlineAt).getTime() <= now().getTime()) throw new BatchPrecheckConflictError('已超过 72 小时撤销期限');
          const selectedIds = [ledger.mainCustomerId, ...stringArray(ledger.secondaryCustomerIds)].sort();
          const repository = createCustomerBusinessRecordRepository(tx);
          const snapshots: CustomerRecordSnapshot[] = [];
          const versions = object(precheck.customerVersionManifest);
          for (const id of selectedIds) {
            const snapshot = await repository.lockById(id);
            const expected = object(versions[id]);
            if (!snapshot || !canManageLedgerParticipant(context, snapshot.customer, ledger)
              || snapshot.recordRevision !== Number(expected.recordRevision ?? -1)
              || snapshot.businessRecordUpdatedAt.toISOString() !== String(expected.updatedAt || '')) {
              throw new BatchPrecheckConflictError('客户在撤销预检后已变化');
            }
            snapshots.push(snapshot);
          }
          await lockCustomerAssociationScope(tx, selectedIds, { allowMerged: true });
          const guard = object(ledger.guardManifest);
          const occurrences = (await discoverCustomerAssociationDomains(tx, [ledger.mainCustomerId]))
            .map((item) => `${item.storageDomain}:${item.pathKey}:${item.recordId}`).sort();
          if (sha256Json(occurrences) !== sha256Json(stringArray(guard.associationOccurrenceKeys).sort())) {
            throw new BatchPrecheckConflictError('客户关联记录在撤销预检后已变化');
          }
          const entries = mergeEntries(ledger.entries);
          for (const entry of entries) {
            const current = await loadCurrentAssociationSnapshot(tx, entry);
            if (!current || sha256Json(current) !== sha256Json(entry.afterSnapshot)) {
              throw new BatchPrecheckConflictError('业务关联在合并后已变化，不能自动撤销');
            }
          }
          const keyring = options.snapshotKeyring || createCustomerMergeSnapshotKeyringFromEnv(process.env);
          const payload = openMergeSnapshot<MergeSnapshotPayload>(ledger.encryptedCustomerSnapshots, ledger.snapshotKeyVersion, keyring);
          lockedState = { ledger, snapshots, entries, payload };
        },
        async createResult(tx: any, _precheck, idempotency) {
          if (!lockedState) throw new BatchPrecheckConflictError('撤销锁定状态缺失');
          const state = lockedState;
          const timestamp = now();
          await restoreCustomerAssociations(tx, state.entries);
          const repository = createCustomerBusinessRecordRepository(tx);
          for (const original of state.payload.customers) {
            const current = state.snapshots.find((snapshot) => snapshot.recordId === original.recordId)!;
            await repository.compareAndSave(current, { ...original.customer, updatedAt: timestamp.toISOString() }, timestamp);
            await tx.businessRecord.update({
              where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: original.recordId } },
              data: {
                mergedIntoId: original.customer.mergedIntoId || null,
                mergedAt: original.customer.mergedAt ? new Date(original.customer.mergedAt) : null,
                mergedById: original.customer.mergedById || null,
                mergedByName: original.customer.mergedByName || null,
                mergeLedgerId: original.customer.mergeLedgerId || null,
              },
            });
          }
          const identityIds = state.payload.identities.map((identity) => identity.id);
          if (identityIds.length) {
            const currentLinks = await tx.contactIdentityLink.findMany({ where: { identityId: { in: identityIds }, entityType: 'customer' } });
            const originalLinkIds = new Set(state.payload.identityLinks.map((link) => link.id));
            for (const link of currentLinks) {
              if (!originalLinkIds.has(link.id) && link.source === 'customer_merge') await tx.contactIdentityLink.delete({ where: { id: link.id } });
            }
            for (const link of state.payload.identityLinks) {
              await tx.contactIdentityLink.update({ where: { id: link.id }, data: { linkStatus: link.linkStatus, endedAt: link.endedAt, source: link.source } });
            }
            for (const identity of state.payload.identities) {
              await tx.contactIdentity.update({ where: { id: identity.id }, data: {
                canonicalCustomerId: identity.canonicalCustomerId,
                status: identity.status,
                conflictReason: identity.conflictReason,
              } });
            }
          }
          const ledger = await tx.customerMergeLedger.update({ where: { id: state.ledger.id }, data: {
            status: 'undone',
            undoneAt: timestamp,
            undoneById: context.actorId,
            undoneByName: context.actorName,
            undoInputHash: inputHash,
            undoIdempotencyKey: idempotency.idempotencyKey,
            undoIdempotencyFingerprint: idempotency.idempotencyFingerprint,
          } });
          if (state.ledger.duplicateGroupId) {
            await tx.customerDuplicateGroup.update({ where: { id: state.ledger.duplicateGroupId }, data: { status: 'open', resolvedAt: null, mergeLedgerId: null } });
          }
          for (const original of state.payload.customers) {
            await appendCustomerAuditEvent(tx, {
              customerId: original.recordId,
              operation: 'undo_customer_merge',
              actor: { id: context.actorId, name: context.actorName },
              reason: '撤销客户合并',
              beforeSnapshot: state.snapshots.find((snapshot) => snapshot.recordId === original.recordId)?.customer,
              afterSnapshot: original.customer,
              idempotencyKey: input.idempotencyKey,
              canonicalInput: { ledgerId: state.ledger.id, customerId: original.recordId },
            });
          }
          return { type: 'customer_merge_ledger_undo', id: ledger.id, idempotencyFingerprint: idempotency.idempotencyFingerprint, value: ledgerView(ledger) };
        },
      });
    },
  };
}
