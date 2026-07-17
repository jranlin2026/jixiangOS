import { Prisma } from '@prisma/client';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';

export const CUSTOMER_ASSOCIATION_DOMAIN_ORDER = [
  'lead_records',
  'orders',
  'order_applications',
  'deliveries',
  'refunds',
  'recovery_orders',
  'service_tickets',
  'opportunities',
  'commissions_finance',
  'customer_todos',
  'customer_json_subrecords',
  'ai_cards',
] as const;

export type CustomerAssociationDomain = typeof CUSTOMER_ASSOCIATION_DOMAIN_ORDER[number];
export type CustomerAssociationStorageModel =
  | 'business_record'
  | 'lead_record'
  | 'customer_todo'
  | 'customer_json_subrecord'
  | 'app_storage';
export type CustomerAssociationMergeAdapterKind = 'stable_id' | 'intrinsic_subrecord' | 'none';

export interface CustomerAssociationDefinition {
  id: string;
  domain: CustomerAssociationDomain;
  storageModel: CustomerAssociationStorageModel;
  storageDomain: string;
  pathKey: string;
  legacyNamePaths: string[];
  blockerLabel: string;
  blocksSoftDelete: boolean;
  mergeAdapterKind: CustomerAssociationMergeAdapterKind;
}

export interface DiscoveredCustomerAssociationPath {
  storageDomain: string;
  pathKey: string;
  recordId: string;
  definitionId?: string;
}

export interface CustomerAssociationReader {
  businessRecord?: { findMany(args?: unknown): Promise<any[]> };
  leadRecord?: { findMany(args?: unknown): Promise<any[]> };
  customerTodo?: { findMany(args?: unknown): Promise<any[]> };
  appStorage?: {
    findUnique(args: unknown): Promise<any>;
    upsert?(args: unknown): Promise<any>;
  };
  $queryRaw?<T = unknown>(query: Prisma.Sql): Promise<T>;
}

const definition = (
  id: string,
  domain: CustomerAssociationDomain,
  storageModel: CustomerAssociationStorageModel,
  storageDomain: string,
  pathKey: string,
  blockerLabel: string,
  blocksSoftDelete: boolean,
  mergeAdapterKind: CustomerAssociationMergeAdapterKind,
  legacyNamePaths: string[] = [],
): CustomerAssociationDefinition => ({
  id,
  domain,
  storageModel,
  storageDomain,
  pathKey,
  legacyNamePaths,
  blockerLabel,
  blocksSoftDelete,
  mergeAdapterKind,
});

const businessStableDefinitions = (
  prefix: string,
  domain: CustomerAssociationDomain,
  storageDomain: string,
  blockerLabel: string,
  paths: string[],
  legacyNamePaths = ['data.customerName'],
) => paths.map((pathKey) => definition(
  `${prefix}:${pathKey}`,
  domain,
  'business_record',
  storageDomain,
  pathKey,
  blockerLabel,
  true,
  'stable_id',
  legacyNamePaths,
));

