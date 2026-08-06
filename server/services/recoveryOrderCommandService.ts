import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { buildDataVisibilityScopeForUser, type DataVisibilityScope } from '../../src/shared/utils/dataVisibility';
import { PERMISSION_KEYS, canReviewRecoveryOrders, hasPermission, isSuperAdmin } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Department } from '../../src/types/department';
import type {
  Commission,
  CommissionCorrectionPreview,
  CommissionCorrectionRecord,
  CommissionPayoutCorrectionContext,
  CommissionPayoutRecord,
  OfficialPaymentChannel,
} from '../../src/types/commission';
import type {
  RecoveryOrder,
  RecoveryOrderChangeLog,
  RecoveryOrderCorrectionInput,
  RecoveryOrderCorrectionPrecheck,
  RecoveryOrderFilters,
  RecoveryOrderInput,
  RecoveryOrderMetadataEditInput,
  RecoverySettlementCounts,
  RecoverySettlementInput,
} from '../../src/types/recoveryOrder';
import {
  isInactiveRecoveryCommissionStatus,
  isRecoveryCommissionRelatedToOrder,
  isRecoveryOrderDeletionLocked,
} from '../../src/shared/utils/recoveryOrderDeletion';
import type { Role } from '../../src/types/role';
import type { User } from '../../src/types/settings';
import type { BusinessImportMetadata } from '../../src/types/businessImport';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import { jsonText, queryBusinessRecordPage, visibleJsonCondition } from './businessRecordPageService';
import { compactRecoveryOrderListItem, compactRecoverySettlementListItem } from '../../src/shared/utils/listPayload';
import type { BusinessAttachment, BusinessAttachmentCategory } from '../../src/types/businessAttachment';
import type { RecoveryCrmBridge, RecoveryCrmResolution } from './recoveryCrmBridge';
import { getPhoneNumberError } from '../../src/shared/utils/phoneNumber';
import { buildCommissionCorrectionImpact, findOverlappingFinancialCorrection } from './commissionCorrectionImpactService';
import { persistCommissionCorrection } from './commissionCorrectionService';
import { resolveCommissionEntitlements } from '../../src/shared/utils/commissionEntitlement';
import { isAfterSalesRecoveryCommission } from '../../src/shared/utils/commissionConfiguration';
import { lockCommissionLedger } from './commissionLedgerLock';

