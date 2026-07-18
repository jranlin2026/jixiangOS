import { STORAGE_KEYS } from '../../src/shared/utils/constants';

type JsonObject = Record<string, any>;

export interface CustomerAssociationMergeEntry {
  domain: string;
  recordId: string;
  beforeSnapshot: JsonObject;
  afterSnapshot: JsonObject;
  rowRevision?: number | null;
  updatedAtValue?: Date | null;
}

function object(value: unknown): JsonObject {
  if (typeof value === 'string') {
    try { return object(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? structuredClone(value as JsonObject)
    : {};
}

export function rewriteCustomerAssociationValue(
  source: unknown,
  secondaryIds: ReadonlySet<string>,
  mainCustomerId: string,
  mainCustomerName: string,
): { value: JsonObject; changed: boolean } {
  const value = object(source);
  let changed = false;
  if (secondaryIds.has(String(value.customerId || ''))) {
    value.customerId = mainCustomerId;
    if ('customerName' in value) value.customerName = mainCustomerName;
    changed = true;
  }
  const orderData = object(value.orderData);
  if (secondaryIds.has(String(orderData.customerId || ''))) {
    orderData.customerId = mainCustomerId;
    if ('customerName' in orderData) orderData.customerName = mainCustomerName;
    value.orderData = orderData;
    changed = true;
  }
  if (value.subjectType === 'customer' && secondaryIds.has(String(value.subjectId || ''))) {
    value.subjectId = mainCustomerId;
    changed = true;
  }
  return { value, changed };
}

export async function migrateCustomerAssociations(
  tx: any,
  mainCustomerId: string,
  secondaryCustomerIds: string[],
  mainCustomerName: string,
): Promise<CustomerAssociationMergeEntry[]> {
  const secondaryIds = new Set(secondaryCustomerIds);
  const entries: CustomerAssociationMergeEntry[] = [];

  const businessRows = await tx.businessRecord.findMany({
    where: { domain: { not: STORAGE_KEYS.CUSTOMERS } },
    select: { id: true, domain: true, recordId: true, customerId: true, data: true, recordRevision: true, updatedAt: true },
  });
  for (const row of businessRows) {
    const before = { customerId: row.customerId ?? null, data: object(row.data) };
    const rewritten = rewriteCustomerAssociationValue(row.data, secondaryIds, mainCustomerId, mainCustomerName);
    const nextCustomerId = secondaryIds.has(String(row.customerId || '')) ? mainCustomerId : row.customerId;
    if (nextCustomerId === row.customerId && !rewritten.changed) continue;
    const after = { customerId: nextCustomerId ?? null, data: rewritten.value };
    await tx.businessRecord.update({
      where: { id: row.id },
      data: { ...after, recordRevision: { increment: 1 } },
    });
    entries.push({ domain: row.domain, recordId: row.recordId, beforeSnapshot: before, afterSnapshot: after, rowRevision: row.recordRevision, updatedAtValue: row.updatedAt });
  }

  const leadRows = await tx.leadRecord.findMany({ select: { id: true, data: true, updatedAt: true } });
  for (const row of leadRows) {
    const rewritten = rewriteCustomerAssociationValue(row.data, secondaryIds, mainCustomerId, mainCustomerName);
    if (!rewritten.changed) continue;
    const before = { data: object(row.data) };
    const after = { data: rewritten.value };
    await tx.leadRecord.update({ where: { id: row.id }, data: after });
    entries.push({ domain: 'lead_records', recordId: row.id, beforeSnapshot: before, afterSnapshot: after, updatedAtValue: row.updatedAt });
  }

  const todoRows = await tx.customerTodo.findMany({ select: { id: true, customerId: true, customerName: true, updatedAt: true } });
  for (const row of todoRows) {
    if (!secondaryIds.has(row.customerId)) continue;
    const before = { customerId: row.customerId, customerName: row.customerName };
    const after = { customerId: mainCustomerId, customerName: mainCustomerName };
    await tx.customerTodo.update({ where: { id: row.id }, data: after });
    entries.push({ domain: 'customer_todos', recordId: row.id, beforeSnapshot: before, afterSnapshot: after, updatedAtValue: row.updatedAt });
  }

  const financeRow = await tx.appStorage.findUnique({ where: { key: STORAGE_KEYS.FINANCE } });
  if (financeRow) {
    const beforeValue = object(financeRow.value);
    const afterValue = structuredClone(beforeValue);
    let changed = false;
    for (const collection of ['incomes', 'expenses', 'transactions']) {
      if (!Array.isArray(afterValue[collection])) continue;
      afterValue[collection] = afterValue[collection].map((item: unknown) => {
        const rewritten = rewriteCustomerAssociationValue(item, secondaryIds, mainCustomerId, mainCustomerName);
        changed ||= rewritten.changed;
        return rewritten.value;
      });
    }
    if (changed) {
      await tx.appStorage.update({ where: { key: STORAGE_KEYS.FINANCE }, data: { value: afterValue } });
      entries.push({ domain: STORAGE_KEYS.FINANCE, recordId: STORAGE_KEYS.FINANCE, beforeSnapshot: { value: beforeValue }, afterSnapshot: { value: afterValue }, updatedAtValue: financeRow.updatedAt });
    }
  }
  return entries;
}

export async function restoreCustomerAssociations(tx: any, entries: CustomerAssociationMergeEntry[]): Promise<void> {
  for (const entry of [...entries].reverse()) {
    if (entry.domain === 'lead_records') {
      await tx.leadRecord.update({ where: { id: entry.recordId }, data: entry.beforeSnapshot });
    } else if (entry.domain === 'customer_todos') {
      await tx.customerTodo.update({ where: { id: entry.recordId }, data: entry.beforeSnapshot });
    } else if (entry.domain === STORAGE_KEYS.FINANCE && entry.recordId === STORAGE_KEYS.FINANCE) {
      await tx.appStorage.update({ where: { key: STORAGE_KEYS.FINANCE }, data: entry.beforeSnapshot });
    } else {
      await tx.businessRecord.update({
        where: { domain_recordId: { domain: entry.domain, recordId: entry.recordId } },
        data: { ...entry.beforeSnapshot, ...(entry.rowRevision === null || entry.rowRevision === undefined ? {} : { recordRevision: { increment: 1 } }) },
      });
    }
  }
}
