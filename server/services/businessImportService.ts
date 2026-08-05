import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AuthenticatedUser } from '../../src/types/auth';
import {
  BUSINESS_IMPORT_MAX_ROW_NUMBER,
  BUSINESS_IMPORT_MAX_ROWS,
  type BusinessImportConfirmRequest,
  type BusinessImportJobResult,
  type BusinessImportPrecheckResult,
  type BusinessImportRequest,
  type BusinessImportRow,
  type BusinessImportRowResult,
  type BusinessImportTemplateOptions,
  type BusinessImportType,
  type OrderImportRow,
  type RecoveryImportRow,
} from '../../src/types/businessImport';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { getPhoneNumberError, normalizePhoneForStorage } from '../../src/shared/utils/phoneNumber';

export type BusinessImportCustomerMatch = { id: string; name: string; inScope: boolean };
export type BusinessImportDirectory = BusinessImportTemplateOptions & {
  customerMatchesByContact: Map<string, BusinessImportCustomerMatch[]>;
  existingOrderNumbers: Set<string>;
  existingRecoveryOrderNumbers: Set<string>;
};

export type ValidatedBusinessImportRow = BusinessImportRowResult & {
  normalized: BusinessImportRow;
  customerId?: string;
};

export type BusinessImportPrecheckRecord = {
  tokenHash: string;
  actorId: string;
  type: BusinessImportType;
  rowsHash: string;
  totalCount: number;
  expiresAt: string;
  rows: ValidatedBusinessImportRow[];
};

export type BusinessImportDependencies = {
  secret: string;
  now?: () => Date;
  loadDirectory(user: AuthenticatedUser, type: BusinessImportType, rows?: BusinessImportRow[]): Promise<BusinessImportDirectory>;
  persistPrecheck(record: BusinessImportPrecheckRecord): Promise<void>;
  consumePrecheckAndCreateJob(input: {
    tokenHash: string;
    actorId: string;
    type: BusinessImportType;
    rowsHash: string;
    expiresAt: string;
    fileName: string;
    rows: ValidatedBusinessImportRow[];
    mode?: BusinessImportConfirmRequest['mode'];
  }): Promise<BusinessImportJobResult>;
  /** 确认阶段从私有附件存储重新校验附件所有权、分类和文件名。 */
  validateAttachments?(user: AuthenticatedUser, type: BusinessImportType, rows: BusinessImportRow[], expectedDraftId: string): Promise<void>;
};

type TokenPayload = { actorId: string; type: BusinessImportType; rowsHash: string; expiresAt: string; nonce: string };
const text = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => text(value).toLocaleLowerCase('zh-CN');
const normalizeDate = (value: unknown) => text(value);
const amount = (value: unknown) => Number(text(value));
const tokenHash = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

export class BusinessImportError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function importPermission(type: BusinessImportType): string {
  return type === 'orders' ? PERMISSION_KEYS.ORDER_IMPORT : PERMISSION_KEYS.AFTER_SALES_RECOVERY_IMPORT;
}

function assertPermission(user: AuthenticatedUser, type: BusinessImportType): void {
  if (!hasPermission(user, importPermission(type), 'write')) throw new BusinessImportError('无权导入当前业务数据', 403);
}

function assertRows(rows: BusinessImportRow[]): void {
  if (!Array.isArray(rows) || !rows.length) throw new BusinessImportError('导入文件没有可处理的数据');
  if (rows.length > BUSINESS_IMPORT_MAX_ROWS) throw new BusinessImportError(`单次最多导入 ${BUSINESS_IMPORT_MAX_ROWS} 条数据，请拆分文件后重试`);
  if (rows.some((row) => !Number.isSafeInteger(row.rowNumber) || row.rowNumber < 2 || row.rowNumber > BUSINESS_IMPORT_MAX_ROW_NUMBER)) {
    throw new BusinessImportError(`导入数据 rowNumber 行号必须是 2 到 ${BUSINESS_IMPORT_MAX_ROW_NUMBER} 之间的整数`);
  }
}

