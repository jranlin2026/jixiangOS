import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer } from '../../src/types/customer';
import type { Product } from '../../src/types/product';
import type { AfterSalesSourceConfig, OrderTypeConfig } from '../../src/types/settings';
import type { BusinessImportRow, BusinessImportType, OrderImportRow, RecoveryImportRow } from '../../src/types/businessImport';
import type { BusinessAttachment } from '../../src/types/businessAttachment';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { buildDataVisibilityScopeForUser } from '../../src/shared/utils/dataVisibility';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import { canReadCustomer, loadCustomerAccessContext } from './customerAccessPolicy';
import {
  createBusinessImportService,
  BusinessImportError,
  type BusinessImportDirectory,
  type BusinessImportPrecheckRecord,
  type ValidatedBusinessImportRow,
} from './businessImportService';
import { BUSINESS_ATTACHMENT_DOMAIN, type BusinessAttachmentRecord } from './businessAttachmentService';

const clean = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => clean(value).toLocaleLowerCase('zh-CN');
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

type AttachmentPrisma = Pick<PrismaClient, 'businessRecord'>;
type ImportAttachmentGroups = {
  paymentProof: BusinessAttachment[];
  dealEvidence: BusinessAttachment[];
  recoveryEvidence: BusinessAttachment[];
};
const BUSINESS_IMPORT_ATTACHMENT_BATCH_MAX_BYTES = 200 * 1024 * 1024;

function importAttachmentNames(value: unknown): string[] {
  return clean(value).split(/[;；\n\r]+/u).map(clean).filter(Boolean);
}

function attachmentBaseName(value: string): string {
  return value.replace(/\\/gu, '/').split('/').pop() || value;
}

function importAttachmentManifest(type: BusinessImportType, row: BusinessImportRow) {
  if (type === 'orders') {
    const order = row as OrderImportRow;
    return [
      { label: '付款截图', category: 'order-payment-proof' as const, names: importAttachmentNames(order.paymentProofFileName), ids: order.paymentProofAttachmentIds || [] },
      { label: '成交资料', category: 'order-deal-evidence' as const, names: importAttachmentNames(order.dealEvidenceFileNames), ids: order.dealEvidenceAttachmentIds || [] },
    ];
  }
  const recovery = row as RecoveryImportRow;
  return [{
    label: '挽回凭证', category: 'recovery-payment-proof' as const,
    names: importAttachmentNames(recovery.recoveryEvidenceFileNames), ids: recovery.recoveryEvidenceAttachmentIds || [],
  }];
}

async function importAttachmentRecords(prisma: AttachmentPrisma, ids: string[]): Promise<Map<string, BusinessAttachmentRecord>> {
  if (!ids.length) return new Map();
  const rows = await prisma.businessRecord.findMany({
    where: { domain: BUSINESS_ATTACHMENT_DOMAIN, recordId: { in: [...new Set(ids)] } },
    select: { recordId: true, data: true },
  });
  return new Map(rows.flatMap((row) => {
    const record = readValue<BusinessAttachmentRecord | null>(row.data, null);
    return record && record.id === row.recordId ? [[record.id, record] as const] : [];
  }));
}

function publicImportAttachment(record: BusinessAttachmentRecord): BusinessAttachment {
  const { storageName: _storageName, draftKey: _draftKey, ...attachment } = record;
  return attachment;
}

function importDraftIdentity(record: BusinessAttachmentRecord, type: BusinessImportType): { draftId: string; rowNumber: number } | null {
  const match = record.draftKey.match(new RegExp(`^business-import:${type}:([^:]+):(\\d+)$`, 'u'));
  return match ? { draftId: match[1], rowNumber: Number(match[2]) } : null;
}