type RecoveryCommandPrisma = Pick<PrismaClient, 'businessRecord' | 'user' | 'role' | 'department' | '$transaction' | '$queryRaw'>;
type Directory = { users: User[]; roles: Role[]; departments: Department[] };
type LockedRow = { id: string; domain: string; recordId: string; data: unknown };
type RecoveryOrderPage = {
  items: RecoveryOrder[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export interface RecoveryOrderCommandServiceOptions {
  now?: () => Date;
  crmBridge?: RecoveryCrmBridge;
  syncLeadSources?: (tx: Prisma.TransactionClient) => Promise<unknown>;
}

function crmPatch(resolution: RecoveryCrmResolution): Pick<RecoveryOrder, 'customerId' | 'customerMatchStatus' | 'crmIdentityStatus' | 'linkedLeadId' | 'leadSyncStatus'> {
  if (resolution.status === '已匹配客户') return {
    customerId: resolution.customerId, customerMatchStatus: '已绑定客户', crmIdentityStatus: '已匹配客户', linkedLeadId: undefined, leadSyncStatus: '不需要',
  };
  if (resolution.status === '已匹配线索') return {
    customerId: '', customerMatchStatus: '售后临时客户', crmIdentityStatus: '已匹配线索', linkedLeadId: resolution.leadId, leadSyncStatus: '已关联',
  };
  return {
    customerId: '', customerMatchStatus: '售后临时客户', crmIdentityStatus: resolution.status,
    linkedLeadId: undefined,
    leadSyncStatus: resolution.status === '身份冲突' ? '失败' : '待同步',
  };
}

function publicRecoveryOrder(order: RecoveryOrder, actor: AuthenticatedUser): RecoveryOrder {
  const safe = { ...order, customerId: '', linkedLeadId: undefined };
  if (hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_HISTORY, 'read')) return safe;
  const { changeHistory: _changeHistory, ...withoutHistory } = safe;
  return withoutHistory;
}

class RecoveryCommandError extends Error {
  constructor(readonly responseCode: number, message: string) {
    super(message);
    this.name = 'RecoveryCommandError';
  }
}

function parseObject<T extends object>(value: unknown, label: string): T {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
    return parsed as T;
  } catch {
    throw new RecoveryCommandError(409, `${label}数据损坏，请先修复数据`);
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function hash(value: string, length = 16): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function normalizeOrderNo(value: unknown): string {
  return String(value || '').trim().toLocaleLowerCase();
}

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function canAssignRecoveryParticipants(actor: AuthenticatedUser): boolean {
  return isSuperAdmin(actor)
    || hasPermission(actor, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'write');
}

function resolveRecoveryParticipants(
  input: RecoveryOrderInput,
  actor: AuthenticatedUser,
  directory: Directory,
  scope: DataVisibilityScope,
  lockedRecoveryUserId?: string,
): { recoveryUser: User; assistUser?: User; assistUserName?: string } {
  const canAssign = canAssignRecoveryParticipants(actor);
  const recoveryUserId = canAssign ? input.recoveryUserId : (lockedRecoveryUserId || actor.id);
  const recoveryUser = directory.users.find((user) => user.id === recoveryUserId && activeUser(user));
  if (!recoveryUser) throw new RecoveryCommandError(400, '挽回人员不存在或已停用');
  if (!canAssign && !scope.unrestricted && !scope.visibleUserIds.includes(recoveryUser.id)) {
    throw new RecoveryCommandError(403, '无权为该员工维护售后挽回订单');
  }

  const assistUser = canAssign && input.assistUserId
    ? directory.users.find((user) => user.id === input.assistUserId && activeUser(user))
    : undefined;
  if (canAssign && input.assistUserId && !assistUser) {
    throw new RecoveryCommandError(400, '协助人员不存在或已停用');
  }
  const assistUserName = assistUser?.name || cleanText(input.assistUserName) || undefined;
  return { recoveryUser, assistUser, assistUserName };
}

function recoveryContactFieldError(input: Pick<RecoveryOrderInput, 'customerName' | 'customerPhone' | 'customerWechat'>): string {
  if (cleanText(input.customerName).length > 120) return '客户姓名不能超过120个字符';
  if (cleanText(input.customerPhone).length > 50) return '客户手机号不能超过50个字符';
  if (cleanText(input.customerWechat).length > 100) return '客户微信不能超过100个字符';
  return '';
}

const OFFICIAL_PAYMENT_CHANNEL_VALUES = new Set<OfficialPaymentChannel>([
  '企业微信转账', '企业支付宝转账', '对公银行转账', '公司自营小店', '非官方渠道',
]);

function officialPaymentChannel(value: unknown): OfficialPaymentChannel | undefined {
  const channel = cleanText(value) as OfficialPaymentChannel;
  if (!channel) return undefined;
  if (!OFFICIAL_PAYMENT_CHANNEL_VALUES.has(channel)) throw new RecoveryCommandError(400, '官方收款渠道无效');
  return channel;
}

function recoveryTime(value: unknown, fallback: string, referenceTime = fallback): string {
  const text = cleanText(value);
  if (!text) return fallback;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new RecoveryCommandError(400, '挽回时间格式无效');
  if (parsed.getTime() > new Date(referenceTime).getTime() + 5 * 60_000) {
    throw new RecoveryCommandError(400, '挽回成交时间不能晚于当前时间');
  }
  return parsed.toISOString();
}

function optionalPaymentTime(
  value: unknown,
  referenceTime = new Date().toISOString(),
  label = '付款时间',
): string | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new RecoveryCommandError(400, `${label}格式无效`);
  if (parsed.getTime() > new Date(referenceTime).getTime() + 5 * 60_000) {
    throw new RecoveryCommandError(400, `${label}不能晚于当前时间`);
  }
  return parsed.toISOString();
}

function validateAttachments(
  value: unknown,
  category: BusinessAttachmentCategory,
  label: string,
): BusinessAttachment[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new RecoveryCommandError(400, `${label}数据无效`);
  if (value.length > 8) throw new RecoveryCommandError(400, `${label}最多上传 8 张`);
  return value.map((item) => {
    const attachment = item as Partial<BusinessAttachment> | null;
    if (!attachment || typeof attachment !== 'object' || attachment.category !== category
      || !cleanText(attachment.id) || !cleanText(attachment.mimeType).startsWith('image/')) {
      throw new RecoveryCommandError(400, `${label}数据无效`);
    }
    return {
      id: cleanText(attachment.id), name: cleanText(attachment.name), mimeType: cleanText(attachment.mimeType),
      size: Number(attachment.size) || 0, category,
      uploadedById: cleanText(attachment.uploadedById), uploadedByName: cleanText(attachment.uploadedByName),
      uploadedAt: cleanText(attachment.uploadedAt),
    };
  });
}

function resolveRecoveryAttachments(input: Pick<RecoveryOrderInput, 'recoveryAttachments' | 'paymentAttachments' | 'chatAttachments'>): BusinessAttachment[] {
  if (input.recoveryAttachments !== undefined) {
    return validateAttachments(input.recoveryAttachments, 'recovery-payment-proof', '挽回凭证');
  }

  const legacyAttachments = [
    ...validateAttachments(input.paymentAttachments, 'recovery-payment-proof', '挽回凭证'),
    ...validateAttachments(input.chatAttachments, 'recovery-chat-evidence', '挽回凭证'),
  ];
  const seen = new Set<string>();
  const merged = legacyAttachments.reduce<BusinessAttachment[]>((result, attachment) => {
    if (seen.has(attachment.id)) return result;
    seen.add(attachment.id);
    result.push({ ...attachment, category: 'recovery-payment-proof' });
    return result;
  }, []);
  if (merged.length > 8) throw new RecoveryCommandError(400, '挽回凭证最多上传 8 张');
  return merged;
}

function amount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function relatedRecoveryCommission(order: RecoveryOrder, commission: Commission): boolean {
  return isRecoveryCommissionRelatedToOrder(order.id, new Set(order.commissionIds || []), commission);
}

function buildRecoveryCommission(
  order: RecoveryOrder,
  input: RecoverySettlementInput,
  owner: User,
  department: Department | undefined,
  actor: AuthenticatedUser,
  createdAt: string,
  index: number,
): Commission {
  const role = cleanText(input.role);
  if (!role) throw new RecoveryCommandError(400, '请选择提成角色');
  const performanceAmount = amount(input.performanceAmount ?? order.recoveryAmount);
  const calculationType = input.ruleCalculationType || (Number(input.commissionRate) ? 'percentage' : 'fixed');
  const commissionRate = calculationType === 'percentage' ? Number(input.commissionRate || 0) : 0;
  const commissionAmount = calculationType === 'tiered_percentage'
    ? 0
    : calculationType === 'percentage'
      ? amount(performanceAmount * commissionRate)
      : amount(input.commissionAmount);
  if (commissionAmount < 0) throw new RecoveryCommandError(400, '提成金额不能小于 0');
  const payoutPlanName = cleanText(input.payoutPlanName) || '自定义金额';
  return {
    id: `comm-recovery-${hash(`${order.id}:${order.settlementVersion || 1}:${role}:${owner.id}:${createdAt}:${index}`, 12)}`,
    orderId: order.id,
    orderNo: order.recoveryNo,
    customerName: order.customerName,
    productLevel: order.originalProductLevel || order.originalProduct,
    orderAmount: order.recoveryAmount,
    performanceAmount,
    commissionRate,
    commissionAmount,
    scene: '售后挽回',
    proofStatus: order.recoveryAttachments?.length || order.paymentAttachments?.length || order.chatAttachments?.length
      || order.paymentVoucher || order.paymentVoucherName || order.chatEvidence || order.chatEvidenceName ? '已上传' : '待补充',
    formulaText: calculationType === 'tiered_percentage'
      ? `${payoutPlanName}：按挽回人员与方案版本汇总月度挽回业绩后计算`
      : calculationType === 'percentage'
        ? `${payoutPlanName}：挽回金额 ${performanceAmount} × ${amount(commissionRate * 100)}% = ${commissionAmount} 元`
        : `${payoutPlanName}：售后挽回提成 ${commissionAmount} 元`,
    calculationNote: cleanText(input.calculationNote) || `售后挽回订单 ${order.recoveryNo} 财务分账：${actor.name}`,
    role,
    roleId: input.roleId,
    roleCode: input.roleCode,
    roleNameSnapshot: input.roleNameSnapshot || role,
    owner: owner.name,
    ownerId: owner.id,
    department: department?.name || '',
    departmentId: department?.id || owner.departmentId,
    paymentDate: order.recoveryAt || createdAt,
    status: '待确认',
    sourceType: '人工新增',
    commissionType: 'recovery',
    payoutPlanId: input.payoutPlanId,
    payoutPlanName,
    payoutPlanVersion: input.payoutPlanVersion || input.payoutPlanSnapshot?.version,
    payoutPlanSnapshot: input.payoutPlanSnapshot,
    ruleCalculationType: calculationType,
    tierSnapshot: calculationType === 'tiered_percentage' ? input.tierSnapshot : undefined,
    sourceRecoveryOrderId: order.id,
    sourceBusinessType: 'after_sales_recovery',
    isRecoveryBonus: true,
    adjustReason: '售后挽回分账',
    adjustedBy: actor.name,
    adjustedAt: createdAt,
    settlementRoundId: order.settlementRoundId || `recovery-settlement-${order.id}-v${order.settlementVersion || 1}`,
    settlementVersion: order.settlementVersion || 1,
    createdAt,
    updatedAt: createdAt,
  };
}

function activeUser(user: User): boolean {
  return user.isActive && (user.employmentStatus || 'active') === 'active';
}

async function loadDirectory(prisma: RecoveryCommandPrisma): Promise<Directory> {
  const [users, roles, departments] = await Promise.all([
    prisma.user.findMany(),
    prisma.role.findMany({ where: { isActive: true } }),
    prisma.department.findMany(),
  ]);
  return {
    users: users.map(mapPrismaUser),
    roles: roles.map(mapPrismaRole),
    departments: departments as unknown as Department[],
  };
}

function sameCreate(existing: RecoveryOrder, desired: RecoveryOrder, compareRecoveryAt: boolean): boolean {
  return existing.createdBy === desired.createdBy
    && normalizeOrderNo(existing.thirdPartyOrderNo) === normalizeOrderNo(desired.thirdPartyOrderNo)
    && existing.customerName === desired.customerName
    && existing.originalProduct === desired.originalProduct
    && (existing.originalProductId || '') === (desired.originalProductId || '')
    && (existing.originalProductLevel || '') === (desired.originalProductLevel || '')
    && Number(existing.originalAmount) === Number(desired.originalAmount)
    && (existing.originalPaymentAt || '') === (desired.originalPaymentAt || '')
    && Number(existing.recoveryAmount) === Number(desired.recoveryAmount)
    && (!compareRecoveryAt || (existing.recoveryAt || existing.createdAt) === (desired.recoveryAt || desired.createdAt))
    && existing.recoveryUserId === desired.recoveryUserId
    && (existing.assistUserId || '') === (desired.assistUserId || '')
    && (existing.officialPaymentChannel || '') === (desired.officialPaymentChannel || '')
    && (existing.paymentOrderNo || '') === (desired.paymentOrderNo || '')
    && (existing.paymentAt || '') === (desired.paymentAt || '');
}

function sameImportedIdentity(existing: RecoveryOrder, metadata: BusinessImportMetadata): boolean {
  return existing.importBatchId === metadata.importBatchId
    && existing.importRowNumber === metadata.importRowNumber
    && existing.importedById === metadata.importedById
    && existing.importedByName === metadata.importedByName
    && existing.targetCreatorId === metadata.targetCreatorId
    && existing.targetCreatorName === metadata.targetCreatorName;
}

function recoveryScope(
  directory: Directory,
  actor: AuthenticatedUser,
  domain: NonNullable<RecoveryOrderFilters['scopeDomain']> = 'recoveryOrderApplications',
): DataVisibilityScope {
  return buildDataVisibilityScopeForUser(
    actor,
    directory.users,
    directory.roles,
    directory.departments,
    domain,
  );
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

function timestamp(value: unknown): number {
  const parsed = new Date(String(value || '')).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function inDateRange(value: unknown, startDate?: string, endDate?: string): boolean {
  const time = timestamp(value);
  if (startDate && time < timestamp(startDate)) return false;
  if (endDate) {
    const end = new Date(endDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) end.setHours(23, 59, 59, 999);
    if (time > end.getTime()) return false;
  }
  return true;
}

function recoverySortTimestamp(order: RecoveryOrder, sortBy?: RecoveryOrderFilters['sortBy']): number {
  if (sortBy === 'recoveryAt') return timestamp(order.recoveryAt || order.createdAt);
  if (sortBy === 'createdAt') return timestamp(order.createdAt);
  return timestamp(order.updatedAt || order.createdAt);
}

function recoverySettlementStatus(order: RecoveryOrder): string {
  const raw = String(order.settlementStatus
    || (order.status === '待分账' ? '待处理' : order.status === '已分账' ? '待发放' : ''));
  if (raw === '待分账') return '待处理';
  if (raw === '已分账') return '待发放';
  return raw || '待处理';
}

function matchesRecoveryOrder(order: RecoveryOrder, filters: RecoveryOrderFilters): boolean {
  if (filters.scopeDomain === 'recoveryOrderApplications' && order.reviewCleanedAt) return false;
  if ((filters.settlementStatuses?.length || (filters.settlementStatus && filters.settlementStatus !== '全部')) && order.settlementCleanedAt) return false;
  if (!filters.includeDeleted && order.deletedAt) return false;
  const search = cleanText(filters.search).toLocaleLowerCase();
  if (search && ![
    order.recoveryNo,
    order.thirdPartyOrderNo,
    order.customerName,
    order.customerPhone,
    order.customerWechat,
    order.originalProduct,
    order.recoveryUserName,
  ].some((value) => cleanText(value).toLocaleLowerCase().includes(search))) return false;
  if (filters.statuses?.length && !filters.statuses.includes(order.status)) return false;
  if (!filters.statuses?.length && filters.status && filters.status !== '全部' && order.status !== filters.status) return false;
  const settlementStatus = recoverySettlementStatus(order);
  if (filters.settlementStatus && filters.settlementStatus !== '全部' && settlementStatus !== filters.settlementStatus) return false;
  if (filters.settlementStatuses?.length && !filters.settlementStatuses.includes(settlementStatus as any)) return false;
  if (filters.ownerId && ![order.createdBy, order.recoveryUserId, order.assistUserId].includes(filters.ownerId)) return false;
  if (filters.importBatchId && order.importBatchId !== filters.importBatchId) return false;
  if (filters.recoveryUserId && order.recoveryUserId !== filters.recoveryUserId) return false;
  return inDateRange(order.recoveryAt || order.createdAt, filters.recoveryStartDate, filters.recoveryEndDate);
}

function recoveryVisible(order: RecoveryOrder, scope: DataVisibilityScope): boolean {
  if (scope.unrestricted) return true;
  return [
    [order.createdBy, order.createdByName],
    [order.recoveryUserId, order.recoveryUserName],
    [order.assistUserId, order.assistUserName],
  ].some(([userId, userName]) => (
    userId
      ? scope.visibleUserIds.includes(userId)
      : Boolean(userName && scope.visibleUserNames.includes(userName))
  ));
}

function recoveryWritable(order: RecoveryOrder, scope: DataVisibilityScope): boolean {
  if (scope.unrestricted) return true;
  return [order.createdBy, order.recoveryUserId, order.assistUserId]
    .some((userId) => Boolean(userId && scope.visibleUserIds.includes(userId)));
}

function recoverySettlementStatusSql(alias: string): Prisma.Sql {
  const value = jsonText(alias, '$.settlementStatus');
  const status = jsonText(alias, '$.status');
  return Prisma.sql`CASE
    WHEN ${value} = '待分账' THEN '待处理'
    WHEN ${value} = '已分账' THEN '待发放'
    WHEN COALESCE(${value}, '') <> '' THEN ${value}
    WHEN ${status} = '待分账' THEN '待处理'
    WHEN ${status} = '已分账' THEN '待发放'
    ELSE '待处理'
  END`;
}

function recoverySqlConditions(filters: RecoveryOrderFilters, scope: DataVisibilityScope): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [Prisma.sql`br.domain = ${STORAGE_KEYS.RECOVERY_ORDERS}`];
  if (filters.scopeDomain === 'recoveryOrderApplications') {
    conditions.push(Prisma.sql`JSON_EXTRACT(br.data, '$.reviewCleanedAt') IS NULL`);
  }
  if (filters.settlementStatuses?.length || (filters.settlementStatus && filters.settlementStatus !== '全部')) {
    conditions.push(Prisma.sql`JSON_EXTRACT(br.data, '$.settlementCleanedAt') IS NULL`);
  }
  if (!filters.includeDeleted) conditions.push(Prisma.sql`JSON_EXTRACT(br.data, '$.deletedAt') IS NULL`);
  if (filters.statuses?.length) conditions.push(Prisma.sql`br.status IN (${Prisma.join(filters.statuses)})`);
  else if (filters.status && filters.status !== '全部') conditions.push(Prisma.sql`br.status = ${filters.status}`);
  if (filters.settlementStatus && filters.settlementStatus !== '全部') {
    conditions.push(Prisma.sql`${recoverySettlementStatusSql('br')} = ${filters.settlementStatus}`);
  }
  if (filters.settlementStatuses?.length) {
    conditions.push(Prisma.sql`${recoverySettlementStatusSql('br')} IN (${Prisma.join(filters.settlementStatuses)})`);
  }
  if (filters.ownerId) {
    conditions.push(Prisma.sql`(${jsonText('br', '$.createdBy')} = ${filters.ownerId} OR ${jsonText('br', '$.recoveryUserId')} = ${filters.ownerId} OR ${jsonText('br', '$.assistUserId')} = ${filters.ownerId})`);
  }
  if (filters.importBatchId) {
    conditions.push(Prisma.sql`${jsonText('br', '$.importBatchId')} = ${filters.importBatchId}`);
  }
  if (filters.recoveryUserId) {
    conditions.push(Prisma.sql`${jsonText('br', '$.recoveryUserId')} = ${filters.recoveryUserId}`);
  }
  const recoveryAt = Prisma.sql`COALESCE(${jsonText('br', '$.recoveryAt')}, ${jsonText('br', '$.createdAt')}, br.createdAt)`;
  if (filters.recoveryStartDate) conditions.push(Prisma.sql`${recoveryAt} >= ${filters.recoveryStartDate}`);
  if (filters.recoveryEndDate) conditions.push(Prisma.sql`${recoveryAt} <= ${/^\d{4}-\d{2}-\d{2}$/.test(filters.recoveryEndDate) ? `${filters.recoveryEndDate}T23:59:59.999Z` : filters.recoveryEndDate}`);
  if (!scope.unrestricted) {
    const participantVisibility = [
      visibleJsonCondition('br', ['$.createdBy'], ['$.createdByName'], scope.visibleUserIds, scope.visibleUserNames),
      visibleJsonCondition('br', ['$.recoveryUserId'], ['$.recoveryUserName'], scope.visibleUserIds, scope.visibleUserNames),
      visibleJsonCondition('br', ['$.assistUserId'], ['$.assistUserName'], scope.visibleUserIds, scope.visibleUserNames),
    ];
    conditions.push(Prisma.sql`(${Prisma.join(participantVisibility, ' OR ')})`);
  }
  const search = cleanText(filters.search).toLocaleLowerCase();
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(Prisma.sql`(LOWER(br.recordId) LIKE ${pattern} OR LOWER(COALESCE(br.title, '')) LIKE ${pattern} OR LOWER(${jsonText('br', '$.recoveryNo')}) LIKE ${pattern} OR LOWER(${jsonText('br', '$.thirdPartyOrderNo')}) LIKE ${pattern} OR LOWER(${jsonText('br', '$.customerPhone')}) LIKE ${pattern} OR LOWER(${jsonText('br', '$.customerWechat')}) LIKE ${pattern} OR LOWER(${jsonText('br', '$.originalProduct')}) LIKE ${pattern} OR LOWER(${jsonText('br', '$.recoveryUserName')}) LIKE ${pattern})`);
  }
  return conditions;
}

async function queryRecoveryPage(
  prisma: RecoveryCommandPrisma,
  filters: RecoveryOrderFilters,
  scope: DataVisibilityScope,
) {
  const page = toPositiveInt(filters.page, 1);
  const pageSize = Math.min(toPositiveInt(filters.pageSize, 10), 100);
  const conditions = recoverySqlConditions(filters, scope);
  return queryBusinessRecordPage<RecoveryOrder>(prisma, {
    from: 'business_records br',
    pageFrom: 'business_records br FORCE INDEX (business_records_domain_eventAt_createdAt_idx)',
    selectId: 'br.id', selectData: 'br.data', conditions,
    orderBy: filters.sortBy === 'recoveryAt'
      ? `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(br.data, '$.recoveryAt')), JSON_UNQUOTE(JSON_EXTRACT(br.data, '$.createdAt')), br.createdAt) ${filters.sortDirection === 'asc' ? 'ASC' : 'DESC'}, br.id ASC`
      : filters.sortBy === 'createdAt'
        ? `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(br.data, '$.createdAt')), br.createdAt) ${filters.sortDirection === 'asc' ? 'ASC' : 'DESC'}, br.id ASC`
        : `br.eventAt ${filters.sortDirection === 'asc' ? 'ASC' : 'DESC'}, br.createdAt ${filters.sortDirection === 'asc' ? 'ASC' : 'DESC'}, br.id ASC`,
    page, pageSize,
  });
}

async function queryRecoverySettlementCounts(
  prisma: RecoveryCommandPrisma,
  filters: Pick<RecoveryOrderFilters, 'search' | 'includeDeleted' | 'recoveryStartDate' | 'recoveryEndDate' | 'recoveryUserId'>,
  scope: DataVisibilityScope,
): Promise<RecoverySettlementCounts> {
  const conditions = recoverySqlConditions(filters, scope);
  conditions.push(Prisma.sql`JSON_EXTRACT(br.data, '$.settlementCleanedAt') IS NULL`);
  const where = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
  const statusExpression = recoverySettlementStatusSql('br');
  const rows = await prisma.$queryRaw<Array<{ settlementStatus: string; count: bigint | number }>>(
    Prisma.sql`SELECT ${statusExpression} AS settlementStatus, COUNT(*) AS count
      FROM business_records br ${where}
      GROUP BY settlementStatus`,
  );
  const statusCounts: Record<string, number> = { 待处理: 0, 待确认: 0, 待发放: 0, 已发放: 0, 已撤回: 0 };
  rows.forEach((row) => {
    if (row.settlementStatus in statusCounts) statusCounts[row.settlementStatus] = Number(row.count);
  });
  return {
    total: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
    statusCounts,
  };
}

async function lockRecoveryOrder(
  transaction: Prisma.TransactionClient,
  orderId: string,
): Promise<RecoveryOrder> {
  const rows = await transaction.$queryRaw<LockedRow[]>`
    SELECT id, domain, recordId, data
    FROM business_records
    WHERE domain = ${STORAGE_KEYS.RECOVERY_ORDERS}
      AND recordId = ${orderId}
    LIMIT 1
    FOR UPDATE
  `;
  if (!rows[0]) throw new RecoveryCommandError(404, '售后挽回订单不存在');
  const order = parseObject<RecoveryOrder>(rows[0].data, '售后挽回订单');
  if (order.id !== orderId) throw new RecoveryCommandError(409, '售后挽回订单标识与数据库记录不一致');
  return order;
}

async function writeRecoveryOrder(
  transaction: Prisma.TransactionClient,
  order: RecoveryOrder,
): Promise<void> {
  await transaction.businessRecord.update({
    where: { domain_recordId: { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: order.id } },
    data: {
      title: order.customerName,
      status: order.status,
      owner: order.recoveryUserName,
      customerId: order.customerId || null,
      orderId: null,
      amount: order.recoveryAmount,
      eventAt: new Date(order.recoveryAt || order.updatedAt),
      data: jsonValue(order),
    },
  });
}

async function findRecoveryCommissionRows(
  transaction: Prisma.TransactionClient,
  order: RecoveryOrder,
) {
  const commissionIds = Array.from(new Set(order.commissionIds || []));
  return transaction.businessRecord.findMany({
    where: {
      domain: STORAGE_KEYS.COMMISSIONS,
      OR: [
        { orderId: order.id },
        { data: { path: '$.sourceRecoveryOrderId', equals: order.id } },
        ...(commissionIds.length ? [{ recordId: { in: commissionIds } }] : []),
      ],
    },
  });
}

async function lockRecoveryCommissionRows(
  transaction: Prisma.TransactionClient,
  order: RecoveryOrder,
): Promise<Array<{ recordId: string; status: string | null; data: unknown }>> {
  // 兼容早期只在 JSON 中保存 sourceRecoveryOrderId，或仅由 commissionIds 关联的分账记录。
  // 售后挽回订单本身已先加行锁，先解析完整关联集合，再按稳定顺序逐行加锁。
  const related = await findRecoveryCommissionRows(transaction, order);
  const locked: Array<{ recordId: string; status: string | null; data: unknown }> = [];
  for (const recordId of related.map((row) => row.recordId).sort()) {
    const rows = await transaction.$queryRaw<Array<{ recordId: string; status: string | null; data: unknown }>>(Prisma.sql`
      SELECT recordId, status, data
      FROM business_records
      WHERE domain = ${STORAGE_KEYS.COMMISSIONS}
        AND recordId = ${recordId}
      FOR UPDATE
    `);
    locked.push(...rows);
  }
  return locked;
}

async function hasValidRecoveryPayoutContext(
  transaction: Prisma.TransactionClient,
  order: RecoveryOrder,
  context?: CommissionPayoutCorrectionContext,
): Promise<boolean> {
  if (!context?.payoutRecordId || !context.commissionId) return false;
  const row = await transaction.businessRecord.findUnique({
    where: {
      domain_recordId: {
        domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
        recordId: context.payoutRecordId,
      },
    },
  });
  if (!row) return false;
  const payout = parseObject<CommissionPayoutRecord>(row.data, '提成发放记录');
  if (String(row.status || payout.status || '') !== '已发放') return false;
  const snapshot = payout.commissionSnapshots?.find((commission) => commission.id === context.commissionId);
  return Boolean(
    snapshot
    && (payout.commissionIds || []).includes(context.commissionId)
    && isAfterSalesRecoveryCommission(snapshot)
    && relatedRecoveryCommission(order, snapshot),
  );
}

async function inspectRecoveryPayoutHistory(
  transaction: Prisma.TransactionClient,
  order: RecoveryOrder,
  commissionRows: Array<{ recordId: string; status: string | null; data: unknown }>,
): Promise<{ hasPaidSnapshot: boolean; missingSnapshotCommissionId?: string }> {
  const knownCommissions = new Map(commissionRows.map((row) => [
    row.recordId,
    parseObject<Commission>(row.data, '售后挽回分账'),
  ]));
  const rows = await transaction.businessRecord.findMany({
    where: { domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES },
  });
  let hasPaidSnapshot = false;
  let missingSnapshotCommissionId: string | undefined;
  for (const row of rows) {
    const payout = parseObject<CommissionPayoutRecord>(row.data, '提成发放记录');
    if (String(row.status || payout.status || '') !== '已发放') continue;
    const includedIds = new Set(payout.commissionIds || []);
    const validSnapshotIds = new Set<string>();
    for (const snapshot of payout.commissionSnapshots || []) {
      if (!includedIds.has(snapshot.id)) continue;
      validSnapshotIds.add(snapshot.id);
      if (isAfterSalesRecoveryCommission(snapshot) && relatedRecoveryCommission(order, snapshot)) {
        hasPaidSnapshot = true;
      }
    }
    for (const commissionId of includedIds) {
      if (validSnapshotIds.has(commissionId)) continue;
      const known = knownCommissions.get(commissionId);
      if (known && isAfterSalesRecoveryCommission(known) && relatedRecoveryCommission(order, known)) {
        missingSnapshotCommissionId ||= commissionId;
      }
    }
  }
  return { hasPaidSnapshot, missingSnapshotCommissionId };
}

const RECOVERY_CORRECTION_LABELS: Record<keyof RecoveryOrderInput, string> = {
  customerName: '客户姓名', customerPhone: '客户手机号', customerWechat: '客户微信',
  thirdPartyOrderNo: '平台订单号', sourcePlatform: '来源平台', sourcePlatformId: '来源平台ID',
  sourcePlatformName: '来源平台名称', sourceShopId: '来源店铺ID', sourceShopName: '来源店铺',
  originalProduct: '原产品', originalProductId: '原产品ID', originalProductLevel: '原产品等级',
  originalAmount: '原付款金额', originalPaymentAt: '原订单付款时间', refundStatus: '退款状态', recoveryAmount: '挽回成交金额',
  recoveryAt: '挽回成交时间', officialPaymentChannel: '官方收款渠道', paymentOrderNo: '付款订单号',
  paymentAt: '付款时间', paymentVoucher: '付款凭证', paymentVoucherName: '付款凭证名称',
  paymentVoucherPreview: '付款凭证预览', chatEvidence: '沟通凭证', chatEvidenceName: '沟通凭证名称',
  chatEvidencePreview: '沟通凭证预览', recoveryAttachments: '挽回凭证', paymentAttachments: '历史付款凭证',
  chatAttachments: '历史沟通凭证', recoveryUserId: '挽回人员', recoveryUserName: '挽回人员名称',
  assistUserId: '协助人员', assistUserName: '协助人员名称', remark: '备注', createdBy: '订单创建人ID',
  createdByName: '订单创建人',
};

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function recoveryChanges(current: RecoveryOrder, next: RecoveryOrder, fields: Array<keyof RecoveryOrderInput>) {
  return fields.filter((field) => !sameValue(current[field as keyof RecoveryOrder], next[field as keyof RecoveryOrder]))
    .map((field) => ({
      field: String(field),
      label: RECOVERY_CORRECTION_LABELS[field],
      before: current[field as keyof RecoveryOrder],
      after: next[field as keyof RecoveryOrder],
    }));
}

function appendRecoveryChange(
  order: RecoveryOrder,
  actor: AuthenticatedUser,
  changedAt: string,
  action: RecoveryOrderChangeLog['action'],
  summary: string,
  reason?: string,
  changes?: RecoveryOrderChangeLog['changes'],
): RecoveryOrderChangeLog[] {
  return [{
    id: `rch-${hash(`${order.id}:${action}:${changedAt}:${actor.id}`, 16)}`,
    action,
    operatorId: actor.id,
    operator: actor.name,
    changedAt,
    reason: cleanText(reason) || undefined,
    summary,
    changes: changes?.length ? changes : undefined,
  }, ...(order.changeHistory || [])];
}

function inspectRecoveryCorrection(
  order: RecoveryOrder,
  commissionRows: Array<{ status?: string | null; data: unknown }>,
  allowPaidCorrection = false,
  hasProtectedPayoutContext = false,
  missingSnapshotCommissionId?: string,
): RecoveryOrderCorrectionPrecheck {
  const commissions = commissionRows.map((row) => parseObject<Commission>(row.data, '售后挽回分账'));
  const statuses = Array.from(new Set(commissionRows.map((row, index) => (
    cleanText(row.status) || cleanText(commissions[index]?.status)
  )).filter(Boolean)));
  const settlementStatus = recoverySettlementStatus(order) as RecoveryOrderCorrectionPrecheck['settlementStatus'];
  const blocked = (
    reasonCode: NonNullable<RecoveryOrderCorrectionPrecheck['reasonCode']>,
    message: string,
    mode: RecoveryOrderCorrectionPrecheck['mode'] = 'standard',
  ): RecoveryOrderCorrectionPrecheck => ({
    allowed: false,
    reasonCode,
    message,
    commissionCount: commissions.length,
    commissionStatuses: statuses,
    settlementStatus,
    mode,
    requiresImpactPreview: mode === 'post_payout',
  });
  if (order.deletedAt) return blocked('order_deleted', '已删除的售后挽回订单不能更正');
  if (!['审核通过', '待分账', '已分账'].includes(order.status)) {
    return blocked('not_approved', '该记录尚未审核通过，请在审核台修改并重新提交');
  }
  if (missingSnapshotCommissionId) {
    return blocked(
      'payout_started',
      `历史已发提成 ${missingSnapshotCommissionId} 缺少逐笔发放快照，无法安全更正，请先由财务核对历史发放记录`,
      'post_payout',
    );
  }
  const payoutStarted = statuses.some((status) => ['已发放', '待冲销', '已冲销'].includes(status))
    || settlementStatus === '已发放'
    || hasProtectedPayoutContext;
  if (hasProtectedPayoutContext && statuses.some((status) => ['待确认', '待发放'].includes(status))) {
    return blocked(
      'settlement_processing',
      '当前仍有待确认或待发放分账，请先在财务撤回相关分账后再更正',
      'post_payout',
    );
  }
  if (payoutStarted && allowPaidCorrection && !statuses.some((status) => ['待冲销', '已冲销'].includes(status))) {
    return {
      allowed: true,
      message: '该挽回单提成已发放；超级管理员可更正业务资料，原发放记录、人员和金额保持不变',
      commissionCount: commissions.length,
      commissionStatuses: statuses,
      settlementStatus,
      mode: 'post_payout',
      requiresImpactPreview: true,
    };
  }
  if (payoutStarted) {
    return blocked('payout_started', '该挽回单已有提成进入发放或冲销流程，请先完成财务冲正', 'post_payout');
  }
  if (statuses.some((status) => !['待确认', '待发放', '已撤回'].includes(status))) {
    return blocked('unsupported_settlement_status', `分账状态“${statuses.find((status) => !['待确认', '待发放', '已撤回'].includes(status))}”暂不支持自动回退`);
  }
  if (!['未分账', '待处理', '待确认', '待发放', '已撤回'].includes(settlementStatus)) {
    return blocked('settlement_processing', `当前分账状态“${settlementStatus}”不能执行挽回单更正`);
  }
  return {
    allowed: true,
    message: commissions.length ? '更正后未发放分账将自动撤回，并回到待处理' : '当前售后挽回订单可以更正',
    commissionCount: commissions.length,
    commissionStatuses: statuses,
    settlementStatus,
    mode: 'standard',
    requiresImpactPreview: false,
  };
}

function validateInput(
  input: RecoveryOrderInput,
  actor: AuthenticatedUser,
  directory: Directory,
  scope: DataVisibilityScope,
  lockedRecoveryUserId?: string,
): {
  customerName: string;
  thirdPartyOrderNo: string;
  originalProduct: string;
  originalAmount: number;
  recoveryAmount: number;
  recoveryUser: User;
  assistUser?: User;
  assistUserName?: string;
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RecoveryCommandError(400, '售后挽回订单数据无效');
  }
  const customerName = cleanText(input.customerName);
  const thirdPartyOrderNo = cleanText(input.thirdPartyOrderNo);
  const originalProduct = cleanText(input.originalProduct);
  const recoveryAmount = amount(input.recoveryAmount);
  if (!customerName) throw new RecoveryCommandError(400, '请填写客户姓名');
  if (!cleanText(input.customerPhone) && !cleanText(input.customerWechat)) {
    throw new RecoveryCommandError(400, '手机号或微信至少填写一项');
  }
  const contactFieldError = recoveryContactFieldError(input);
  if (contactFieldError) throw new RecoveryCommandError(400, contactFieldError);
  const phoneError = getPhoneNumberError(cleanText(input.customerPhone));
  if (phoneError) throw new RecoveryCommandError(400, phoneError);
  if (!thirdPartyOrderNo) throw new RecoveryCommandError(400, '请填写平台订单号');
  if (!originalProduct) throw new RecoveryCommandError(400, '请填写原购买产品');
  if (amount(input.originalAmount) <= 0) throw new RecoveryCommandError(400, '原付款金额必须大于 0');
  if (recoveryAmount <= 0) throw new RecoveryCommandError(400, '挽回成交金额必须大于 0');
  const { recoveryUser, assistUser, assistUserName } = resolveRecoveryParticipants(
    input,
    actor,
    directory,
    scope,
    lockedRecoveryUserId,
  );
  return {
    customerName,
    thirdPartyOrderNo,
    originalProduct,
    originalAmount: amount(input.originalAmount),
    recoveryAmount,
    recoveryUser,
    assistUser,
    assistUserName,
  };
}