function assertUniqueRowNumbers(rows: BusinessImportRow[]): void {
  const seen = new Set<number>();
  for (const row of rows) {
    if (seen.has(row.rowNumber)) throw new BusinessImportError('导入数据 rowNumber 行号不能重复');
    seen.add(row.rowNumber);
  }
}

function normalizeRow(type: BusinessImportType, row: BusinessImportRow, index: number): BusinessImportRow {
  const common = {
    rowNumber: row.rowNumber ?? index + 2,
    customerName: text((row as any).customerName),
    customerPhone: normalizePhoneForStorage((row as any).customerPhone),
    customerWechat: lower((row as any).customerWechat),
    paymentChannel: text((row as any).paymentChannel),
    thirdPartyOrderNo: text((row as any).thirdPartyOrderNo),
    remark: text((row as any).remark),
  };
  if (type === 'orders') {
    const input = row as OrderImportRow;
    return {
      ...common, productName: text(input.productName), orderType: text(input.orderType), paymentAmount: text(input.paymentAmount),
      paidAt: normalizeDate(input.paidAt), paymentOrderNo: text(input.paymentOrderNo), salesUserName: text(input.salesUserName),
      creatorName: text(input.creatorName), notes: text(input.notes), paymentProofFileName: text(input.paymentProofFileName),
      dealEvidenceFileNames: text(input.dealEvidenceFileNames),
      paymentProofAttachmentIds: normalizeAttachmentIds(input.paymentProofAttachmentIds),
      dealEvidenceAttachmentIds: normalizeAttachmentIds(input.dealEvidenceAttachmentIds),
    };
  }
  const input = row as RecoveryImportRow;
  return {
    ...common, originalProduct: text(input.originalProduct), sourcePlatform: text(input.sourcePlatform), sourceShop: text(input.sourceShop),
    originalAmount: text(input.originalAmount), originalPaymentAt: normalizeDate(input.originalPaymentAt),
    recoveryAmount: text(input.recoveryAmount), recoveryAt: normalizeDate(input.recoveryAt),
    paymentOrderNo: text(input.paymentOrderNo), paymentAt: normalizeDate(input.paymentAt), recoveryUserName: text(input.recoveryUserName),
    assistUserName: text(input.assistUserName), creatorName: text(input.creatorName),
    recoveryEvidenceFileNames: text(input.recoveryEvidenceFileNames),
    recoveryEvidenceAttachmentIds: normalizeAttachmentIds(input.recoveryEvidenceAttachmentIds),
  };
}

function rowHash(type: BusinessImportType, rows: BusinessImportRow[]): string {
  const signableRows = rows.map((row) => {
    const signable = { ...row } as Record<string, unknown>;
    delete signable.paymentProofAttachmentIds;
    delete signable.dealEvidenceAttachmentIds;
    delete signable.recoveryEvidenceAttachmentIds;
    return signable;
  });
  return createHash('sha256').update(JSON.stringify({ type, rows: signableRows }), 'utf8').digest('hex');
}

function normalizeAttachmentIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new BusinessImportError('导入图片上传结果无效');
  const ids = value.map(text);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new BusinessImportError('导入图片上传结果无效');
  return ids;
}

function attachmentNames(value: unknown, max: number): string[] {
  const raw = text(value);
  if (!raw) return [];
  const names = raw.split(/[;；\n\r]+/u).map(text).filter(Boolean);
  if (names.length > max || new Set(names.map(lower)).size !== names.length) return [];
  return names;
}

function attachmentManifestErrors(type: BusinessImportType, row: BusinessImportRow): string[] {
  const errors: string[] = [];
  if (type === 'orders') {
    const order = row as OrderImportRow;
    const paymentNames = attachmentNames(order.paymentProofFileName, 1);
    const dealNames = attachmentNames(order.dealEvidenceFileNames, 8);
    if (text(order.paymentProofFileName) && !paymentNames.length) errors.push('付款截图文件名无效、重复或超过 1 张');
    if (text(order.dealEvidenceFileNames) && !dealNames.length) errors.push('成交资料图片文件名无效、重复或超过 8 张');
    return errors;
  }
  const recovery = row as RecoveryImportRow;
  const names = attachmentNames(recovery.recoveryEvidenceFileNames, 8);
  if (text(recovery.recoveryEvidenceFileNames) && !names.length) errors.push('挽回凭证文件名无效、重复或超过 8 张');
  return errors;
}