function verifiedImportAttachmentGroups(
  records: Map<string, BusinessAttachmentRecord>,
  actor: Pick<AuthenticatedUser, 'id'>,
  type: BusinessImportType,
  row: BusinessImportRow,
): ImportAttachmentGroups {
  const result: ImportAttachmentGroups = { paymentProof: [], dealEvidence: [], recoveryEvidence: [] };
  for (const group of importAttachmentManifest(type, row)) {
    if (group.names.length !== group.ids.length) throw new BusinessImportError(`第 ${row.rowNumber} 行：${group.label}上传结果不完整`, 409);
    group.ids.forEach((id, index) => {
      const record = records.get(id);
      if (!record) throw new BusinessImportError(`第 ${row.rowNumber} 行：${group.label}附件不存在或已删除`, 409);
      if (record.uploadedById !== actor.id) throw new BusinessImportError(`第 ${row.rowNumber} 行：${group.label}附件不属于当前导入人`, 409);
      const draft = importDraftIdentity(record, type);
      if (!draft || draft.rowNumber !== row.rowNumber) throw new BusinessImportError(`第 ${row.rowNumber} 行：${group.label}附件与 Excel 行号不匹配`, 409);
      if (record.category !== group.category || !record.mimeType.startsWith('image/')) {
        throw new BusinessImportError(`第 ${row.rowNumber} 行：${group.label}附件分类无效`, 409);
      }
      if (lower(record.name) !== lower(attachmentBaseName(group.names[index]))) {
        throw new BusinessImportError(`第 ${row.rowNumber} 行：${group.label}附件文件名不一致`, 409);
      }
      const target = group.category === 'order-payment-proof'
        ? result.paymentProof
        : group.category === 'order-deal-evidence'
          ? result.dealEvidence
          : result.recoveryEvidence;
      target.push(publicImportAttachment(record));
    });
  }
  return result;
}

export async function validateBusinessImportAttachments(
  prisma: AttachmentPrisma,
  actor: AuthenticatedUser,
  type: BusinessImportType,
  rows: BusinessImportRow[],
  expectedDraftId: string,
): Promise<void> {
  const ids = rows.flatMap((row) => importAttachmentManifest(type, row).flatMap((group) => group.ids));
  if (new Set(ids).size !== ids.length) throw new BusinessImportError('同一张导入图片不能绑定到多条记录', 409);
  const records = await importAttachmentRecords(prisma, ids);
  const totalBytes = [...records.values()].reduce((sum, record) => sum + Number(record.size || 0), 0);
  if (totalBytes > BUSINESS_IMPORT_ATTACHMENT_BATCH_MAX_BYTES) throw new BusinessImportError('导入图片总大小不能超过 200 MB', 409);
  ids.forEach((id) => {
    const record = records.get(id);
    const draft = record ? importDraftIdentity(record, type) : null;
    if (draft && draft.draftId !== expectedDraftId) throw new BusinessImportError('导入图片不属于本次预检文件', 409);
  });
  rows.forEach((row) => { verifiedImportAttachmentGroups(records, actor, type, row); });
}

export async function loadVerifiedBusinessImportAttachments(
  prisma: AttachmentPrisma,
  actor: Pick<AuthenticatedUser, 'id'>,
  type: BusinessImportType,
  row: BusinessImportRow,
): Promise<ImportAttachmentGroups> {
  const ids = importAttachmentManifest(type, row).flatMap((group) => group.ids);
  return verifiedImportAttachmentGroups(await importAttachmentRecords(prisma, ids), actor, type, row);
}

export function businessImportScopeDomain(type: BusinessImportType): 'orders' | 'recoveryOrderApplications' {
  return type === 'orders' ? 'orders' : 'recoveryOrderApplications';
}

function isUniqueConstraint(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'P2002';
}

function readValue<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

export function businessImportContactKeys(customer: Pick<Customer, 'phone' | 'wechat'>): string[] {
  const phone = clean(customer.phone);
  const normalizedPhone = phone.replace(/\D/g, '');
  const mainland = normalizedPhone.slice(-11);
  const phoneKey = /^1[3-9]\d{9}$/.test(mainland) ? `phone:+86${mainland}` : phone ? `phone:${phone}` : '';
  return [phoneKey, customer.wechat ? `wechat:${lower(customer.wechat)}` : ''].filter(Boolean);
}

function thirdPartyNumber(record: { data: unknown }): string {
  const data = readValue<Record<string, unknown>>(record.data, {});
  return lower(data.thirdPartyOrderNo);
}