type RecoveryCorrectionCommissionSnapshot = {
  row: { recordId: string; status: string | null; data: unknown };
  commission: Commission;
};

function recoveryPostPayoutState(
  order: RecoveryOrder,
  snapshots: RecoveryCorrectionCommissionSnapshot[],
): {
  postPayoutCorrection: boolean;
  settlementStatus: RecoveryOrder['settlementStatus'];
  paidAt?: string;
} {
  const postPayoutCorrection = recoverySettlementStatus(order) === '已发放'
    || snapshots.some(({ row, commission }) => (
      (cleanText(row.status) || commission.status) === '已发放'
    ));
  const active = snapshots.filter(({ row, commission }) => (
    !isInactiveRecoveryCommissionStatus(cleanText(row.status) || commission.status)
  ));
  const statuses = active.map(({ row, commission }) => cleanText(row.status) || commission.status);
  const settlementStatus = statuses.includes('待确认')
    ? '待确认'
    : statuses.includes('待发放')
      ? '待发放'
      : statuses.length > 0 && statuses.every((status) => status === '已发放')
        ? '已发放'
        : recoverySettlementStatus(order) as RecoveryOrder['settlementStatus'];
  const paidAt = settlementStatus === '已发放'
    ? [order.settlementPaidAt, ...active.map(({ commission }) => commission.paidAt)]
      .filter((value): value is string => typeof value === 'string' && Number.isFinite(new Date(value).getTime()))
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0]
    : undefined;
  return { postPayoutCorrection, settlementStatus, paidAt };
}

