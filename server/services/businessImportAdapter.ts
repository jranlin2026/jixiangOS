import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer } from '../../src/types/customer';
import type { AfterSalesSourceConfig, OrderTypeConfig, ProductConfig } from '../../src/types/settings';
import type { BusinessImportType } from '../../src/types/businessImport';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { buildDataVisibilityScopeForUser } from '../../src/shared/utils/dataVisibility';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import { canReadCustomer, loadCustomerAccessContext } from './customerAccessPolicy';
import {
  createBusinessImportService,
  type BusinessImportDirectory,
  type BusinessImportPrecheckRecord,
  type ValidatedBusinessImportRow,
} from './businessImportService';

const clean = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => clean(value).toLocaleLowerCase('zh-CN');
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function readValue<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

function contactKeys(customer: Pick<Customer, 'phone' | 'wechat'>): string[] {
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

async function loadDirectory(prisma: PrismaClient, actor: AuthenticatedUser, _type: BusinessImportType): Promise<BusinessImportDirectory> {
  const [storage, users, roles, departments, customers, orders, recoveries, context] = await Promise.all([
    prisma.appStorage.findMany({ where: { key: { in: [STORAGE_KEYS.PRODUCTS, STORAGE_KEYS.ORDER_TYPE_CONFIGS, STORAGE_KEYS.AFTER_SALES_SOURCE_CONFIGS] } } }),
    prisma.user.findMany({ where: { isActive: true, employmentStatus: 'active' }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    prisma.role.findMany({ where: { isActive: true } }),
    prisma.department.findMany(),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.CUSTOMERS, mergedIntoId: null } }),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS } }),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.RECOVERY_ORDERS } }),
    loadCustomerAccessContext(prisma, actor),
  ]);
  const activeUsers = users.map(mapPrismaUser);
  const scope = buildDataVisibilityScopeForUser(actor as any, activeUsers, roles.map(mapPrismaRole), departments as any,
    _type === 'orders' ? 'orders' : 'recoveryOrders');
  const values = new Map(storage.map((row) => [row.key, row.value]));
  const products = readValue<ProductConfig[]>(values.get(STORAGE_KEYS.PRODUCTS), []).filter((item) => item.isActive !== false)
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
    contactKeys(customer).forEach((key) => customerMatchesByContact.set(key, [...(customerMatchesByContact.get(key) || []), match]));
  });
  return {
    products,
    orderTypes,
    paymentChannels: ['企业微信转账', '企业支付宝转账', '对公银行转账', '公司自营小店', '非官方渠道'],
    users: activeUsers.filter((candidate) => scope.unrestricted || scope.visibleUserIds.includes(candidate.id)).map((candidate) => ({ id: candidate.id, name: candidate.name })),
    recoveryPlatforms: platforms,
    recoveryShops: shops,
    customerMatchesByContact,
    existingOrderNumbers: new Set(orders.map(thirdPartyNumber).filter(Boolean)),
    existingRecoveryOrderNumbers: new Set(recoveries.map(thirdPartyNumber).filter(Boolean)),
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

async function consumePrecheckAndCreateJob(prisma: PrismaClient, input: {
  tokenHash: string; actorId: string; type: BusinessImportType; rowsHash: string; expiresAt: string; fileName: string; rows: ValidatedBusinessImportRow[];
}) {
  return prisma.$transaction(async (tx) => {
    const batches = await tx.$queryRaw<Array<{ id: string; actorId: string; importType: string; rowsHash: string; expiresAt: Date; consumedAt: Date | null }>>`
      SELECT id, actorId, importType, rowsHash, expiresAt, consumedAt
      FROM business_import_batches WHERE tokenHash = ${input.tokenHash} LIMIT 1 FOR UPDATE`;
    const batch = batches[0];
    if (!batch || batch.actorId !== input.actorId || batch.importType !== input.type || batch.rowsHash !== input.rowsHash || batch.consumedAt || batch.expiresAt <= new Date()) {
      throw new Error('BUSINESS_IMPORT_PRECHECK_INVALID');
    }
    const jobId = `business-import-job-${randomUUID()}`;
    const actor = await tx.user.findUnique({ where: { id: input.actorId }, select: { name: true } });
    if (!actor) throw new Error('BUSINESS_IMPORT_ACTOR_MISSING');
    await tx.businessImportJob.create({ data: {
      id: jobId, batchId: batch.id, importType: input.type, status: 'queued', actorId: input.actorId,
      actorName: actor.name, rowsHash: input.rowsHash, sourceFileName: input.fileName, idempotencyKey: batch.id, totalCount: input.rows.length,
      failedCount: input.rows.filter((row) => row.status === 'blocked').length,
      rows: json(input.rows.map((row) => ({ rowNumber: row.rowNumber, status: row.status, reason: row.reason, normalized: row.normalized, customerId: row.customerId }))),
    } });
    await tx.businessImportBatch.update({ where: { id: batch.id }, data: { status: 'queued', sourceFileName: input.fileName, consumedAt: new Date() } });
    return { id: jobId, type: input.type, status: 'queued' as const, totalCount: input.rows.length, failedCount: input.rows.filter((row) => row.status === 'blocked').length };
  });
}

export function createPrismaBusinessImportService(input: { prisma: PrismaClient; secret: string }) {
  return createBusinessImportService({
    secret: input.secret,
    loadDirectory: (actor, type) => loadDirectory(input.prisma, actor, type),
    persistPrecheck: async (record) => {
      const actor = await input.prisma.user.findUnique({ where: { id: record.actorId }, select: { name: true } });
      if (!actor) throw new Error('BUSINESS_IMPORT_ACTOR_MISSING');
      return persistPrecheck(input.prisma, record, actor.name);
    },
    consumePrecheckAndCreateJob: (payload) => consumePrecheckAndCreateJob(input.prisma, payload),
  });
}