export const CUSTOMER_ASSOCIATION_DEFINITIONS: readonly CustomerAssociationDefinition[] = [
  definition('lead_records:data.customerId', 'lead_records', 'lead_record', 'lead_records', 'data.customerId', '线索关联', true, 'stable_id', ['data.customerName', 'data.name']),
  ...businessStableDefinitions('orders', 'orders', STORAGE_KEYS.ORDERS, '订单关联', ['customerId', 'data.customerId']),
  ...businessStableDefinitions(
    'order_applications',
    'order_applications',
    STORAGE_KEYS.ORDER_APPLICATIONS,
    '订单申请关联',
    ['customerId', 'data.customerId', 'data.orderData.customerId'],
    ['data.customerName', 'data.orderData.customerName'],
  ),
  ...businessStableDefinitions('deliveries', 'deliveries', STORAGE_KEYS.DELIVERIES, '交付关联', ['customerId', 'data.customerId']),
  ...businessStableDefinitions('refunds', 'refunds', STORAGE_KEYS.REFUNDS, '退款关联', ['customerId', 'data.customerId']),
  ...businessStableDefinitions('recovery_orders', 'recovery_orders', STORAGE_KEYS.RECOVERY_ORDERS, '挽回订单关联', ['customerId', 'data.customerId']),
  ...businessStableDefinitions('service_tickets', 'service_tickets', STORAGE_KEYS.SERVICE_TICKETS, '售后工单关联', ['customerId', 'data.customerId']),
  ...businessStableDefinitions('opportunities', 'opportunities', STORAGE_KEYS.OPPORTUNITIES, '商机关联', ['customerId', 'data.customerId']),
  ...businessStableDefinitions('commissions', 'commissions_finance', STORAGE_KEYS.COMMISSIONS, '佣金/财务关联', ['customerId', 'data.customerId']),
  definition('finance:incomes', 'commissions_finance', 'app_storage', STORAGE_KEYS.FINANCE, 'value.incomes[].customerId', '佣金/财务关联', true, 'stable_id', ['value.incomes[].customerName']),
  definition('finance:expenses', 'commissions_finance', 'app_storage', STORAGE_KEYS.FINANCE, 'value.expenses[].customerId', '佣金/财务关联', true, 'stable_id', ['value.expenses[].customerName']),
  definition('finance:transactions', 'commissions_finance', 'app_storage', STORAGE_KEYS.FINANCE, 'value.transactions[].customerId', '佣金/财务关联', true, 'stable_id', ['value.transactions[].customerName']),
  definition('customer_todos:customerId', 'customer_todos', 'customer_todo', 'customer_todos', 'customerId', '待办关联', true, 'stable_id', ['customerName']),
  definition('customer_root:customerId', 'customer_json_subrecords', 'customer_json_subrecord', STORAGE_KEYS.CUSTOMERS, 'customerId', '客户根记录', false, 'intrinsic_subrecord'),
  definition('customer_followups', 'customer_json_subrecords', 'customer_json_subrecord', STORAGE_KEYS.CUSTOMERS, 'data.activityRecords[type=follow]', '客户跟进记录', false, 'intrinsic_subrecord'),
  definition('customer_activities', 'customer_json_subrecords', 'customer_json_subrecord', STORAGE_KEYS.CUSTOMERS, 'data.activityRecords[]', '客户活动记录', false, 'intrinsic_subrecord'),
  definition('customer_growth_path', 'customer_json_subrecords', 'customer_json_subrecord', STORAGE_KEYS.CUSTOMERS, 'data.growthPath[]', '客户成长路径', false, 'intrinsic_subrecord'),
  definition('customer_growth_records', 'customer_json_subrecords', 'customer_json_subrecord', STORAGE_KEYS.CUSTOMERS, 'data.growthRecords[]', '客户成长记录', false, 'intrinsic_subrecord'),
  definition('customer_tags', 'customer_json_subrecords', 'customer_json_subrecord', STORAGE_KEYS.CUSTOMERS, 'data.manualTagIds[]', '客户标签记录', false, 'intrinsic_subrecord'),
  definition('customer_attachments', 'customer_json_subrecords', 'customer_json_subrecord', STORAGE_KEYS.CUSTOMERS, 'data.activityRecords[].attachments[]', '客户附件引用', true, 'intrinsic_subrecord'),
  definition('ai_cards:customer', 'ai_cards', 'business_record', STORAGE_KEYS.AI_CARDS, 'data.subjectId|data.subjectType=customer', 'AI 客户卡片', true, 'stable_id'),
];

export const CUSTOMER_ASSOCIATED_BUSINESS_DOMAINS = Array.from(new Set(
  CUSTOMER_ASSOCIATION_DEFINITIONS.map((item) => item.storageDomain),
));

export function getCustomerAssociationDefinitions(): readonly CustomerAssociationDefinition[] {
  return CUSTOMER_ASSOCIATION_DEFINITIONS;
}

const DEFINITION_BY_PAIR = new Map(
  CUSTOMER_ASSOCIATION_DEFINITIONS.map((item) => [`${item.storageDomain}\u0000${item.pathKey}`, item]),
);