function buildCorrectedRecoveryOrder(
  current: RecoveryOrder,
  data: RecoveryOrderInput,
  validated: ReturnType<typeof validateInput>,
  recoveryAttachments: BusinessAttachment[],
  actor: AuthenticatedUser,
  reason: string,
  changedAt: string,
  payoutState: ReturnType<typeof recoveryPostPayoutState>,
  commissionCount: number,
): RecoveryOrder {
  const postPayoutCorrection = payoutState.postPayoutCorrection;
  return {
    ...current,
    customerName: validated.customerName,
    submittedCustomerName: validated.customerName,
    customerPhone: cleanText(data.customerPhone) || undefined,
    customerWechat: cleanText(data.customerWechat) || undefined,
    thirdPartyOrderNo: validated.thirdPartyOrderNo,
    sourcePlatform: cleanText(data.sourcePlatform) || undefined,
    sourcePlatformId: cleanText(data.sourcePlatformId) || undefined,
    sourcePlatformName: cleanText(data.sourcePlatformName) || cleanText(data.sourcePlatform) || undefined,
    sourceShopId: cleanText(data.sourceShopId) || undefined,
    sourceShopName: cleanText(data.sourceShopName) || undefined,
    originalProduct: validated.originalProduct,
    originalProductId: cleanText(data.originalProductId) || undefined,
    originalProductLevel: cleanText(data.originalProductLevel) || undefined,
    originalAmount: validated.originalAmount,
    originalPaymentAt: optionalPaymentTime(data.originalPaymentAt, changedAt, '原订单付款时间'),
    recoveryAmount: validated.recoveryAmount,
    recoveryAt: recoveryTime(data.recoveryAt, current.recoveryAt || current.createdAt, changedAt),
    officialPaymentChannel: officialPaymentChannel(data.officialPaymentChannel),
    paymentOrderNo: cleanText(data.paymentOrderNo) || undefined,
    paymentAt: optionalPaymentTime(data.paymentAt, changedAt),
    recoveryAttachments,
    paymentAttachments: undefined,
    chatAttachments: undefined,
    recoveryUserId: validated.recoveryUser.id,
    recoveryUserName: validated.recoveryUser.name,
    assistUserId: validated.assistUser?.id,
    assistUserName: validated.assistUserName,
    remark: cleanText(data.remark) || undefined,
    status: '审核通过',
    settlementStatus: postPayoutCorrection ? payoutState.settlementStatus : '待处理',
    settlementHandledBy: postPayoutCorrection ? current.settlementHandledBy : undefined,
    settlementHandledAt: postPayoutCorrection ? current.settlementHandledAt : undefined,
    settlementConfirmedBy: postPayoutCorrection ? current.settlementConfirmedBy : undefined,
    settlementConfirmedAt: postPayoutCorrection ? current.settlementConfirmedAt : undefined,
    settlementPaidAt: postPayoutCorrection ? payoutState.paidAt : undefined,
    settlementWithdrawnBy: postPayoutCorrection
      ? current.settlementWithdrawnBy
      : commissionCount ? actor.name : undefined,
    settlementWithdrawnAt: postPayoutCorrection
      ? current.settlementWithdrawnAt
      : commissionCount ? changedAt : undefined,
    settlementWithdrawReason: postPayoutCorrection
      ? current.settlementWithdrawReason
      : commissionCount ? `挽回单更正：${reason}` : undefined,
    commissionIds: postPayoutCorrection ? current.commissionIds : [],
    updatedAt: changedAt,
  };
}

function correctedRecoveryCommission(
  current: RecoveryOrder,
  next: RecoveryOrder,
  commission: Commission,
  directory: Directory,
  changedAt: string,
): Commission {
  const performanceFollowsRecoveryAmount = Number(commission.performanceAmount ?? commission.orderAmount)
    === Number(current.recoveryAmount);
  const performanceAmount = performanceFollowsRecoveryAmount
    ? next.recoveryAmount
    : Number(commission.performanceAmount ?? commission.orderAmount ?? 0);
  const roleCode = cleanText(commission.roleCode);
  const role = cleanText(commission.role);
  const followsRecoveryOwner = role === '挽回人员' || roleCode === 'recovery_owner';
  const followsAssistOwner = role === '协助人员' || roleCode === 'recovery_assistant';
  const targetOwnerId = followsRecoveryOwner
    ? next.recoveryUserId
    : followsAssistOwner
      ? next.assistUserId
      : commission.ownerId;
  const targetOwner = targetOwnerId
    ? directory.users.find((user) => user.id === targetOwnerId)
    : undefined;
  const targetDepartment = targetOwner
    ? directory.departments.find((department) => department.id === targetOwner.departmentId)
    : undefined;
  const removedRole = followsAssistOwner && !targetOwnerId;
  const commissionAmount = removedRole
    ? 0
    : commission.ruleCalculationType === 'percentage' && performanceFollowsRecoveryAmount
      ? amount(performanceAmount * Number(commission.commissionRate || 0))
      : commission.commissionAmount;
  return {
    ...commission,
    customerName: next.customerName,
    productLevel: next.originalProductLevel || next.originalProduct,
    orderAmount: next.recoveryAmount,
    performanceAmount,
    commissionAmount,
    ownerId: removedRole ? commission.ownerId : targetOwner?.id || commission.ownerId,
    owner: removedRole ? commission.owner : targetOwner?.name || commission.owner,
    departmentId: removedRole ? commission.departmentId : targetDepartment?.id || targetOwner?.departmentId || commission.departmentId,
    department: removedRole ? commission.department : targetDepartment?.name || commission.department,
    paymentDate: next.recoveryAt || commission.paymentDate,
    status: removedRole ? '已撤回' : commission.status,
    proofStatus: next.recoveryAttachments?.length || next.paymentAttachments?.length
      || next.chatAttachments?.length || next.paymentVoucher || next.paymentVoucherName
      || next.chatEvidence || next.chatEvidenceName ? '已上传' : '待补充',
    updatedAt: changedAt,
  };
}

async function buildRecoveryCorrectionPreview(
  transaction: Prisma.TransactionClient,
  current: RecoveryOrder,
  next: RecoveryOrder,
  directory: Directory,
  changedAt: string,
): Promise<{ preview: CommissionCorrectionPreview; projectedById: Map<string, Commission> }> {
  const [commissionRows, payoutRows, correctionRows] = await Promise.all([
    transaction.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSIONS } }),
    transaction.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES } }),
    transaction.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSION_CORRECTIONS } }),
  ]);
  const allCommissions = commissionRows.map((row) => {
    const commission = parseObject<Commission>(row.data, '提成');
    return {
      ...commission,
      status: (cleanText(row.status) || commission.status) as Commission['status'],
    };
  });
  const payoutRecords = payoutRows.map((row) => parseObject<CommissionPayoutRecord>(row.data, '提成发放单'));
  const previousCorrections = correctionRows
    .map((row) => parseObject<CommissionCorrectionRecord>(row.data, '提成更正记录'))
    .filter((record) => Boolean(record.id));
  const projected = resolveCommissionEntitlements(allCommissions.map((commission) => (
    relatedRecoveryCommission(current, commission) && !commission.correctionCaseId
      ? correctedRecoveryCommission(current, next, commission, directory, changedAt)
      : commission
  )));
  try {
    const preview = buildCommissionCorrectionImpact({
      sourceBusinessType: 'after_sales_recovery',
      sourceBusinessId: current.id,
      sourceBusinessNo: current.recoveryNo,
      sourceRevision: current.updatedAt || current.createdAt,
      beforeBusinessSnapshot: cloneBusinessSnapshot(current),
      afterBusinessSnapshot: cloneBusinessSnapshot(next),
      beforeCommissions: allCommissions,
      afterCommissions: projected,
      payoutRecords,
    });
    const overlapping = findOverlappingFinancialCorrection(preview, previousCorrections);
    if (overlapping) {
      throw new RecoveryCommandError(
        409,
        `当前已有差额更正 ${overlapping.correctionNo} 涉及同一已发放提成，暂不支持叠加更正，请先在更正与差额台账处理`,
      );
    }
    return { preview, projectedById: new Map(projected.map((commission) => [commission.id, commission])) };
  } catch (error) {
    throw new RecoveryCommandError(409, error instanceof Error ? error.message : '无法计算已发放更正影响');
  }
}

function cloneBusinessSnapshot(value: RecoveryOrder): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  // 预览与正式提交之间的执行时间必然不同；并发校验由 sourceRevision 承担。
  // 不将易变审计字段纳入影响哈希，避免同一份业务修改永远无法确认。
  delete cloned.updatedAt;
  delete cloned.changeHistory;
  return cloned;
}