export async function loadBusinessImportDirectory(prisma: PrismaClient, actor: AuthenticatedUser, _type: BusinessImportType): Promise<BusinessImportDirectory> {
  const [storage, productRecords, users, roles, departments, customers, orders, recoveries, pendingReservations, context] = await Promise.all([
    prisma.appStorage.findMany({ where: { key: { in: [STORAGE_KEYS.ORDER_TYPE_CONFIGS, STORAGE_KEYS.AFTER_SALES_SOURCE_CONFIGS] } } }),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.PRODUCTS } }),
    prisma.user.findMany({ where: { isActive: true, employmentStatus: 'active' }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    prisma.role.findMany({ where: { isActive: true } }),
    prisma.department.findMany(),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.CUSTOMERS, mergedIntoId: null } }),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS } }),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.RECOVERY_ORDERS } }),
    prisma.businessImportNumberReservation.findMany({
      where: { job: { status: { in: ['queued', 'running'] } } },
      select: { importType: true, normalizedNumber: true },
    }),
    loadCustomerAccessContext(prisma, actor),
  ]);
  const activeUsers = users.map(mapPrismaUser);
  const scope = buildDataVisibilityScopeForUser(actor as any, activeUsers, roles.map(mapPrismaRole), departments as any,
    businessImportScopeDomain(_type));
  const values = new Map(storage.map((row) => [row.key, row.value]));
  // Product settings use record-level persistence. appStorage may still contain
  // a stale pre-migration snapshot, so the import directory must never read it.
  const productConfigs = productRecords.map((row) => readValue<Product>(row.data, {} as Product));
  const products = productConfigs.filter((item) => item.isActive !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((item) => ({ id: item.id, name: item.name, level: item.level }));
  const orderTypes = readValue<OrderTypeConfig[]>(values.get(STORAGE_KEYS.ORDER_TYPE_CONFIGS), []).filter((item) => item.isActive !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder).map((item) => ({ id: item.id, name: item.name }));
  const sources = readValue<AfterSalesSourceConfig[]>(values.get(STORAGE_KEYS.AFTER_SALES_SOURCE_CONFIGS), []).filter((item) => item.isActive !== false);
  const platforms = sources.filter((item) => !item.parentId).sort((a, b) => a.sortOrder - b.sortOrder).map((item) => ({ id: item.id, name: item.name }));
  const shops = sources.filter((item) => item.parentId).sort((a, b) => a.sortOrder - b.sortOrder).map((item) => ({ id: item.id, platformId: item.parentId!, name: item.name }));
  const customerMatchesByContact = new Map<string, Array<{ id: string; name: string; inScope: boolean }>>();
  customers.forEach((row) => {
    const customer = readValue<Customer>(row.data, {} as Customer);
    if (!customer?.id || customer.deletedAt) return;
    const match = { id: customer.id, name: customer.name || '', inScope: canReadCustomer(context, customer) };
    businessImportContactKeys(customer).forEach((key) => customerMatchesByContact.set(key, [...(customerMatchesByContact.get(key) || []), match]));
  });
  const pendingNumbers = (type: BusinessImportType) => pendingReservations
    .filter((reservation) => reservation.importType === type)
    .map((reservation) => lower(reservation.normalizedNumber))
    .filter(Boolean);
  return {
    products,
    orderTypes,
    paymentChannels: ['企业微信转账', '企业支付宝转账', '对公银行转账', '公司自营小店', '非官方渠道'],
    users: activeUsers.filter((candidate) => scope.unrestricted || scope.visibleUserIds.includes(candidate.id)).map((candidate) => ({ id: candidate.id, name: candidate.name })),
    recoveryPlatforms: platforms,
    recoveryShops: shops,
    customerMatchesByContact,
    existingOrderNumbers: new Set([...orders.map(thirdPartyNumber), ...pendingNumbers('orders')].filter(Boolean)),
    existingRecoveryOrderNumbers: new Set([...recoveries.map(thirdPartyNumber), ...pendingNumbers('recovery_orders')].filter(Boolean)),
  };
}

async function persistPrecheck(prisma: PrismaClient, record: BusinessImportPrecheckRecord, actorName: string): Promise<void> {
  const batchId = `business-import-batch-${randomUUID()}`;
  await prisma.businessImportBatch.create({ data: {
    id: batchId, importType: record.type, status: 'prechecked', actorId: record.actorId, actorName,
    tokenHash: record.tokenHash, rowsHash: record.rowsHash, totalCount: record.totalCount,
    readyCount: record.rows.filter((row) => row.status !== 'blocked').length,
    warningCount: record.rows.filter((row) => row.status === 'warning').length,
    blockedCount: record.rows.filter((row) => row.status === 'blocked').length,
    rows: json(record.rows.map((row) => ({ rowNumber: row.rowNumber, status: row.status, reason: row.reason, normalized: row.normalized, customerId: row.customerId }))),
    expiresAt: new Date(record.expiresAt),
  } });
}