function readObject(value: unknown): Record<string, any> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function occurrence(
  storageDomain: string,
  pathKey: string,
  recordId: string,
): DiscoveredCustomerAssociationPath {
  const found = DEFINITION_BY_PAIR.get(`${storageDomain}\u0000${pathKey}`);
  return {
    storageDomain,
    pathKey,
    recordId,
    ...(found ? { definitionId: found.id } : {}),
  };
}

function pushIfTarget(
  output: DiscoveredCustomerAssociationPath[],
  customerIds: Set<string>,
  value: unknown,
  storageDomain: string,
  pathKey: string,
  recordId: string,
) {
  if (customerIds.has(String(value || '').trim())) {
    output.push(occurrence(storageDomain, pathKey, recordId));
  }
}

function discoverCustomerRootSubrecords(
  output: DiscoveredCustomerAssociationPath[],
  row: any,
  customerIds: Set<string>,
  data: Record<string, any>,
) {
  if (row.domain !== STORAGE_KEYS.CUSTOMERS || !customerIds.has(String(row.recordId || ''))) return;
  const recordId = String(row.recordId);
  const activities = Array.isArray(data.activityRecords) ? data.activityRecords : [];
  if (activities.some((item) => item?.type === 'follow')) {
    output.push(occurrence(STORAGE_KEYS.CUSTOMERS, 'data.activityRecords[type=follow]', recordId));
  }
  if (activities.length) output.push(occurrence(STORAGE_KEYS.CUSTOMERS, 'data.activityRecords[]', recordId));
  if (activities.some((item) => Array.isArray(item?.attachments) && item.attachments.length)) {
    output.push(occurrence(STORAGE_KEYS.CUSTOMERS, 'data.activityRecords[].attachments[]', recordId));
  }
  if (Array.isArray(data.growthPath) && data.growthPath.length) {
    output.push(occurrence(STORAGE_KEYS.CUSTOMERS, 'data.growthPath[]', recordId));
  }
  if (Array.isArray(data.growthRecords) && data.growthRecords.length) {
    output.push(occurrence(STORAGE_KEYS.CUSTOMERS, 'data.growthRecords[]', recordId));
  }
  if ((Array.isArray(data.manualTagIds) && data.manualTagIds.length) || (Array.isArray(data.tags) && data.tags.length)) {
    output.push(occurrence(STORAGE_KEYS.CUSTOMERS, 'data.manualTagIds[]', recordId));
  }
}

/** The single stable-path scanner shared by delete, audit, and future merge precheck. */
export async function discoverCustomerAssociationDomains(
  tx: CustomerAssociationReader,
  customerIdsInput: string[],
): Promise<DiscoveredCustomerAssociationPath[]> {
  const customerIds = new Set(customerIdsInput.map((id) => String(id).trim()).filter(Boolean));
  if (!customerIds.size) return [];
  const output: DiscoveredCustomerAssociationPath[] = [];

  const businessRows = tx.businessRecord?.findMany
    ? await tx.businessRecord.findMany({ select: { id: true, domain: true, recordId: true, customerId: true, data: true } })
    : [];
  for (const row of businessRows) {
    const storageDomain = String(row.domain || '');
    const recordId = String(row.recordId || row.id || '');
    const data = readObject(row.data);
    pushIfTarget(output, customerIds, row.customerId, storageDomain, 'customerId', recordId);
    pushIfTarget(output, customerIds, data.customerId, storageDomain, 'data.customerId', recordId);
    pushIfTarget(output, customerIds, readObject(data.orderData).customerId, storageDomain, 'data.orderData.customerId', recordId);
    if (String(data.subjectType || '') === 'customer') {
      pushIfTarget(output, customerIds, data.subjectId, storageDomain, 'data.subjectId|data.subjectType=customer', recordId);
    }
    discoverCustomerRootSubrecords(output, row, customerIds, data);
  }

  const leadRows = tx.leadRecord?.findMany
    ? await tx.leadRecord.findMany({ select: { id: true, data: true } })
    : [];
  for (const row of leadRows) {
    pushIfTarget(output, customerIds, readObject(row.data).customerId, 'lead_records', 'data.customerId', String(row.id));
  }

  const todoRows = tx.customerTodo?.findMany
    ? await tx.customerTodo.findMany({ select: { id: true, customerId: true } })
    : [];
  for (const row of todoRows) {
    pushIfTarget(output, customerIds, row.customerId, 'customer_todos', 'customerId', String(row.id));
  }

  if (tx.appStorage?.findUnique) {
    const financeRow = await tx.appStorage.findUnique({ where: { key: STORAGE_KEYS.FINANCE } });
    const finance = readObject(financeRow?.value);
    for (const collection of ['incomes', 'expenses', 'transactions'] as const) {
      const rows = Array.isArray(finance[collection]) ? finance[collection] : [];
      rows.forEach((item: any, index: number) => {
        pushIfTarget(
          output,
          customerIds,
          item?.customerId,
          STORAGE_KEYS.FINANCE,
          `value.${collection}[].customerId`,
          String(item?.id || `${collection}:${index}`),
        );
      });
    }
  }

  return output.sort((left, right) => (
    left.storageDomain.localeCompare(right.storageDomain)
    || left.pathKey.localeCompare(right.pathKey)
    || left.recordId.localeCompare(right.recordId)
  ));
}