export function createRecoveryOrderCommandService(
  prisma: RecoveryCommandPrisma,
  options: RecoveryOrderCommandServiceOptions = {},
) {
  const now = options.now || (() => new Date());
  const run = async <T>(command: () => Promise<T>): Promise<ApiResponse<T | null>> => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return success(await command());
      } catch (error) {
        if (error instanceof RecoveryCommandError) return failure(error.message, error.responseCode);
        if ((error as { code?: unknown } | null)?.code === 'P2034' && attempt < 3) continue;
        if ((error as { code?: unknown } | null)?.code === 'P2034') {
          return failure('售后挽回订单发生并发冲突，请刷新后重试', 409);
        }
        throw error;
      }
    }
    return failure('售后挽回订单发生并发冲突，请刷新后重试', 409);
  };

  const prepareCorrection = async (
    transaction: Prisma.TransactionClient,
    orderId: string,
    input: RecoveryOrderCorrectionInput,
    actor: AuthenticatedUser,
    directory: Directory,
    scope: DataVisibilityScope,
  ) => {
    const current = await lockRecoveryOrder(transaction, cleanText(orderId));
    if (!recoveryWritable(current, scope)) throw new RecoveryCommandError(403, '无权更正该售后挽回订单');
    const commissionRows = await lockRecoveryCommissionRows(transaction, current);
    const commissionSnapshots: RecoveryCorrectionCommissionSnapshot[] = commissionRows.map((row) => ({
      row,
      commission: parseObject<Commission>(row.data, '售后挽回分账'),
    }));
    const hasProtectedPayoutContext = await hasValidRecoveryPayoutContext(
      transaction,
      current,
      input.payoutContext,
    );
    const payoutHistory = await inspectRecoveryPayoutHistory(transaction, current, commissionRows);
    const hasProtectedPayout = hasProtectedPayoutContext || payoutHistory.hasPaidSnapshot;
    const detectedPayoutState = recoveryPostPayoutState(current, commissionSnapshots);
    const payoutState = hasProtectedPayout || payoutHistory.missingSnapshotCommissionId
      ? { ...detectedPayoutState, postPayoutCorrection: true }
      : detectedPayoutState;
    if (payoutState.postPayoutCorrection && !isSuperAdmin(actor)) {
      throw new RecoveryCommandError(403, '只有超级管理员可以更正已发放的售后挽回订单');
    }
    const eligibility = inspectRecoveryCorrection(
      current,
      commissionRows,
      isSuperAdmin(actor),
      hasProtectedPayout,
      payoutHistory.missingSnapshotCommissionId,
    );
    if (!eligibility.allowed) throw new RecoveryCommandError(409, eligibility.message);
    const data = input?.data;
    const validated = validateInput(data, actor, directory, scope);
    const recoveryAttachments = resolveRecoveryAttachments(data);
    const duplicateRows = await transaction.businessRecord.findMany({ where: { domain: STORAGE_KEYS.RECOVERY_ORDERS } });
    const duplicate = duplicateRows
      .map((row) => parseObject<RecoveryOrder>(row.data, '售后挽回订单'))
      .find((order) => order.id !== current.id
        && normalizeOrderNo(order.thirdPartyOrderNo) === normalizeOrderNo(validated.thirdPartyOrderNo));
    if (duplicate) throw new RecoveryCommandError(409, '该平台订单号已经创建过售后挽回订单');
    const changedAt = now().toISOString();
    let next = buildCorrectedRecoveryOrder(
      current,
      data,
      validated,
      recoveryAttachments,
      actor,
      cleanText(input.reason),
      changedAt,
      payoutState,
      commissionRows.length,
    );
    const correctionFields = Object.keys(RECOVERY_CORRECTION_LABELS) as Array<keyof RecoveryOrderInput>;
    const changes = recoveryChanges(current, next, correctionFields);
    if (!changes.length) throw new RecoveryCommandError(400, '没有需要更正的字段');
    // 即使当前源单本身尚未发放，也可能通过同员工、同月份、同方案的月度阶梯
    // 改变其他业务单的已发提成，因此每次更正都必须先计算全局影响。
    let projection = await buildRecoveryCorrectionPreview(transaction, current, next, directory, changedAt);
    let protectedPayoutImpact = payoutState.postPayoutCorrection
      || projection.preview.impacts.some((impact) => impact.payoutRecordIds.length > 0);
    if (protectedPayoutImpact && !payoutState.postPayoutCorrection) {
      // 预览按更正后的未发分账继续参与月度阶梯计算；实际落库也必须保持同一状态，
      // 否则会出现“预览补发、提交后却撤回源单”的账实不一致。
      next = {
        ...next,
        settlementStatus: payoutState.settlementStatus,
        settlementHandledBy: current.settlementHandledBy,
        settlementHandledAt: current.settlementHandledAt,
        settlementConfirmedBy: current.settlementConfirmedBy,
        settlementConfirmedAt: current.settlementConfirmedAt,
        settlementPaidAt: payoutState.paidAt,
        settlementWithdrawnBy: current.settlementWithdrawnBy,
        settlementWithdrawnAt: current.settlementWithdrawnAt,
        settlementWithdrawReason: current.settlementWithdrawReason,
        commissionIds: current.commissionIds,
      };
      projection = await buildRecoveryCorrectionPreview(transaction, current, next, directory, changedAt);
      protectedPayoutImpact = payoutState.postPayoutCorrection
        || projection.preview.impacts.some((impact) => impact.payoutRecordIds.length > 0);
    }
    const preview = projection.preview;
    const projectedById = projection.projectedById;
    if (protectedPayoutImpact && !isSuperAdmin(actor)) {
      throw new RecoveryCommandError(403, '本次更正会影响已发放提成，只有超级管理员可以操作');
    }
    return {
      current,
      commissionRows,
      commissionSnapshots,
      payoutState,
      protectedPayoutImpact,
      projectedById,
      next,
      changes,
      changedAt,
      preview,
    };
  };

  return {
    async list(
      filters: RecoveryOrderFilters = {},
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<RecoveryOrderPage | null>> {
      const scopeDomain = filters.scopeDomain || 'recoveryOrders';
      const hasRecoveryRead = scopeDomain === 'recoveryOrderApplications'
        ? hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, 'read')
        : hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY, 'read')
          || hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, 'read');
      const financeOnly = scopeDomain === 'recoveryOrders'
        && !hasRecoveryRead
        && hasPermission(actor, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'read');
      const canRead = hasRecoveryRead || financeOnly;
      if (!canRead) {
        return failure<RecoveryOrderPage>(scopeDomain === 'recoveryOrderApplications'
          ? '无权查看售后挽回订单审核列表'
          : '无权查看售后挽回订单列表', 403);
      }
      const directory = await loadDirectory(prisma);
      const scope = recoveryScope(directory, actor, scopeDomain);
      const financeAllowedStatuses = ['待处理', '待确认', '待发放', '已发放', '已撤回'] as const;
      const requestedFinanceStatuses = filters.settlementStatuses?.length
        ? filters.settlementStatuses
        : filters.settlementStatus && filters.settlementStatus !== '全部'
          ? [filters.settlementStatus]
          : financeAllowedStatuses;
      const financeSettlementStatuses = requestedFinanceStatuses.filter((status) => (
        financeAllowedStatuses.includes(status as typeof financeAllowedStatuses[number])
      ));
      const hasExplicitFinanceSettlementFilter = Boolean(
        filters.settlementStatuses?.some((status) => financeAllowedStatuses.includes(
          status as typeof financeAllowedStatuses[number],
        ))
        || (filters.settlementStatus
          && filters.settlementStatus !== '全部'
          && financeAllowedStatuses.includes(filters.settlementStatus as typeof financeAllowedStatuses[number])),
      );
      const isFinanceSettlementQuery = scopeDomain === 'recoveryOrders'
        && hasPermission(actor, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'read')
        && hasExplicitFinanceSettlementFilter;
      const includeDeleted = Boolean(filters.includeDeleted && (
        scopeDomain === 'recoveryOrderApplications' || financeOnly || isFinanceSettlementQuery
      ));
      const defaultedFilters: RecoveryOrderFilters = {
        ...filters,
        sortBy: filters.sortBy || 'createdAt',
        sortDirection: filters.sortDirection || 'desc',
      };
      const effectiveFilters: RecoveryOrderFilters = financeOnly
        ? { ...defaultedFilters, includeDeleted, settlementStatus: undefined, settlementStatuses: financeSettlementStatuses }
        : { ...defaultedFilters, includeDeleted };
      const compactListItem = financeOnly ? compactRecoverySettlementListItem : compactRecoveryOrderListItem;
      if (financeOnly && !financeSettlementStatuses.length) {
        const page = toPositiveInt(effectiveFilters.page, 1);
        const pageSize = Math.min(toPositiveInt(effectiveFilters.pageSize, 10), 100);
        return success({ items: [], pagination: { page, pageSize, total: 0, totalPages: 0 } });
      }
      if (scope.unrestricted && typeof prisma.$queryRaw === 'function') {
        const result = await queryRecoveryPage(prisma, effectiveFilters, scope);
        const page = toPositiveInt(effectiveFilters.page, 1);
        const pageSize = Math.min(toPositiveInt(effectiveFilters.pageSize, 10), 100);
        return success({
          items: result.items.map(compactListItem),
          pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
        });
      }
      const rows = await prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.RECOVERY_ORDERS } });
      const items = rows
        .map((row) => parseObject<RecoveryOrder>(row.data, '售后挽回订单'))
        .filter((order) => recoveryVisible(order, scope) && matchesRecoveryOrder(order, effectiveFilters))
        .sort((left, right) => {
          const direction = effectiveFilters.sortDirection === 'asc' ? 1 : -1;
          const timeDifference = direction * (recoverySortTimestamp(left, effectiveFilters.sortBy) - recoverySortTimestamp(right, effectiveFilters.sortBy));
          return timeDifference || left.id.localeCompare(right.id);
        });
      const page = toPositiveInt(filters.page, 1);
      const pageSize = Math.min(toPositiveInt(filters.pageSize, 10), 100);
      const total = items.length;
      return success({
        items: items.slice((page - 1) * pageSize, page * pageSize).map(compactListItem),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    },

    async get(
      orderId: string,
      actor: AuthenticatedUser,
      scopeDomain: NonNullable<RecoveryOrderFilters['scopeDomain']> = 'recoveryOrders',
    ): Promise<ApiResponse<RecoveryOrder | null>> {
      const id = cleanText(orderId);
      if (!id) return failure<RecoveryOrder>('售后挽回订单ID不能为空', 400);
      const hasRecoveryRead = scopeDomain === 'recoveryOrderApplications'
        ? hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, 'read')
        : hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY, 'read')
          || hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, 'read');
      const financeOnly = scopeDomain === 'recoveryOrders'
        && !hasRecoveryRead
        && hasPermission(actor, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'read');
      const canRead = hasRecoveryRead || financeOnly;
      if (!canRead) return failure<RecoveryOrder>('无权查看该售后挽回订单', 403);
      const [row, directory] = await Promise.all([
        prisma.businessRecord.findUnique({
          where: { domain_recordId: { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: id } },
        }),
        loadDirectory(prisma),
      ]);
      if (!row) return failure<RecoveryOrder>('售后挽回订单不存在', 404);
      const order = parseObject<RecoveryOrder>(row.data, '售后挽回订单');
      if (order.deletedAt && !financeOnly && scopeDomain !== 'recoveryOrderApplications') {
        return failure<RecoveryOrder>('售后挽回订单不存在', 404);
      }
      if (scopeDomain === 'recoveryOrderApplications' && order.reviewCleanedAt) {
        return failure<RecoveryOrder>('售后审核记录不存在', 404);
      }
      if (financeOnly && order.settlementCleanedAt) {
        return failure<RecoveryOrder>('售后挽回分账记录不存在', 404);
      }
      if (financeOnly && !['待处理', '待确认', '待发放', '已发放', '已撤回'].includes(recoverySettlementStatus(order))) {
        return failure<RecoveryOrder>('无权查看该售后挽回订单', 403);
      }
      if (!recoveryVisible(order, recoveryScope(directory, actor, scopeDomain))) {
        return failure<RecoveryOrder>('无权查看该售后挽回订单', 403);
      }
      return success(publicRecoveryOrder(order, actor));
    },

    async settlementCounts(
      filters: Pick<RecoveryOrderFilters, 'search' | 'includeDeleted' | 'recoveryStartDate' | 'recoveryEndDate' | 'recoveryUserId'>,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<RecoverySettlementCounts | null>> {
      const canRead = hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY, 'read')
        || hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, 'read')
        || hasPermission(actor, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'read');
      if (!canRead) return failure<RecoverySettlementCounts>('无权查看售后挽回分账统计', 403);
      const directory = await loadDirectory(prisma);
      const scope = recoveryScope(directory, actor, 'recoveryOrders');
      if (scope.unrestricted && typeof prisma.$queryRaw === 'function') {
        return success(await queryRecoverySettlementCounts(prisma, filters, scope));
      }
      const rows = await prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.RECOVERY_ORDERS } });
      const readyStatuses = new Set(['待处理', '待确认', '待发放', '已发放', '已撤回']);
      const statusCounts: Record<string, number> = {
        待处理: 0,
        待确认: 0,
        待发放: 0,
        已发放: 0,
        已撤回: 0,
      };
      rows
        .map((row) => parseObject<RecoveryOrder>(row.data, '售后挽回订单'))
        .filter((order) => !order.settlementCleanedAt)
        .filter((order) => recoveryVisible(order, scope) && matchesRecoveryOrder(order, filters))
        .forEach((order) => {
          const settlementStatus = recoverySettlementStatus(order);
          if (readyStatuses.has(settlementStatus)) statusCounts[settlementStatus] += 1;
        });
      return success({
        total: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
        statusCounts,
      });
    },

    async create(
      input: RecoveryOrderInput,
      actor: AuthenticatedUser,
      imported?: { metadata: BusinessImportMetadata; customerId: string; customerMatchStatus: RecoveryOrder['customerMatchStatus'] },
    ): Promise<ApiResponse<RecoveryOrder | null>> {
      if (!imported && !hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, 'write')) {
        return failure('无权新增售后挽回订单', 403);
      }
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return failure('售后挽回订单数据无效', 400);
      }
      const customerName = cleanText(input.customerName);
      const thirdPartyOrderNo = cleanText(input.thirdPartyOrderNo);
      const originalProduct = cleanText(input.originalProduct);
      const recoveryAmount = amount(input.recoveryAmount);
      if (!customerName) return failure('请填写客户姓名', 400);
      if (!cleanText(input.customerPhone) && !cleanText(input.customerWechat)) {
        return failure('手机号或微信至少填写一项', 400);
      }
      const contactFieldError = recoveryContactFieldError(input);
      if (contactFieldError) return failure(contactFieldError, 400);
      const phoneError = getPhoneNumberError(cleanText(input.customerPhone));
      if (phoneError) return failure(phoneError, 400);
      if (!thirdPartyOrderNo) return failure('请填写平台订单号', 400);
      if (!originalProduct) return failure('请填写原购买产品', 400);
      if (amount(input.originalAmount) <= 0) return failure('原付款金额必须大于 0', 400);
      if (recoveryAmount <= 0) return failure('挽回成交金额必须大于 0', 400);
      let recoveryAttachments: BusinessAttachment[];
      let paymentChannel: OfficialPaymentChannel | undefined;
      let recoveryAt: string;
      let paymentAt: string | undefined;
      let originalPaymentAt: string | undefined;
      const createdAt = now().toISOString();
      try {
        recoveryAttachments = resolveRecoveryAttachments(input);
        paymentChannel = officialPaymentChannel(input.officialPaymentChannel);
        recoveryAt = recoveryTime(input.recoveryAt, createdAt, createdAt);
        paymentAt = optionalPaymentTime(input.paymentAt, createdAt);
        originalPaymentAt = optionalPaymentTime(input.originalPaymentAt, createdAt, '原订单付款时间');
      } catch (error) {
        if (error instanceof RecoveryCommandError) return failure(error.message, error.responseCode);
        throw error;
      }

      const directory = await loadDirectory(prisma);
      const scope = buildDataVisibilityScopeForUser(
        actor,
        directory.users,
        directory.roles,
        directory.departments,
        'recoveryOrderApplications',
      );
      let participants: ReturnType<typeof resolveRecoveryParticipants>;
      try {
        participants = resolveRecoveryParticipants(input, actor, directory, scope);
      } catch (error) {
        if (error instanceof RecoveryCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
      const { recoveryUser, assistUser, assistUserName } = participants;

      const normalizedNo = normalizeOrderNo(thirdPartyOrderNo);
      const baseId = `recovery-${hash(normalizedNo)}`;
      const buildNext = (id: string): RecoveryOrder => ({
        id,
        recoveryNo: `RCV-${createdAt.slice(0, 10).replace(/-/g, '')}-${hash(normalizedNo, 8).toUpperCase()}`,
        thirdPartyOrderNo,
        customerId: imported?.customerId || '',
        customerName,
        submittedCustomerName: customerName,
        customerPhone: cleanText(input.customerPhone) || undefined,
        customerWechat: cleanText(input.customerWechat) || undefined,
        customerMatchStatus: imported?.customerMatchStatus || '手工填写',
        sourcePlatform: cleanText(input.sourcePlatform) || undefined,
        sourcePlatformId: cleanText(input.sourcePlatformId) || undefined,
        sourcePlatformName: cleanText(input.sourcePlatformName) || cleanText(input.sourcePlatform) || undefined,
        sourceShopId: cleanText(input.sourceShopId) || undefined,
        sourceShopName: cleanText(input.sourceShopName) || undefined,
        originalProduct,
        originalProductId: cleanText(input.originalProductId) || undefined,
        originalProductLevel: cleanText(input.originalProductLevel) || undefined,
        originalAmount: amount(input.originalAmount),
        originalPaymentAt,
        recoveryAmount,
        recoveryAt,
        officialPaymentChannel: paymentChannel,
        paymentOrderNo: cleanText(input.paymentOrderNo) || undefined,
        paymentAt,
        paymentVoucher: input.paymentVoucher,
        paymentVoucherName: input.paymentVoucherName,
        paymentVoucherPreview: input.paymentVoucherPreview,
        chatEvidence: input.chatEvidence,
        chatEvidenceName: input.chatEvidenceName,
        chatEvidencePreview: input.chatEvidencePreview,
        recoveryAttachments,
        recoveryUserId: recoveryUser.id,
        recoveryUserName: recoveryUser.name,
        assistUserId: assistUser?.id,
        assistUserName,
        remark: cleanText(input.remark) || undefined,
        status: '待审核',
        settlementStatus: '未分账',
        commissionIds: [],
        createdBy: actor.id,
        createdByName: actor.name,
        changeHistory: [{
          id: `rch-${hash(`${id}:create:${createdAt}:${actor.id}`, 16)}`,
          action: 'create',
          operatorId: actor.id,
          operator: actor.name,
          changedAt: createdAt,
          summary: '创建售后挽回订单并提交审核',
        }],
        createdAt,
        updatedAt: createdAt,
        ...(imported?.metadata || {}),
      });
      let attemptedId = baseId;
      let attemptedNext = buildNext(baseId);

      try {
        const created = await prisma.$transaction(async (transaction) => {
          const rows = await transaction.businessRecord.findMany({
            where: { domain: STORAGE_KEYS.RECOVERY_ORDERS },
          });
          const orders = rows.map((row) => parseObject<RecoveryOrder>(row.data, '售后挽回订单'));
          const duplicate = orders.find((order) => (
            !order.deletedAt && normalizeOrderNo(order.thirdPartyOrderNo) === normalizedNo
          ));
          if (duplicate) {
            const desired = buildNext(duplicate.id);
            if (sameCreate(duplicate, desired, Boolean(cleanText(input.recoveryAt)))
              && (!imported || sameImportedIdentity(duplicate, imported.metadata))) return duplicate;
            throw new RecoveryCommandError(409, '该平台订单号已经创建过售后挽回订单');
          }
          const occupiedIds = new Set(rows.flatMap((row) => [row.recordId, parseObject<RecoveryOrder>(row.data, '售后挽回订单').id]));
          attemptedId = baseId;
          for (let replacement = 1; occupiedIds.has(attemptedId); replacement += 1) {
            attemptedId = `recovery-${hash(`${normalizedNo}:replacement:${replacement}`, 24)}`;
          }
          attemptedNext = buildNext(attemptedId);
          const persisted = options.crmBridge
            ? { ...attemptedNext, ...crmPatch(await options.crmBridge.resolve(transaction, attemptedNext)) }
            : attemptedNext;
          await transaction.businessRecord.create({
            data: {
              id: `${STORAGE_KEYS.RECOVERY_ORDERS}:${attemptedId}`,
              domain: STORAGE_KEYS.RECOVERY_ORDERS,
              recordId: attemptedId,
              title: persisted.customerName,
              status: persisted.status,
              owner: persisted.recoveryUserName,
              customerId: persisted.customerId || null,
              orderId: null,
              amount: persisted.recoveryAmount,
              eventAt: new Date(persisted.recoveryAt || createdAt),
              data: jsonValue(persisted),
            },
          });
          return persisted;
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 10_000,
        });
        return success(publicRecoveryOrder(created, actor));
      } catch (error) {
        if (error instanceof RecoveryCommandError) return failure(error.message, error.responseCode);
        if ((error as { code?: unknown } | null)?.code === 'P2002') {
          const concurrent = await prisma.businessRecord.findUnique({
            where: { domain_recordId: { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: attemptedId } },
          });
          if (concurrent) {
            const existing = parseObject<RecoveryOrder>(concurrent.data, '售后挽回订单');
            if (sameCreate(existing, attemptedNext, Boolean(cleanText(input.recoveryAt)))
              && (!imported || sameImportedIdentity(existing, imported.metadata))) return success(publicRecoveryOrder(existing, actor));
          }
          return failure('该平台订单号已经创建过售后挽回订单', 409);
        }
        throw error;
      }
    },

    async createImported(
      input: RecoveryOrderInput,
      actor: AuthenticatedUser,
      metadata: BusinessImportMetadata,
      customer: { id: string; matchStatus: RecoveryOrder['customerMatchStatus'] },
    ): Promise<ApiResponse<RecoveryOrder | null>> {
      return this.create(input, actor, { metadata, customerId: customer.id, customerMatchStatus: customer.matchStatus });
    },

    async precheckCorrection(
      orderId: string,
      actor: AuthenticatedUser,
      payoutContext?: CommissionPayoutCorrectionContext,
    ): Promise<ApiResponse<RecoveryOrderCorrectionPrecheck | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CORRECT, 'write')) {
        return failure<RecoveryOrderCorrectionPrecheck>('无售后挽回订单更正权限', 403);
      }
      if (!isSuperAdmin(actor)) {
        return failure<RecoveryOrderCorrectionPrecheck>('只有超级管理员可以更正售后挽回订单', 403);
      }
      const id = cleanText(orderId);
      if (!id) return failure<RecoveryOrderCorrectionPrecheck>('售后挽回订单ID不能为空', 400);
      const directory = await loadDirectory(prisma);
      const scope = recoveryScope(directory, actor);
      return run(() => prisma.$transaction(async (transaction) => {
        await lockCommissionLedger(transaction);
        const current = await lockRecoveryOrder(transaction, id);
        if (!recoveryWritable(current, scope)) throw new RecoveryCommandError(403, '无权更正该售后挽回订单');
        const commissionRows = await lockRecoveryCommissionRows(transaction, current);
        const hasProtectedPayoutContext = await hasValidRecoveryPayoutContext(
          transaction,
          current,
          payoutContext,
        );
        const payoutHistory = await inspectRecoveryPayoutHistory(transaction, current, commissionRows);
        const eligibility = inspectRecoveryCorrection(
          current,
          commissionRows,
          isSuperAdmin(actor),
          hasProtectedPayoutContext || payoutHistory.hasPaidSnapshot,
          payoutHistory.missingSnapshotCommissionId,
        );
        if (eligibility.allowed && isSuperAdmin(actor) && !eligibility.requiresImpactPreview) {
          return {
            ...eligibility,
            message: '更正前将先测算是否影响同月其他已发放阶梯提成',
            requiresImpactPreview: true,
          };
        }
        return eligibility;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      }));
    },

    async previewCorrection(
      orderId: string,
      input: RecoveryOrderCorrectionInput,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<CommissionCorrectionPreview | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CORRECT, 'write')) {
        return failure<CommissionCorrectionPreview>('无售后挽回订单更正权限', 403);
      }
      if (!isSuperAdmin(actor)) {
        return failure<CommissionCorrectionPreview>('只有超级管理员可以预览已发放提成影响', 403);
      }
      if (!cleanText(input?.reason)) return failure<CommissionCorrectionPreview>('请填写更正原因', 400);
      const directory = await loadDirectory(prisma);
      const scope = recoveryScope(directory, actor);
      return run(() => prisma.$transaction(async (transaction) => {
        await lockCommissionLedger(transaction);
        const prepared = await prepareCorrection(transaction, orderId, input, actor, directory, scope);
        return prepared.preview;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      }));
    },

    async editMetadata(
      orderId: string,
      input: RecoveryOrderMetadataEditInput,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<RecoveryOrder | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT, 'write')) {
        return failure<RecoveryOrder>('无售后挽回订单资料编辑权限', 403);
      }
      const directory = await loadDirectory(prisma);
      const scope = recoveryScope(directory, actor);
      return run(() => prisma.$transaction(async (transaction) => {
        const current = await lockRecoveryOrder(transaction, cleanText(orderId));
        if (!recoveryWritable(current, scope)) throw new RecoveryCommandError(403, '无权编辑该售后挽回订单');
        if (current.deletedAt) throw new RecoveryCommandError(409, '已删除售后挽回订单不能编辑');
        if (!['审核通过', '待分账', '已分账'].includes(current.status)) {
          throw new RecoveryCommandError(409, '审核前资料请在审核台修改并重新提交');
        }
        const attachments = input.recoveryAttachments === undefined
          ? current.recoveryAttachments || []
          : validateAttachments(input.recoveryAttachments, 'recovery-payment-proof', '挽回凭证');
        if (input.remark !== undefined && cleanText(input.remark).length > 2000) {
          throw new RecoveryCommandError(400, '备注不能超过2000个字符');
        }
        const changedAt = now().toISOString();
        const sourcePlatform = input.sourcePlatform === undefined
          ? current.sourcePlatform
          : cleanText(input.sourcePlatform) || undefined;
        const sourcePlatformName = input.sourcePlatformName === undefined
          ? (input.sourcePlatform === undefined ? current.sourcePlatformName : sourcePlatform)
          : cleanText(input.sourcePlatformName) || sourcePlatform;
        const next: RecoveryOrder = {
          ...current,
          sourcePlatform,
          sourcePlatformId: input.sourcePlatformId === undefined
            ? current.sourcePlatformId
            : cleanText(input.sourcePlatformId) || undefined,
          sourcePlatformName,
          sourceShopId: input.sourceShopId === undefined
            ? current.sourceShopId
            : cleanText(input.sourceShopId) || undefined,
          sourceShopName: input.sourceShopName === undefined
            ? current.sourceShopName
            : cleanText(input.sourceShopName) || undefined,
          paymentOrderNo: input.paymentOrderNo === undefined
            ? current.paymentOrderNo
            : cleanText(input.paymentOrderNo) || undefined,
          recoveryAttachments: attachments,
          paymentAttachments: input.recoveryAttachments === undefined ? current.paymentAttachments : undefined,
          chatAttachments: input.recoveryAttachments === undefined ? current.chatAttachments : undefined,
          remark: input.remark === undefined ? current.remark : cleanText(input.remark) || undefined,
          updatedAt: changedAt,
        };
        const fields: Array<keyof RecoveryOrderInput> = [
          'sourcePlatform', 'sourcePlatformId', 'sourcePlatformName', 'sourceShopId', 'sourceShopName',
          'paymentOrderNo', 'recoveryAttachments', 'remark',
        ];
        const changes = recoveryChanges(current, next, fields);
        if (!changes.length) throw new RecoveryCommandError(400, '没有需要保存的资料变化');
        next.changeHistory = appendRecoveryChange(current, actor, changedAt, 'edit', '编辑售后挽回订单补充资料', undefined, changes);
        await writeRecoveryOrder(transaction, next);
        return publicRecoveryOrder(next, actor);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      }));
    },

    async correct(
      orderId: string,
      input: RecoveryOrderCorrectionInput,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<RecoveryOrder | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CORRECT, 'write')) {
        return failure<RecoveryOrder>('无售后挽回订单更正权限', 403);
      }
      if (!isSuperAdmin(actor)) {
        return failure<RecoveryOrder>('只有超级管理员可以更正售后挽回订单', 403);
      }
      const reason = cleanText(input?.reason);
      if (!reason) return failure<RecoveryOrder>('请填写更正原因', 400);
      const directory = await loadDirectory(prisma);
      const scope = recoveryScope(directory, actor);
      return run(() => prisma.$transaction(async (transaction) => {
        await lockCommissionLedger(transaction);
        const prepared = await prepareCorrection(transaction, orderId, input, actor, directory, scope);
        const {
          current,
          commissionRows,
          payoutState,
          changes,
          changedAt,
          preview,
          protectedPayoutImpact,
          projectedById,
        } = prepared;
        if (protectedPayoutImpact) {
          if (!cleanText(input.expectedImpactHash)) {
            throw new RecoveryCommandError(409, '请先预览已发放更正影响并确认差额');
          }
          if (input.expectedImpactHash !== preview.impactHash) {
            throw new RecoveryCommandError(409, '更正影响已变化，请重新预览后再提交');
          }
        }
        let next = prepared.next;
        if (options.crmBridge) next = { ...next, ...crmPatch(await options.crmBridge.resolve(transaction, next)) };
        for (const row of commissionRows) {
          const commission = parseObject<Commission>(row.data, '售后挽回分账');
          if (protectedPayoutImpact) {
            const currentStatus = (cleanText(row.status) || commission.status) as Commission['status'];
            if (isInactiveRecoveryCommissionStatus(currentStatus)) continue;
            const projected = projectedById.get(commission.id)
              || correctedRecoveryCommission(current, next, commission, directory, changedAt);
            const paid = currentStatus === '已发放';
            const corrected: Commission = {
              ...projected,
              // 已发放明细只同步业务投影，不改写历史发放事实；
              // 同一订单内未发放的明细则仍按更正后资料直接重算。
              commissionAmount: paid ? commission.commissionAmount : projected.commissionAmount,
              ownerId: paid ? commission.ownerId : projected.ownerId,
              owner: paid ? commission.owner : projected.owner,
              departmentId: paid ? commission.departmentId : projected.departmentId,
              department: paid ? commission.department : projected.department,
              status: paid
                ? currentStatus
                : projected.status === '已撤回'
                  ? '已撤回'
                  : currentStatus,
              paidAt: paid ? commission.paidAt : undefined,
              payoutRecordId: paid ? commission.payoutRecordId : undefined,
              batchId: paid ? commission.batchId : undefined,
              auditReason: `超级管理员更正业务资料并保留原发放事实：${reason}`,
              isManualAdjusted: true,
              adjustReason: reason,
              adjustedBy: actor.name,
              adjustedAt: changedAt,
              updatedAt: changedAt,
            };
            await transaction.businessRecord.update({
              where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSIONS, recordId: row.recordId } },
              data: {
                status: corrected.status,
                owner: corrected.owner,
                customerId: next.customerId || null,
                orderId: next.id,
                amount: corrected.commissionAmount,
                eventAt: new Date(corrected.paymentDate || changedAt),
                data: jsonValue(corrected),
              },
            });
            continue;
          }
          if (commission.status === '已撤回') continue;
          const withdrawn: Commission = {
            ...commission,
            status: '已撤回',
            auditReason: `售后挽回订单更正自动撤回：${reason}`,
            adjustedBy: actor.name,
            adjustedAt: changedAt,
            updatedAt: changedAt,
          };
          await transaction.businessRecord.update({
            where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSIONS, recordId: row.recordId } },
            data: { status: withdrawn.status, amount: withdrawn.commissionAmount, data: jsonValue(withdrawn) },
          });
        }
        if (protectedPayoutImpact) {
          const refreshedRows = await transaction.businessRecord.findMany({
            where: { domain: STORAGE_KEYS.COMMISSIONS, orderId: current.id },
          });
          const refreshedState = recoveryPostPayoutState(next, refreshedRows.map((row) => ({
            row: { recordId: row.recordId, status: row.status, data: row.data },
            commission: parseObject<Commission>(row.data, '售后挽回分账'),
          })));
          next = {
            ...next,
            settlementStatus: refreshedState.settlementStatus,
            settlementPaidAt: refreshedState.paidAt,
          };
        }
        if (protectedPayoutImpact) {
          await persistCommissionCorrection(transaction, preview, reason, actor, { now: changedAt });
        }
        next.changeHistory = appendRecoveryChange(
          current,
          actor,
          changedAt,
          'correct',
          protectedPayoutImpact
            ? '超级管理员更正影响已发放提成（保留原发放记录）'
            : '更正售后挽回订单并将分账回退为待处理',
          reason,
          changes,
        );
        await writeRecoveryOrder(transaction, next);
        return publicRecoveryOrder(next, actor);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      }));
    },

    async update(
      orderId: string,
      input: RecoveryOrderInput,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<RecoveryOrder | null>> {
      const canEdit = hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT, 'write');
      const canCreate = hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, 'write');
      if (!canEdit && !canCreate) return failure('无权编辑售后挽回订单', 403);
      const directory = await loadDirectory(prisma);
      const scope = recoveryScope(directory, actor);
      return run(() => prisma.$transaction(async (transaction) => {
        const current = await lockRecoveryOrder(transaction, orderId);
        if (!recoveryWritable(current, scope)) throw new RecoveryCommandError(403, '无权编辑该售后挽回订单');
        if (current.deletedAt) throw new RecoveryCommandError(409, '已删除售后挽回订单不能编辑');
        if (current.status === '审核驳回') {
          throw new RecoveryCommandError(409, '审核驳回的售后挽回订单已终止，不能修改或重新提交；如需重新办理请新建申请');
        }
        const isReturnedForChanges = current.status === '退回修改';
        const canResubmitOwnReturn = canCreate
          && isReturnedForChanges
          && current.createdBy === actor.id;
        if (isReturnedForChanges && !canResubmitOwnReturn) {
          throw new RecoveryCommandError(403, '只有原创建人可以修改并重新提交退回修改的挽回单');
        }
        if (!isReturnedForChanges && !canEdit) {
          throw new RecoveryCommandError(403, '无权编辑售后挽回订单');
        }
        if (!['待审核', '退回修改'].includes(current.status)) {
          throw new RecoveryCommandError(409, '审核通过后的记录请使用“编辑资料”或“挽回单更正”');
        }
        const validated = validateInput(input, actor, directory, scope, current.recoveryUserId);
        const recoveryAttachments = resolveRecoveryAttachments(input);
        const rows = await transaction.businessRecord.findMany({ where: { domain: STORAGE_KEYS.RECOVERY_ORDERS } });
        const duplicate = rows
          .map((row) => parseObject<RecoveryOrder>(row.data, '售后挽回订单'))
          .find((order) => order.id !== current.id && normalizeOrderNo(order.thirdPartyOrderNo) === normalizeOrderNo(validated.thirdPartyOrderNo));
        if (duplicate) throw new RecoveryCommandError(409, '该平台订单号已经创建过售后挽回订单');
        const changedAt = now().toISOString();
        const resubmitted = isReturnedForChanges;
        const next: RecoveryOrder = {
          ...current,
          customerName: validated.customerName,
          submittedCustomerName: validated.customerName,
          customerPhone: cleanText(input.customerPhone) || undefined,
          customerWechat: cleanText(input.customerWechat) || undefined,
          thirdPartyOrderNo: validated.thirdPartyOrderNo,
          sourcePlatform: cleanText(input.sourcePlatform) || undefined,
          sourcePlatformId: cleanText(input.sourcePlatformId) || undefined,
          sourcePlatformName: cleanText(input.sourcePlatformName) || cleanText(input.sourcePlatform) || undefined,
          sourceShopId: cleanText(input.sourceShopId) || undefined,
          sourceShopName: cleanText(input.sourceShopName) || undefined,
          originalProduct: validated.originalProduct,
          originalProductId: cleanText(input.originalProductId) || current.originalProductId,
          originalProductLevel: cleanText(input.originalProductLevel) || current.originalProductLevel,
          originalAmount: validated.originalAmount,
          originalPaymentAt: optionalPaymentTime(input.originalPaymentAt, changedAt, '原订单付款时间'),
          recoveryAmount: validated.recoveryAmount,
          recoveryAt: recoveryTime(input.recoveryAt, current.recoveryAt || current.createdAt, changedAt),
          officialPaymentChannel: officialPaymentChannel(input.officialPaymentChannel),
          paymentOrderNo: cleanText(input.paymentOrderNo) || undefined,
          paymentAt: optionalPaymentTime(input.paymentAt, changedAt),
          paymentVoucher: input.paymentVoucher ?? current.paymentVoucher,
          paymentVoucherName: input.paymentVoucherName ?? current.paymentVoucherName,
          paymentVoucherPreview: input.paymentVoucherPreview ?? current.paymentVoucherPreview,
          chatEvidence: input.chatEvidence ?? current.chatEvidence,
          chatEvidenceName: input.chatEvidenceName ?? current.chatEvidenceName,
          chatEvidencePreview: input.chatEvidencePreview ?? current.chatEvidencePreview,
          recoveryAttachments,
          paymentAttachments: undefined,
          chatAttachments: undefined,
          recoveryUserId: validated.recoveryUser.id,
          recoveryUserName: validated.recoveryUser.name,
          assistUserId: validated.assistUser?.id,
          assistUserName: validated.assistUserName,
          remark: cleanText(input.remark) || undefined,
          status: resubmitted ? '待审核' : current.status,
          settlementStatus: resubmitted ? '未分账' : current.settlementStatus,
          auditReason: resubmitted ? undefined : current.auditReason,
          auditorId: resubmitted ? undefined : current.auditorId,
          auditorName: resubmitted ? undefined : current.auditorName,
          auditedAt: resubmitted ? undefined : current.auditedAt,
          updatedAt: changedAt,
        };
        const persisted = options.crmBridge
          ? { ...next, ...crmPatch(await options.crmBridge.resolve(transaction, next)) }
          : next;
        persisted.changeHistory = appendRecoveryChange(
          current,
          actor,
          changedAt,
          'edit',
          resubmitted ? '修改售后挽回订单并重新提交审核' : '编辑待审核售后挽回订单',
          undefined,
          recoveryChanges(current, persisted, Object.keys(RECOVERY_CORRECTION_LABELS) as Array<keyof RecoveryOrderInput>),
        );
        await writeRecoveryOrder(transaction, persisted);
        return publicRecoveryOrder(persisted, actor);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      }));
    },

    async approve(orderId: string, actor: AuthenticatedUser): Promise<ApiResponse<RecoveryOrder | null>> {
      return reviewTransition(orderId, 'approve', '', actor);
    },

    async returnForChanges(orderId: string, reason: string, actor: AuthenticatedUser): Promise<ApiResponse<RecoveryOrder | null>> {
      return reviewTransition(orderId, 'return', reason, actor);
    },

    async reject(orderId: string, reason: string, actor: AuthenticatedUser): Promise<ApiResponse<RecoveryOrder | null>> {
      return reviewTransition(orderId, 'reject', reason, actor);
    },

    async settle(
      orderId: string,
      rows: RecoverySettlementInput[],
      reason: string,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<RecoveryOrder | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'write')) {
        return failure('无权处理售后挽回分账', 403);
      }
      const cleanReason = cleanText(reason);
      if (!cleanReason) return failure('请填写分账说明', 400);
      if (!Array.isArray(rows) || !rows.length) return failure('至少添加一条分账记录', 400);
      const directory = await loadDirectory(prisma);
      return run(() => prisma.$transaction(async (transaction) => {
        await lockCommissionLedger(transaction);
        const current = await lockRecoveryOrder(transaction, orderId);
        if (current.deletedAt) throw new RecoveryCommandError(409, '源售后挽回订单已删除，不能处理分账');
        if (!['审核通过', '待分账'].includes(current.status)) throw new RecoveryCommandError(409, '只有审核通过的售后挽回订单才能分账');
        if (!['待处理', '待确认'].includes(recoverySettlementStatus(current))) {
          throw new RecoveryCommandError(409, '只有待处理或待确认的售后挽回订单可以调整分账');
        }
        const existingRows = await findRecoveryCommissionRows(transaction, current);
        const relatedRows = existingRows.filter((record) => relatedRecoveryCommission(
          current,
          parseObject<Commission>(record.data, '售后挽回分账'),
        ));
        const activeRelatedRows = relatedRows.filter((record) => !isInactiveRecoveryCommissionStatus(
          parseObject<Commission>(record.data, '售后挽回分账').status,
        ));
        if (activeRelatedRows.some((record) => parseObject<Commission>(record.data, '售后挽回分账').status !== '待确认')) {
          throw new RecoveryCommandError(409, '该售后挽回分账已进入发放链路，不能直接调整');
        }
        const changedAt = now().toISOString();
        const commissions = rows.map((row, index) => {
          const owner = directory.users.find((user) => user.id === cleanText(row.ownerId) && activeUser(user));
          if (!owner) throw new RecoveryCommandError(400, '分账人员不存在或已停用');
          const department = directory.departments.find((item) => item.id === owner.departmentId);
          return buildRecoveryCommission(current, row, owner, department, actor, changedAt, index);
        });
        for (const record of activeRelatedRows) {
          await transaction.businessRecord.delete({
            where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSIONS, recordId: record.recordId } },
          });
        }
        for (const commission of commissions) {
          await transaction.businessRecord.create({
            data: {
              id: `${STORAGE_KEYS.COMMISSIONS}:${commission.id}`,
              domain: STORAGE_KEYS.COMMISSIONS,
              recordId: commission.id,
              title: `${current.recoveryNo}-${commission.role}`,
              status: commission.status,
              owner: commission.owner,
              customerId: current.customerId || null,
              orderId: current.id,
              amount: commission.commissionAmount,
              eventAt: new Date(commission.paymentDate || changedAt),
              data: jsonValue(commission),
            },
          });
        }
        const next: RecoveryOrder = {
          ...current,
          status: '审核通过',
          settlementStatus: '待确认',
          settlementVersion: current.settlementVersion || 1,
          settlementRoundId: current.settlementRoundId || `recovery-settlement-${current.id}-v${current.settlementVersion || 1}`,
          settlementHandledBy: actor.name,
          settlementHandledAt: changedAt,
          settlementConfirmedBy: undefined,
          settlementConfirmedAt: undefined,
          settlementPaidAt: undefined,
          settlementWithdrawnBy: undefined,
          settlementWithdrawnAt: undefined,
          settlementWithdrawReason: undefined,
          commissionIds: commissions.map((commission) => commission.id),
          auditorId: current.auditorId || actor.id,
          auditorName: current.auditorName || actor.name,
          auditReason: cleanReason,
          updatedAt: changedAt,
        };
        next.changeHistory = appendRecoveryChange(
          current,
          actor,
          changedAt,
          'settlement',
          activeRelatedRows.length ? '调整售后挽回订单分账' : '创建售后挽回订单分账',
          cleanReason,
        );
        await writeRecoveryOrder(transaction, next);
        return publicRecoveryOrder(next, actor);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      }));
    },

    async confirmSettlement(orderId: string, actor: AuthenticatedUser): Promise<ApiResponse<RecoveryOrder | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'write')) {
        return failure('无权确认售后挽回分账', 403);
      }
      return transitionSettlement(orderId, 'confirm', '', actor);
    },

    async reopenSettlement(orderId: string, reason: string, actor: AuthenticatedUser): Promise<ApiResponse<RecoveryOrder | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'write')) {
        return failure('无权重新分账售后挽回订单', 403);
      }
      const cleanReason = cleanText(reason);
      if (!cleanReason) return failure('重新分账必须填写原因', 400);
      return run(() => prisma.$transaction(async (transaction) => {
        const current = await lockRecoveryOrder(transaction, orderId);
        if (current.deletedAt) throw new RecoveryCommandError(409, '源售后挽回订单已删除，不能重新分账');
        if (recoverySettlementStatus(current) !== '已撤回') {
          throw new RecoveryCommandError(409, '只有已撤回的售后挽回分账可以重新分账');
        }
        const records = await findRecoveryCommissionRows(transaction, current);
        const relatedRows = records.filter((record) => relatedRecoveryCommission(
          current,
          parseObject<Commission>(record.data, '售后挽回分账'),
        ));
        if (!relatedRows.length || relatedRows.some((record) => parseObject<Commission>(record.data, '售后挽回分账').status !== '已撤回')) {
          throw new RecoveryCommandError(409, '只有已撤回的售后挽回分账可以重新分账');
        }
        const changedAt = now().toISOString();
        const version = Math.max(...relatedRows.map((record) => {
          const value = Number(parseObject<Commission>(record.data, '售后挽回分账').settlementVersion || 1);
          return Number.isInteger(value) && value > 0 ? value : 1;
        })) + 1;
        const next: RecoveryOrder = {
          ...current,
          status: '审核通过',
          settlementStatus: '待处理',
          settlementVersion: version,
          settlementRoundId: `recovery-settlement-${current.id}-v${version}`,
          commissionIds: [],
          settlementHandledBy: undefined,
          settlementHandledAt: undefined,
          settlementConfirmedBy: undefined,
          settlementConfirmedAt: undefined,
          settlementPaidAt: undefined,
          settlementWithdrawnBy: undefined,
          settlementWithdrawnAt: undefined,
          settlementWithdrawReason: undefined,
          auditReason: `重新分账：${cleanReason}`,
          updatedAt: changedAt,
        };
        next.changeHistory = appendRecoveryChange(
          current, actor, changedAt, 'settlement', '重新打开售后挽回订单分账', cleanReason,
        );
        await writeRecoveryOrder(transaction, next);
        return publicRecoveryOrder(next, actor);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      }));
    },

    async resetSettlement(orderId: string, reason: string, actor: AuthenticatedUser): Promise<ApiResponse<RecoveryOrder | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'write')) {
        return failure('无权重置售后挽回分账', 403);
      }
      return transitionSettlement(orderId, 'reset', reason, actor);
    },

    async withdrawSettlement(orderId: string, reason: string, actor: AuthenticatedUser): Promise<ApiResponse<RecoveryOrder | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'write')) {
        return failure('无权撤回售后挽回分账', 403);
      }
      if (!cleanText(reason)) return failure('请填写撤回原因', 400);
      return transitionSettlement(orderId, 'withdraw', reason, actor);
    },

    async softDelete(orderId: string, reason: string, actor: AuthenticatedUser): Promise<ApiResponse<RecoveryOrder | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE, 'delete')) {
        return failure('无权删除售后挽回订单', 403);
      }
      const directory = await loadDirectory(prisma);
      const scope = recoveryScope(directory, actor);
      return run(() => prisma.$transaction(async (transaction) => {
        const current = await lockRecoveryOrder(transaction, orderId);
        if (!recoveryVisible(current, scope)) throw new RecoveryCommandError(403, '无权删除该售后挽回订单');
        if (current.deletedAt) return publicRecoveryOrder(current, actor);
        const commissionIds = new Set(current.commissionIds || []);
        const commissionRows = await transaction.businessRecord.findMany({
          where: {
            domain: STORAGE_KEYS.COMMISSIONS,
            OR: [
              { orderId: current.id },
              { data: { path: '$.sourceRecoveryOrderId', equals: current.id } },
              ...(commissionIds.size ? [{ recordId: { in: Array.from(commissionIds) } }] : []),
            ],
          },
        });
        const relatedCommissionStatuses = commissionRows.flatMap((row) => {
          const commission = parseObject<{
            id?: string;
            orderId?: string;
            sourceRecoveryOrderId?: string;
            status?: string;
          }>(row.data, '售后挽回分账');
          const related = isRecoveryCommissionRelatedToOrder(current.id, commissionIds, {
            ...commission,
            id: row.recordId || commission.id,
            orderId: row.orderId || commission.orderId,
          });
          return related ? [String(row.status || commission.status || '')] : [];
        });
        if (relatedCommissionStatuses.some((status) => status === '已发放')) {
          throw new RecoveryCommandError(409, '提成已发放，请财务线下处理');
        }
        if (relatedCommissionStatuses.some((status) => !isInactiveRecoveryCommissionStatus(status))) {
          throw new RecoveryCommandError(409, '该售后挽回订单仍有活动提成，请先撤回后再处理');
        }
        if (isRecoveryOrderDeletionLocked(current)) {
          throw new RecoveryCommandError(409, '该售后挽回订单已有分账，请先处理分账记录');
        }
        const deletedAt = now().toISOString();
        const next: RecoveryOrder = {
          ...current,
          deletedAt,
          deletedBy: actor.name,
          deleteReason: cleanText(reason) || '售后挽回订单删除',
          updatedAt: deletedAt,
        };
        next.changeHistory = appendRecoveryChange(
          current,
          actor,
          deletedAt,
          'delete',
          '删除售后挽回订单',
          next.deleteReason,
        );
        await writeRecoveryOrder(transaction, next);
        return publicRecoveryOrder(next, actor);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      }));
    },

    async cleanupDeletedReview(orderId: string, reason: string, actor: AuthenticatedUser): Promise<ApiResponse<RecoveryOrder | null>> {
      const cleanOrderId = cleanText(orderId);
      const cleanReason = cleanText(reason);
      if (!cleanOrderId) return failure('售后挽回订单ID不能为空', 400);
      if (!cleanReason) return failure('清理售后审核记录必须填写原因', 400);
      if (!isSuperAdmin(actor)) return failure('仅超级管理员可以清理售后审核记录', 403);
      return run(() => prisma.$transaction(async (transaction) => {
        const current = await lockRecoveryOrder(transaction, cleanOrderId);
        if (current.status !== '审核驳回' && !current.deletedAt) {
          throw new RecoveryCommandError(409, '只有已驳回，或业务单已经删除的售后审核记录可以清理');
        }
        if (current.reviewCleanedAt) return publicRecoveryOrder(current, actor);
        const cleanedAt = now().toISOString();
        const next: RecoveryOrder = {
          ...current,
          reviewCleanedAt: cleanedAt,
          reviewCleanedBy: actor.name,
          reviewCleanupReason: cleanReason,
          updatedAt: cleanedAt,
        };
        await writeRecoveryOrder(transaction, next);
        return publicRecoveryOrder(next, actor);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      }));
    },

    async cleanupDeletedSettlement(orderId: string, reason: string, actor: AuthenticatedUser): Promise<ApiResponse<RecoveryOrder | null>> {
      const cleanOrderId = cleanText(orderId);
      const cleanReason = cleanText(reason);
      if (!cleanOrderId) return failure('售后挽回订单ID不能为空', 400);
      if (!cleanReason) return failure('清理废弃售后挽回分账必须填写原因', 400);
      if (!isSuperAdmin(actor)) return failure('仅超级管理员可以清理废弃售后挽回分账', 403);
      return run(() => prisma.$transaction(async (transaction) => {
        const current = await lockRecoveryOrder(transaction, cleanOrderId);
        if (!current.deletedAt) {
          throw new RecoveryCommandError(409, '只有源售后挽回订单已删除的分账记录可以清理');
        }
        if (current.settlementCleanedAt) return publicRecoveryOrder(current, actor);
        const commissionIds = new Set(current.commissionIds || []);
        const commissionRows = await transaction.businessRecord.findMany({
          where: {
            domain: STORAGE_KEYS.COMMISSIONS,
            OR: [
              { orderId: current.id },
              { data: { path: '$.sourceRecoveryOrderId', equals: current.id } },
              ...(commissionIds.size ? [{ recordId: { in: Array.from(commissionIds) } }] : []),
            ],
          },
        });
        const relatedCommissionStatuses = commissionRows.flatMap((row) => {
          const commission = parseObject<{
            id?: string;
            orderId?: string;
            sourceRecoveryOrderId?: string;
            status?: string;
          }>(row.data, '售后挽回分账');
          const related = isRecoveryCommissionRelatedToOrder(current.id, commissionIds, {
            ...commission,
            id: row.recordId || commission.id,
            orderId: row.orderId || commission.orderId,
          });
          return related ? [String(row.status || commission.status || '')] : [];
        });
        if (relatedCommissionStatuses.some((status) => status === '已发放')) {
          throw new RecoveryCommandError(409, '提成已发放，请财务线下处理');
        }
        if (relatedCommissionStatuses.some((status) => !isInactiveRecoveryCommissionStatus(status))) {
          throw new RecoveryCommandError(409, '该废弃分账仍有活动提成，请先撤回后再处理');
        }
        const cleanedAt = now().toISOString();
        const next: RecoveryOrder = {
          ...current,
          settlementCleanedAt: cleanedAt,
          settlementCleanedById: actor.id,
          settlementCleanedBy: actor.name,
          settlementCleanupReason: cleanReason,
          updatedAt: cleanedAt,
        };
        await writeRecoveryOrder(transaction, next);
        return publicRecoveryOrder(next, actor);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      }));
    },
  };

  async function reviewTransition(
    orderId: string,
    action: 'approve' | 'return' | 'reject',
    reason: string,
    actor: AuthenticatedUser,
  ): Promise<ApiResponse<RecoveryOrder | null>> {
    if (!canReviewRecoveryOrders(actor)) {
      return failure('无权审核售后挽回订单', 403);
    }
    const normalizedReason = cleanText(reason);
    if (action !== 'approve' && !normalizedReason) return failure('请填写审核原因', 400);
    const directory = await loadDirectory(prisma);
    const scope = recoveryScope(directory, actor);
    return run(() => prisma.$transaction(async (transaction) => {
      const current = await lockRecoveryOrder(transaction, orderId);
      if (!recoveryVisible(current, scope)) throw new RecoveryCommandError(403, '无权审核该售后挽回订单');
      if (current.deletedAt) throw new RecoveryCommandError(409, '已删除售后挽回订单不能审核');
      if (action === 'approve' && ['审核通过', '待分账', '已分账'].includes(current.status)) return publicRecoveryOrder(current, actor);
      if (action === 'return' && current.status === '退回修改' && current.auditReason === normalizedReason) return publicRecoveryOrder(current, actor);
      if (action === 'reject' && current.status === '审核驳回' && current.auditReason === normalizedReason) return publicRecoveryOrder(current, actor);
      if (current.status !== '待审核') throw new RecoveryCommandError(409, '只有待审核售后挽回订单可以执行该操作');
      if (action === 'approve' && current.importBatchId) {
        const targetCreator = directory.users.find((user) => user.id === current.targetCreatorId && activeUser(user));
        if (!targetCreator || targetCreator.name !== current.targetCreatorName) {
          throw new RecoveryCommandError(409, '导入挽回单的目标创建人已变化，请退回处理');
        }
      }
      const changedAt = now().toISOString();
      const crmResult = action === 'approve' && options.crmBridge
        ? await options.crmBridge.resolveAndSyncLead(transaction, { ...current, auditedAt: changedAt, auditorId: actor.id, auditorName: actor.name })
        : null;
      if (crmResult?.crmIdentityStatus === '身份冲突') {
        throw new RecoveryCommandError(409, '客户手机号或微信存在身份冲突，请退回修改联系方式后再审核');
      }
      if (action === 'approve' && options.syncLeadSources) {
        await options.syncLeadSources(transaction);
      }
      const next: RecoveryOrder = {
        ...current,
        ...(crmResult || {}),
        status: action === 'approve' ? '审核通过' : action === 'return' ? '退回修改' : '审核驳回',
        settlementStatus: action === 'approve' ? '待处理' : '未分账',
        auditorId: actor.id,
        auditorName: actor.name,
        auditedAt: changedAt,
        auditReason: action === 'approve' ? `审核通过：${actor.name}` : normalizedReason,
        createdBy: action === 'approve' && current.targetCreatorId ? current.targetCreatorId : current.createdBy,
        createdByName: action === 'approve' && current.targetCreatorName ? current.targetCreatorName : current.createdByName,
        updatedAt: changedAt,
      };
      next.changeHistory = appendRecoveryChange(
        current,
        actor,
        changedAt,
        'review',
        action === 'approve' ? '审核通过售后挽回订单' : action === 'return' ? '退回售后挽回订单修改' : '驳回售后挽回订单',
        action === 'approve' ? undefined : normalizedReason,
      );
      await writeRecoveryOrder(transaction, next);
      return publicRecoveryOrder(next, actor);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 10_000,
    }));
  }

  async function transitionSettlement(
    orderId: string,
    action: 'confirm' | 'reset' | 'withdraw',
    reason: string,
    actor: AuthenticatedUser,
  ): Promise<ApiResponse<RecoveryOrder | null>> {
    return run(() => prisma.$transaction(async (transaction) => {
      await lockCommissionLedger(transaction);
      const current = await lockRecoveryOrder(transaction, orderId);
      if (current.deletedAt) throw new RecoveryCommandError(409, '源售后挽回订单已删除，分账仅保留只读留痕');
      const currentStatus = recoverySettlementStatus(current);
      if (action === 'confirm' && currentStatus !== '待确认') {
        throw new RecoveryCommandError(409, '只有待确认的售后挽回分账可以确认');
      }
      if (action === 'reset' && currentStatus !== '待确认') {
        throw new RecoveryCommandError(409, '只有待确认的售后挽回分账才能重置');
      }
      if (action === 'withdraw' && !['待确认', '待发放'].includes(currentStatus)) {
        throw new RecoveryCommandError(409, '只有待确认或待发放的售后挽回分账可以撤回');
      }
      const records = await findRecoveryCommissionRows(transaction, current);
      const relatedRows = records.filter((record) => relatedRecoveryCommission(
        current,
        parseObject<Commission>(record.data, '售后挽回分账'),
      ));
      const activeRelatedRows = relatedRows.filter((record) => !isInactiveRecoveryCommissionStatus(
        parseObject<Commission>(record.data, '售后挽回分账').status,
      ));
      if (!activeRelatedRows.length) throw new RecoveryCommandError(409, '该售后挽回订单没有分账明细');
      const changedAt = now().toISOString();
      if (action === 'reset') {
        if (activeRelatedRows.some((record) => parseObject<Commission>(record.data, '售后挽回分账').status !== '待确认')) {
          throw new RecoveryCommandError(409, '该售后挽回分账已进入发放链路，不能直接重置');
        }
        for (const record of activeRelatedRows) {
          await transaction.businessRecord.delete({
            where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSIONS, recordId: record.recordId } },
          });
        }
      } else {
        let changed = false;
        for (const record of activeRelatedRows) {
          const commission = parseObject<Commission>(record.data, '售后挽回分账');
          const canChange = action === 'confirm'
            ? commission.status === '待确认'
            : ['待确认', '待发放'].includes(commission.status);
          if (!canChange) continue;
          changed = true;
          const nextCommission: Commission = {
            ...commission,
            status: action === 'confirm' ? '待发放' : '已撤回',
            auditReason: action === 'confirm' ? undefined : `售后挽回分账撤回：${cleanText(reason)}`,
            adjustedBy: actor.name,
            adjustedAt: changedAt,
            updatedAt: changedAt,
          };
          await transaction.businessRecord.update({
            where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSIONS, recordId: record.recordId } },
            data: {
              status: nextCommission.status,
              amount: nextCommission.commissionAmount,
              eventAt: new Date(nextCommission.paymentDate || changedAt),
              data: jsonValue(nextCommission),
            },
          });
        }
        if (!changed) {
          throw new RecoveryCommandError(409, action === 'confirm'
            ? '该售后挽回订单没有待确认分账'
            : '该售后挽回订单没有可撤回提成');
        }
      }
      const next: RecoveryOrder = {
        ...current,
        status: '审核通过',
        settlementStatus: action === 'reset' ? '待处理' : action === 'confirm' ? '待发放' : '已撤回',
        settlementHandledBy: action === 'reset' ? undefined : current.settlementHandledBy,
        settlementHandledAt: action === 'reset' ? undefined : current.settlementHandledAt,
        settlementConfirmedBy: action === 'confirm'
          ? actor.name
          : action === 'reset'
            ? undefined
            : current.settlementConfirmedBy,
        settlementConfirmedAt: action === 'confirm'
          ? changedAt
          : action === 'reset'
            ? undefined
            : current.settlementConfirmedAt,
        settlementPaidAt: action === 'reset' ? undefined : current.settlementPaidAt,
        settlementWithdrawnBy: action === 'withdraw' ? actor.name : undefined,
        settlementWithdrawnAt: action === 'withdraw' ? changedAt : undefined,
        settlementWithdrawReason: action === 'withdraw' ? cleanText(reason) : undefined,
        commissionIds: action === 'reset' ? [] : current.commissionIds,
        auditReason: action === 'reset'
          ? `重置售后挽回分账：${cleanText(reason) || actor.name}`
          : action === 'confirm'
            ? `确认售后挽回分账：${actor.name}`
            : cleanText(reason),
        updatedAt: changedAt,
      };
      next.changeHistory = appendRecoveryChange(
        current,
        actor,
        changedAt,
        'settlement',
        action === 'confirm' ? '确认售后挽回订单分账' : action === 'reset' ? '重置售后挽回订单分账并回到待处理' : '撤回售后挽回订单分账',
        cleanText(reason) || undefined,
      );
      await writeRecoveryOrder(transaction, next);
      return publicRecoveryOrder(next, actor);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 10_000,
    }));
  }
}