export async function consumePrecheckAndCreateJob(prisma: PrismaClient, input: {
  tokenHash: string; actorId: string; type: BusinessImportType; rowsHash: string; expiresAt: string; fileName: string; rows: ValidatedBusinessImportRow[];
}) {
  return prisma.$transaction(async (tx) => {
    const batches = await tx.$queryRaw<Array<{ id: string; actorId: string; importType: string; rowsHash: string; expiresAt: Date; consumedAt: Date | null }>>`
      SELECT id, actorId, importType, rowsHash, expiresAt, consumedAt
      FROM business_import_batches WHERE tokenHash = ${input.tokenHash} LIMIT 1 FOR UPDATE`;
    const batch = batches[0];
    if (!batch || batch.actorId !== input.actorId || batch.importType !== input.type || batch.rowsHash !== input.rowsHash || batch.consumedAt || batch.expiresAt <= new Date()) {
      throw new BusinessImportError('导入预检凭证无效或已过期', 409);
    }
    const jobId = `business-import-job-${randomUUID()}`;
    const actor = await tx.user.findUnique({ where: { id: input.actorId }, select: { name: true } });
    if (!actor) throw new BusinessImportError('当前导入用户不存在或已离职', 409);
    const numberedRows = input.rows
      .map((row) => ({ rowNumber: row.rowNumber, normalizedNumber: lower(row.normalized.thirdPartyOrderNo) }))
      .filter((row) => Boolean(row.normalizedNumber));
    if (numberedRows.length) {
      try {
        await tx.businessImportNumberReservation.createMany({ data: numberedRows.map(({ normalizedNumber, rowNumber }) => ({
          id: `business-import-number-${randomUUID()}`,
          importType: input.type,
          normalizedNumber,
          batchId: batch.id,
          jobId: null,
          rowNumber,
        })) });
      } catch (error) {
        if (isUniqueConstraint(error)) throw new BusinessImportError('第三方订单号已在待处理导入任务中，请勿重复导入', 409);
        throw error;
      }
    }
    await tx.businessImportJob.create({ data: {
      id: jobId, batchId: batch.id, importType: input.type, status: 'queued', actorId: input.actorId,
      actorName: actor.name, rowsHash: input.rowsHash, sourceFileName: input.fileName, idempotencyKey: batch.id, totalCount: input.rows.length,
      failedCount: input.rows.filter((row) => row.status === 'blocked').length,
      rows: json(input.rows.map((row) => ({
        rowNumber: row.rowNumber, status: row.status, reason: row.reason, normalized: row.normalized, customerId: row.customerId,
        executionStatus: row.status === 'blocked' ? 'failed' : 'queued',
        ...(row.status === 'blocked' ? { errorMessage: row.reason } : {}),
      }))),
    } });
    await tx.businessImportJobItem.createMany({ data: input.rows.map((row) => ({
      id: `business-import-row-${randomUUID()}`,
      jobId,
      rowNumber: row.rowNumber,
      status: row.status === 'blocked' ? 'failed' : 'queued',
      payload: json({ rowNumber: row.rowNumber, status: row.status, reason: row.reason, normalized: row.normalized, customerId: row.customerId }),
      reservedNumber: lower(row.normalized.thirdPartyOrderNo) || null,
      errorMessage: row.status === 'blocked' ? row.reason : null,
    })) });
    if (numberedRows.length) {
      await tx.businessImportNumberReservation.updateMany({
        where: { batchId: batch.id, jobId: null },
        data: { jobId },
      });
    }
    await tx.businessImportBatch.update({ where: { id: batch.id }, data: { status: 'queued', sourceFileName: input.fileName, consumedAt: new Date() } });
    return { id: jobId, batchId: batch.id, type: input.type, status: 'queued' as const, totalCount: input.rows.length, failedCount: input.rows.filter((row) => row.status === 'blocked').length };
  });
}

export function createPrismaBusinessImportService(input: { prisma: PrismaClient; secret: string }) {
  return createBusinessImportService({
    secret: input.secret,
    loadDirectory: (actor, type) => loadBusinessImportDirectory(input.prisma, actor, type),
    persistPrecheck: async (record) => {
      const actor = await input.prisma.user.findUnique({ where: { id: record.actorId }, select: { name: true } });
      if (!actor) throw new BusinessImportError('当前导入用户不存在或已离职', 409);
      return persistPrecheck(input.prisma, record, actor.name);
    },
    validateAttachments: (actor, type, rows, expectedDraftId) => validateBusinessImportAttachments(input.prisma, actor, type, rows, expectedDraftId),
    consumePrecheckAndCreateJob: (payload) => consumePrecheckAndCreateJob(input.prisma, payload),
  });
}