export async function findBlockingCustomerAssociations(
  tx: CustomerAssociationReader,
  customerId: string,
): Promise<string[]> {
  const discovered = await discoverCustomerAssociationDomains(tx, [customerId]);
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const item of discovered) {
    const registered = DEFINITION_BY_PAIR.get(`${item.storageDomain}\u0000${item.pathKey}`);
    const label = registered
      ? registered.blocksSoftDelete ? registered.blockerLabel : ''
      : `未登记关联（${item.storageDomain}:${item.pathKey}）`;
    if (label && !seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

/**
 * Lock protocol for delete/merge writers. All association creators must acquire the
 * same per-customer key before inserting a stable customer link.
 */
export async function lockCustomerAssociationScope(
  tx: CustomerAssociationReader,
  customerIdsInput: string[],
): Promise<void> {
  const customerIds = Array.from(new Set(customerIdsInput.map((id) => String(id).trim()).filter(Boolean))).sort();
  if (!customerIds.length) return;
  if (!tx.appStorage?.upsert || !tx.$queryRaw) {
    throw new Error('客户关联锁协议不可用');
  }
  for (const customerId of customerIds) {
    const key = `aaos_customer_association_lock:${customerId}`;
    await tx.appStorage.upsert({
      where: { key },
      update: {},
      create: { key, value: { kind: 'customer_association_lock', customerId } },
    });
    await tx.$queryRaw(Prisma.sql`SELECT \`key\` FROM app_storage WHERE \`key\` = ${key} FOR UPDATE`);
  }
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM business_records
    WHERE customerId IN (${Prisma.join(customerIds)})
       OR JSON_UNQUOTE(JSON_EXTRACT(data, '$.customerId')) IN (${Prisma.join(customerIds)})
       OR JSON_UNQUOTE(JSON_EXTRACT(data, '$.orderData.customerId')) IN (${Prisma.join(customerIds)})
       OR (
         JSON_UNQUOTE(JSON_EXTRACT(data, '$.subjectType')) = 'customer'
         AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.subjectId')) IN (${Prisma.join(customerIds)})
       )
    ORDER BY domain, recordId
    FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM lead_records
    WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.customerId')) IN (${Prisma.join(customerIds)})
    ORDER BY id
    FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM customer_todos
    WHERE customerId IN (${Prisma.join(customerIds)})
    ORDER BY id
    FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`SELECT \`key\` FROM app_storage WHERE \`key\` = ${STORAGE_KEYS.FINANCE} FOR UPDATE`);
}

export interface CustomerAssociationAuditOptions {
  apply: boolean;
  checkpointKey?: string;
}

export interface CustomerAssociationAuditRepairRow {
  storageDomain: string;
  pathKey: string;
  recordId: string;
  reason:
    | 'CUSTOMER_IDENTITY_NOT_FOUND'
    | 'CUSTOMER_IDENTITY_AMBIGUOUS'
    | 'UNREGISTERED_CUSTOMER_ASSOCIATION_PATH';
}

export interface CustomerAssociationAuditSummary {
  apply: boolean;
  scannedRecords: number;
  discoveredPaths: number;
  backfillCandidates: number;
  backfilled: number;
  repairRows: CustomerAssociationAuditRepairRow[];
  checkpointKey?: string;
  /** Production rollout remains gated until every association writer uses the same lock protocol. */
  requiresAssociationWriterLock: true;
}

type AuditCustomer = { id: string; names: string[] };
type AuditCandidate = {
  storageModel: 'business_record' | 'lead_record' | 'customer_todo' | 'app_storage';
  storageDomain: string;
  pathKey: string;
  recordId: string;
  /**
   * The legacy display identity observed during preflight.  It must be
   * re-resolved in the write transaction; retaining only the preflight ID
   * would turn a concurrent rename into an unsafe stable-ID backfill.
   */
  legacyName: string;
  customerId: string;
  row: any;
  collection?: 'incomes' | 'expenses' | 'transactions';
  itemIndex?: number;
};

function normalizedIdentity(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function valueAtPath(value: unknown, path: string): unknown {
  const input = readObject(value);
  if (path === 'customerId') return (value as any)?.customerId;
  if (path === 'data.customerId') return input.customerId;
  if (path === 'data.orderData.customerId') return readObject(input.orderData).customerId;
  if (path === 'data.customerName') return input.customerName;
  if (path === 'data.name') return input.name;
  if (path === 'data.orderData.customerName') return readObject(input.orderData).customerName;
  return undefined;
}

function firstLegacyName(row: any, definition: CustomerAssociationDefinition): string {
  for (const path of definition.legacyNamePaths) {
    if (path.startsWith('value.')) continue;
    const value = path.startsWith('data.')
      ? valueAtPath(row.data, path)
      : (row as Record<string, unknown>)[path];
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function matchingCustomerIds(name: string, customers: AuditCustomer[]): string[] {
  const key = normalizedIdentity(name);
  if (!key) return [];
  return customers
    .filter((customer) => customer.names.some((candidate) => normalizedIdentity(candidate) === key))
    .map((customer) => customer.id);
}

function setBusinessPath(row: any, pathKey: string, customerId: string) {
  const nextData = structuredClone(readObject(row.data));
  if (pathKey === 'customerId') return { customerId, data: nextData, dataChanged: false };
  if (pathKey === 'data.customerId') {
    nextData.customerId = customerId;
    return { customerId: row.customerId, data: nextData, dataChanged: true };
  }
  if (pathKey === 'data.orderData.customerId') {
    nextData.orderData = { ...readObject(nextData.orderData), customerId };
    return { customerId: row.customerId, data: nextData, dataChanged: true };
  }
  throw new Error(`不支持回填关联路径：${pathKey}`);
}

function repairKey(row: CustomerAssociationAuditRepairRow) {
  return `${row.storageDomain}\u0000${row.pathKey}\u0000${row.recordId}\u0000${row.reason}`;
}

export async function auditHistoricalCustomerAssociationIds(
  prisma: any,
  options: CustomerAssociationAuditOptions,
): Promise<CustomerAssociationAuditSummary> {
  const checkpointKey = String(options.checkpointKey || '').trim() || undefined;
  const [businessRows, leadRows, todoRows, financeRow] = await Promise.all([
    prisma.businessRecord?.findMany?.({ select: { id: true, domain: true, recordId: true, customerId: true, data: true, updatedAt: true } }) ?? [],
    prisma.leadRecord?.findMany?.({ select: { id: true, data: true, updatedAt: true } }) ?? [],
    prisma.customerTodo?.findMany?.({ select: { id: true, customerId: true, customerName: true, updatedAt: true } }) ?? [],
    prisma.appStorage?.findUnique?.({ where: { key: STORAGE_KEYS.FINANCE } }) ?? null,
  ]);
  const customers: AuditCustomer[] = businessRows
    .filter((row: any) => row.domain === STORAGE_KEYS.CUSTOMERS)
    .map((row: any) => readObject(row.data))
    .filter((customer: any) => customer.id && !customer.deletedAt)
    .map((customer: any) => ({
      id: String(customer.id),
      names: [String(customer.name || '').trim(), String(customer.company || '').trim()].filter(Boolean),
    }));
  const activeCustomerIds = customers.map((customer) => customer.id);
  const repairRows: CustomerAssociationAuditRepairRow[] = [];
  const repairKeys = new Set<string>();
  const addRepair = (row: CustomerAssociationAuditRepairRow) => {
    const key = repairKey(row);
    if (!repairKeys.has(key)) {
      repairKeys.add(key);
      repairRows.push(row);
    }
  };
  const candidates: AuditCandidate[] = [];
  const candidateKeys = new Set<string>();
  const addLegacyCandidate = (
    base: Omit<AuditCandidate, 'customerId' | 'legacyName'>,
    legacyName: string,
  ) => {
    const matches = matchingCustomerIds(legacyName, customers);
    if (matches.length !== 1) {
      addRepair({
        storageDomain: base.storageDomain,
        pathKey: base.pathKey,
        recordId: base.recordId,
        reason: matches.length === 0 ? 'CUSTOMER_IDENTITY_NOT_FOUND' : 'CUSTOMER_IDENTITY_AMBIGUOUS',
      });
      return;
    }
    const key = `${base.storageDomain}\u0000${base.pathKey}\u0000${base.recordId}`;
    if (!candidateKeys.has(key)) {
      candidateKeys.add(key);
      candidates.push({ ...base, legacyName, customerId: matches[0] });
    }
  };

  for (const row of businessRows) {
    for (const registered of CUSTOMER_ASSOCIATION_DEFINITIONS) {
      if (registered.storageModel !== 'business_record' || registered.storageDomain !== row.domain) continue;
      if (!['customerId', 'data.customerId', 'data.orderData.customerId'].includes(registered.pathKey)) continue;
      const stableValue = registered.pathKey === 'customerId'
        ? row.customerId
        : valueAtPath(row.data, registered.pathKey);
      if (String(stableValue || '').trim()) continue;
      const legacyName = firstLegacyName(row, registered);
      if (!legacyName) continue;
      addLegacyCandidate({
        storageModel: 'business_record',
        storageDomain: row.domain,
        pathKey: registered.pathKey,
        recordId: String(row.recordId || row.id),
        row,
      }, legacyName);
    }
  }

  const leadDefinition = CUSTOMER_ASSOCIATION_DEFINITIONS.find((item) => item.id === 'lead_records:data.customerId')!;
  for (const row of leadRows) {
    const data = readObject(row.data);
    if (String(data.customerId || '').trim()) continue;
    const legacyName = firstLegacyName({ data }, leadDefinition);
    if (!legacyName) continue;
    addLegacyCandidate({
      storageModel: 'lead_record',
      storageDomain: 'lead_records',
      pathKey: 'data.customerId',
      recordId: String(row.id),
      row,
    }, legacyName);
  }

  const todoDefinition = CUSTOMER_ASSOCIATION_DEFINITIONS.find((item) => item.id === 'customer_todos:customerId')!;
  for (const row of todoRows) {
    if (String(row.customerId || '').trim()) continue;
    const legacyName = firstLegacyName(row, todoDefinition);
    if (!legacyName) continue;
    addLegacyCandidate({
      storageModel: 'customer_todo',
      storageDomain: 'customer_todos',
      pathKey: 'customerId',
      recordId: String(row.id),
      row,
    }, legacyName);
  }

  const finance = readObject(financeRow?.value);
  for (const collection of ['incomes', 'expenses', 'transactions'] as const) {
    const items = Array.isArray(finance[collection]) ? finance[collection] : [];
    items.forEach((item: any, itemIndex: number) => {
      if (String(item?.customerId || '').trim() || !String(item?.customerName || '').trim()) return;
      addLegacyCandidate({
        storageModel: 'app_storage',
        storageDomain: STORAGE_KEYS.FINANCE,
        pathKey: `value.${collection}[].customerId`,
        recordId: String(item?.id || `${collection}:${itemIndex}`),
        row: financeRow,
        collection,
        itemIndex,
      }, String(item.customerName));
    });
  }

  const discovered = await discoverCustomerAssociationDomains(prisma, activeCustomerIds);
  for (const item of discovered) {
    if (!item.definitionId) {
      addRepair({ ...item, reason: 'UNREGISTERED_CUSTOMER_ASSOCIATION_PATH' });
    }
  }

  const summary: CustomerAssociationAuditSummary = {
    apply: options.apply === true,
    scannedRecords: businessRows.length + leadRows.length + todoRows.length
      + (Array.isArray(finance.incomes) ? finance.incomes.length : 0)
      + (Array.isArray(finance.expenses) ? finance.expenses.length : 0)
      + (Array.isArray(finance.transactions) ? finance.transactions.length : 0),
    discoveredPaths: discovered.length,
    backfillCandidates: candidates.length,
    backfilled: 0,
    repairRows: repairRows.sort((left, right) => repairKey(left).localeCompare(repairKey(right))),
    ...(checkpointKey ? { checkpointKey } : {}),
    requiresAssociationWriterLock: true,
  };
  if (!options.apply || candidates.length === 0) return summary;

  await prisma.$transaction(async (tx: any) => {
    const candidateCustomerIds = Array.from(new Set(candidates.map((candidate) => candidate.customerId))).sort();
    // A repair is an association writer just like an order or a todo. Serialize
    // it with delete/merge first. Then lock the whole currently-existing
    // customer identity set: a generic customer rename locks its root row, so
    // it cannot make a previously unique legacy name ambiguous after the
    // transactional recheck below.
    await lockCustomerAssociationScope(tx, candidateCustomerIds);
    await tx.$queryRaw(Prisma.sql`
      SELECT id
      FROM business_records
      WHERE domain = ${STORAGE_KEYS.CUSTOMERS}
      FOR UPDATE
    `);
    const currentCustomers: AuditCustomer[] = (await tx.businessRecord.findMany({
      where: { domain: STORAGE_KEYS.CUSTOMERS },
    }))
      .map((row: any) => readObject(row.data))
      .filter((customer: any) => customer.id && !customer.deletedAt)
      .map((customer: any) => ({
        id: String(customer.id),
        names: [String(customer.name || '').trim(), String(customer.company || '').trim()].filter(Boolean),
      }));

    const safeCandidates: AuditCandidate[] = [];
    for (const candidate of candidates) {
      const currentMatches = matchingCustomerIds(candidate.legacyName, currentCustomers);
      if (currentMatches.length === 1 && currentMatches[0] === candidate.customerId) {
        safeCandidates.push(candidate);
        continue;
      }
      addRepair({
        storageDomain: candidate.storageDomain,
        pathKey: candidate.pathKey,
        recordId: candidate.recordId,
        // A unique but different stable ID is also unsafe: the legacy display
        // identity no longer proves that the preflight customer is the same one.
        reason: currentMatches.length === 0 ? 'CUSTOMER_IDENTITY_NOT_FOUND' : 'CUSTOMER_IDENTITY_AMBIGUOUS',
      });
    }

    const businessChanges = new Map<string, { row: any; customerId: unknown; data: Record<string, any>; dataChanged: boolean; count: number }>();
    const leadChanges = new Map<string, { row: any; data: Record<string, any>; count: number }>();
    const todoChanges = new Map<string, { row: any; customerId: string; count: number }>();
    const nextFinance = structuredClone(finance);
    let financeCount = 0;
    for (const candidate of [...safeCandidates].sort((left, right) => (
      left.storageDomain.localeCompare(right.storageDomain)
      || left.pathKey.localeCompare(right.pathKey)
      || left.recordId.localeCompare(right.recordId)
    ))) {
      if (candidate.storageModel === 'business_record') {
        const existing = businessChanges.get(candidate.row.id) || {
          row: candidate.row,
          customerId: candidate.row.customerId,
          data: structuredClone(readObject(candidate.row.data)),
          dataChanged: false,
          count: 0,
        };
        const changed = setBusinessPath({ ...candidate.row, customerId: existing.customerId, data: existing.data }, candidate.pathKey, candidate.customerId);
        existing.customerId = changed.customerId;
        existing.data = changed.data;
        existing.dataChanged ||= changed.dataChanged;
        existing.count += 1;
        businessChanges.set(candidate.row.id, existing);
      } else if (candidate.storageModel === 'lead_record') {
        const existing = leadChanges.get(candidate.row.id) || {
          row: candidate.row,
          data: structuredClone(readObject(candidate.row.data)),
          count: 0,
        };
        existing.data.customerId = candidate.customerId;
        existing.count += 1;
        leadChanges.set(candidate.row.id, existing);
      } else if (candidate.storageModel === 'customer_todo') {
        const existing = todoChanges.get(candidate.row.id) || {
          row: candidate.row,
          customerId: candidate.customerId,
          count: 0,
        };
        existing.customerId = candidate.customerId;
        existing.count += 1;
        todoChanges.set(candidate.row.id, existing);
      } else if (candidate.collection !== undefined && candidate.itemIndex !== undefined) {
        nextFinance[candidate.collection][candidate.itemIndex].customerId = candidate.customerId;
        financeCount += 1;
      }
    }

    for (const change of [...businessChanges.values()].sort((a, b) => String(a.row.recordId).localeCompare(String(b.row.recordId)))) {
      const data: Record<string, unknown> = {};
      if (change.customerId !== change.row.customerId) data.customerId = change.customerId || null;
      if (change.dataChanged) data.data = change.data;
      const result = await tx.businessRecord.updateMany({
        where: { id: change.row.id, updatedAt: change.row.updatedAt },
        data,
      });
      if (result.count !== 1) throw new Error(`客户关联审计并发更新：${change.row.recordId}`);
      summary.backfilled += change.count;
    }
    for (const change of [...leadChanges.values()].sort((a, b) => String(a.row.id).localeCompare(String(b.row.id)))) {
      const result = await tx.leadRecord.updateMany({
        where: { id: change.row.id, updatedAt: change.row.updatedAt },
        data: { data: change.data },
      });
      if (result.count !== 1) throw new Error(`客户关联审计并发更新：${change.row.id}`);
      summary.backfilled += change.count;
    }
    for (const change of [...todoChanges.values()].sort((a, b) => String(a.row.id).localeCompare(String(b.row.id)))) {
      const result = await tx.customerTodo.updateMany({
        where: { id: change.row.id, updatedAt: change.row.updatedAt },
        data: { customerId: change.customerId },
      });
      if (result.count !== 1) throw new Error(`客户关联审计并发更新：${change.row.id}`);
      summary.backfilled += change.count;
    }
    if (financeCount > 0) {
      const result = await tx.appStorage.updateMany({
        where: { key: STORAGE_KEYS.FINANCE, updatedAt: financeRow.updatedAt },
        data: { value: nextFinance },
      });
      if (result.count !== 1) throw new Error('客户关联审计并发更新：aaos_finance');
      summary.backfilled += financeCount;
    }
    if (checkpointKey) {
      await tx.appStorage.upsert({
        where: { key: checkpointKey },
        update: { value: { version: 1, completed: true, backfilled: summary.backfilled } },
        create: { key: checkpointKey, value: { version: 1, completed: true, backfilled: summary.backfilled } },
      });
    }
  });
  summary.repairRows.sort((left, right) => repairKey(left).localeCompare(repairKey(right)));
  return summary;
}