function assertUploadedAttachmentIds(type: BusinessImportType, rows: BusinessImportRow[]): void {
  for (const row of rows) {
    if (type === 'orders') {
      const order = row as OrderImportRow;
      if (attachmentNames(order.paymentProofFileName, 1).length !== (order.paymentProofAttachmentIds || []).length) {
        throw new BusinessImportError(`第 ${row.rowNumber} 行：付款截图上传结果不完整`, 409);
      }
      if (attachmentNames(order.dealEvidenceFileNames, 8).length !== (order.dealEvidenceAttachmentIds || []).length) {
        throw new BusinessImportError(`第 ${row.rowNumber} 行：成交资料上传结果不完整`, 409);
      }
      continue;
    }
    const recovery = row as RecoveryImportRow;
    if (attachmentNames(recovery.recoveryEvidenceFileNames, 8).length !== (recovery.recoveryEvidenceAttachmentIds || []).length) {
      throw new BusinessImportError(`第 ${row.rowNumber} 行：挽回凭证上传结果不完整`, 409);
    }
  }
}

function sign(payload: TokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `bi1.${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

function parseToken(token: string, secret: string): TokenPayload {
  const [version, body, signature] = text(token).split('.');
  if (version !== 'bi1' || !body || !signature) throw new BusinessImportError('导入预检凭证无效或已过期', 409);
  const expected = createHmac('sha256', secret).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new BusinessImportError('导入预检凭证无效或已过期', 409);
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload; } catch { throw new BusinessImportError('导入预检凭证无效或已过期', 409); }
}

function oneByName<T extends { name: string }>(items: T[], name: string): T | undefined {
  const matches = items.filter((item) => lower(item.name) === lower(name));
  return matches.length === 1 ? matches[0] : undefined;
}

function contactKeys(row: Pick<BusinessImportRow, 'customerPhone' | 'customerWechat'>): string[] {
  return [row.customerPhone ? `phone:${row.customerPhone}` : '', row.customerWechat ? `wechat:${lower(row.customerWechat)}` : ''].filter(Boolean);
}

export function validateBusinessImportRows(type: BusinessImportType, rows: BusinessImportRow[], directory: BusinessImportDirectory): ValidatedBusinessImportRow[] {
  const encounteredNumbers = new Set<string>();
  return rows.map((row) => {
    const errors: string[] = attachmentManifestErrors(type, row);
    const orderNumber = lower(row.thirdPartyOrderNo);
    const existing = type === 'orders' ? directory.existingOrderNumbers : directory.existingRecoveryOrderNumbers;
    if (type === 'recovery_orders' && !orderNumber) errors.push('第三方订单号不能为空');
    if (orderNumber && (existing.has(orderNumber) || encounteredNumbers.has(orderNumber))) errors.push('第三方订单号已存在或在本次文件中重复');
    if (orderNumber) encounteredNumbers.add(orderNumber);
    if (row.paymentChannel && !directory.paymentChannels.some((item) => lower(item) === lower(row.paymentChannel))) errors.push('官方收款渠道不存在或已停用');
    if (type === 'orders') {
      const order = row as OrderImportRow;
      if (!order.customerName) errors.push('客户姓名不能为空');
      const product = oneByName(directory.products, order.productName);
      if (!product) errors.push('产品不存在、已停用或重名');
      if (!oneByName(directory.orderTypes, order.orderType)) errors.push('订单类型不存在、已停用或重名');
      if (!oneByName(directory.users, order.salesUserName)) errors.push('销售负责人不存在、已离职或重名');
      if (order.creatorName && !oneByName(directory.users, order.creatorName)) errors.push('订单创建人不存在、已离职或重名');
      if (!order.paymentChannel) errors.push('官方收款渠道不能为空');
      if (!Number.isFinite(amount(order.paymentAmount)) || amount(order.paymentAmount) <= 0) errors.push('付款金额必须大于0');
      if (!order.paidAt) errors.push('付款时间不能为空');
      const contacts = contactKeys(order);
      if (!contacts.length) errors.push('订单导入必须填写手机号或微信，以唯一匹配在用客户');
      const candidates = new Map<string, BusinessImportCustomerMatch>();
      contacts.forEach((key) => (directory.customerMatchesByContact.get(key) || []).forEach((item) => candidates.set(item.id, item)));
      if (contacts.length && candidates.size !== 1) errors.push(candidates.size ? '手机号或微信无法唯一匹配在用客户' : '手机号或微信未匹配到在用客户');
      const customer = candidates.values().next().value as BusinessImportCustomerMatch | undefined;
      if (customer && !customer.inScope) errors.push('无权使用该客户创建订单');
      return { rowNumber: order.rowNumber, status: errors.length ? 'blocked' : 'ready', reason: errors.join('；') || '可导入', normalized: order, ...(customer && !errors.length ? { customerId: customer.id } : {}) };
    }
    const recovery = row as RecoveryImportRow;
    if (recovery.customerName.length > 120) errors.push('客户姓名不能超过120个字符');
    if (recovery.customerPhone.length > 50) errors.push('客户手机号不能超过50个字符');
    if (recovery.customerWechat.length > 100) errors.push('客户微信不能超过100个字符');
    const phoneError = getPhoneNumberError(recovery.customerPhone);
    if (phoneError) errors.push(phoneError);
    if (!contactKeys(recovery).length) errors.push('售后挽回订单导入必须填写手机号或微信');
    const platform = recovery.sourcePlatform ? oneByName(directory.recoveryPlatforms, recovery.sourcePlatform) : undefined;
    if (recovery.sourcePlatform && !platform) errors.push('来源平台不存在、已停用或重名');
    if (recovery.sourceShop && (!platform || !directory.recoveryShops.some((shop) => shop.platformId === platform.id && lower(shop.name) === lower(recovery.sourceShop)))) errors.push('来源店铺不存在、已停用或不属于所选平台');
    if (!oneByName(directory.users, recovery.recoveryUserName)) errors.push('挽回人员不存在、已离职或重名');
    if (recovery.assistUserName && !oneByName(directory.users, recovery.assistUserName)) errors.push('协助人员不存在、已离职或重名');
    if (recovery.creatorName && !oneByName(directory.users, recovery.creatorName)) errors.push('订单创建人不存在、已离职或重名');
    if (text(recovery.originalAmount) && (!Number.isFinite(amount(recovery.originalAmount)) || amount(recovery.originalAmount) < 0)) errors.push('原付款金额无效');
    if (!Number.isFinite(amount(recovery.recoveryAmount)) || amount(recovery.recoveryAmount) <= 0) errors.push('挽回成交金额必须大于0');
    if (!recovery.recoveryAt) errors.push('挽回成交时间不能为空');
    const contacts = contactKeys(recovery);
    const candidates = new Map<string, BusinessImportCustomerMatch>();
    contacts.forEach((key) => (directory.customerMatchesByContact.get(key) || []).forEach((item) => candidates.set(item.id, item)));
    if (contacts.length && candidates.size > 1) errors.push('手机号或微信匹配到多个客户，无法确定售后挽回订单归属');
    const customer = candidates.values().next().value as BusinessImportCustomerMatch | undefined;
    const status = errors.length ? 'blocked' as const : customer ? 'ready' as const : 'warning' as const;
    return {
      rowNumber: recovery.rowNumber,
      status,
      reason: errors.join('；') || (customer ? '已完成后台身份识别' : '未识别现有客户，审核通过后将查重并沉淀为线索'),
      normalized: recovery,
      ...(customer && !errors.length ? { customerId: customer.id } : {}),
    };
  });
}

export function createBusinessImportService(deps: BusinessImportDependencies) {
  if (text(deps.secret).length < 16) throw new Error('业务导入签名密钥至少需要16个字符');
  const now = () => deps.now?.() || new Date();
  const prepare = async (request: BusinessImportRequest, user: AuthenticatedUser) => {
    assertPermission(user, request.type); assertRows(request.rows);
    const normalized = request.rows.map((row, index) => normalizeRow(request.type, row, index));
    assertUniqueRowNumbers(normalized);
    const directory = await deps.loadDirectory(user, request.type, normalized);
    return { normalized, validated: validateBusinessImportRows(request.type, normalized, directory) };
  };
  return {
    async templateOptions(type: BusinessImportType, user: AuthenticatedUser): Promise<BusinessImportTemplateOptions> {
      assertPermission(user, type);
      const directory = await deps.loadDirectory(user, type);
      const { customerMatchesByContact: _matches, existingOrderNumbers: _orders, existingRecoveryOrderNumbers: _recoveries, ...options } = directory;
      return options;
    },
    async precheck(request: BusinessImportRequest, user: AuthenticatedUser): Promise<BusinessImportPrecheckResult> {
      const prepared = await prepare(request, user);
      const expiresAt = new Date(now().getTime() + 15 * 60_000).toISOString();
      const rowsHash = rowHash(request.type, prepared.normalized);
      const confirmationToken = sign({ actorId: user.id, type: request.type, rowsHash, expiresAt, nonce: randomUUID() }, deps.secret);
      await deps.persistPrecheck({ tokenHash: tokenHash(confirmationToken), actorId: user.id, type: request.type, rowsHash, totalCount: prepared.validated.length, expiresAt, rows: prepared.validated });
      const readyCount = prepared.validated.filter((row) => row.status !== 'blocked').length;
      const warningCount = prepared.validated.filter((row) => row.status === 'warning').length;
      return { confirmationToken, expiresAt, totalCount: prepared.validated.length, readyCount, warningCount, blockedCount: prepared.validated.length - readyCount, rows: prepared.validated.map(({ normalized: _normalized, customerId: _customerId, ...row }) => row) };
    },
    async confirm(request: BusinessImportConfirmRequest, user: AuthenticatedUser): Promise<BusinessImportJobResult> {
      assertPermission(user, request.type); assertRows(request.rows);
      if (!text(request.fileName)) throw new BusinessImportError('导入文件名不能为空');
      const token = parseToken(request.confirmationToken, deps.secret);
      if (token.actorId !== user.id || token.type !== request.type || new Date(token.expiresAt).getTime() <= now().getTime()) throw new BusinessImportError('导入预检凭证无效或已过期', 409);
      const prepared = await prepare(request, user);
      if (token.rowsHash !== rowHash(request.type, prepared.normalized)) throw new BusinessImportError('导入文件与预检内容不一致，请重新预检', 409);
      const eligibleRows = prepared.validated.filter((row) => row.status !== 'blocked');
      if (request.mode !== 'eligible_only' && eligibleRows.length !== prepared.validated.length) {
        throw new BusinessImportError('导入数据或配置已变化，请重新预检', 409);
      }
      if (!eligibleRows.length) throw new BusinessImportError('没有可导入的数据');
      const eligibleNormalized = eligibleRows.map((row) => row.normalized);
      assertUploadedAttachmentIds(request.type, eligibleNormalized);
      const hasEligibleAttachments = eligibleNormalized.some((row) => (
        (row as OrderImportRow).paymentProofAttachmentIds?.length
        || (row as OrderImportRow).dealEvidenceAttachmentIds?.length
        || (row as RecoveryImportRow).recoveryEvidenceAttachmentIds?.length
      ));
      if (hasEligibleAttachments) {
        await deps.validateAttachments?.(user, request.type, eligibleNormalized, tokenHash(request.confirmationToken));
      }
      return deps.consumePrecheckAndCreateJob({
        tokenHash: tokenHash(request.confirmationToken), actorId: user.id, type: request.type,
        rowsHash: token.rowsHash, expiresAt: token.expiresAt, fileName: text(request.fileName),
        rows: prepared.validated, mode: request.mode,
      });
    },
  };
}
