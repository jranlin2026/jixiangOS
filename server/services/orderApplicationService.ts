import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import { STORAGE_KEYS, normalizeResourceOwnership } from '../../src/shared/utils/constants';
import {
  buildDataVisibilityScopeForUser,
  type DataVisibilityScope,
} from '../../src/shared/utils/dataVisibility';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer } from '../../src/types/customer';
import type { Order, OrderApplication, OrderApplicationReviewLog } from '../../src/types/order';
import type { Product } from '../../src/types/product';
import type { DataScopeDomain, Role } from '../../src/types/role';
import type { Department } from '../../src/types/department';
import type { User } from '../../src/types/settings';
import type { BusinessAttachment, BusinessAttachmentCategory } from '../../src/types/businessAttachment';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import {
  buildCustomerAccessContextFromDirectory,
  canReadCustomer,
} from './customerAccessPolicy';
import { customerWriteConflictResponse } from './customerWriteConflict';
import { lockCustomerAssociationScope } from './customerAssociationRegistry';

type OrderApplicationPrisma = Pick<
  PrismaClient,
  'businessRecord' | 'user' | 'role' | 'department' | '$transaction'
>;

export type OrderApprovalEffectStatus = 'applied' | 'deferred';

/**
 * These are the side effects previously hidden inside the browser-side
 * orderApi.createOrder call. A service response must report them honestly.
 */
export interface OrderApprovalEffectState {
  customerOrderStats: OrderApprovalEffectStatus;
  commissionGeneration: OrderApprovalEffectStatus;
  deliveryCreation: OrderApprovalEffectStatus;
  customerLifecycle: OrderApprovalEffectStatus;
}

export interface OrderApprovalResult {
  application: OrderApplication;
  order: Order;
  replayed: boolean;
  downstreamEffects: OrderApprovalEffectState;
}

export interface OrderApprovalEffectContext {
  /** The hook must perform database-only work and must not make network calls. */
  transaction: Prisma.TransactionClient;
  application: OrderApplication;
  order: Order;
  reviewer: AuthenticatedUser;
  approvedAt: string;
}

export type ApplyOrderApprovalDownstreamEffects = (
  context: OrderApprovalEffectContext,
) => Promise<Partial<OrderApprovalEffectState> | void>;

export interface OrderApplicationServiceOptions {
  now?: () => Date;
  idFactory?: () => string;
  /**
   * Optional transactional seam for customer statistics, commissions,
   * delivery creation, and lifecycle projection. Missing effects remain
   * explicitly "deferred" and are never presented as completed.
   */
  applyDownstreamEffects?: ApplyOrderApprovalDownstreamEffects;
}

type LockedApplicationRow = {
  id: string;
  domain: string;
  recordId: string;
  status: string | null;
  data: unknown;
};

type StoredOrder = Order & {
  sourceApplicationId: string;
  approvalDownstreamEffects: OrderApprovalEffectState;
};

type OrderApplicationInput = OrderApplication['orderData'];

type CommandDirectory = {
  users: User[];
  roles: Role[];
  departments: Department[];
};

const STATUS_PENDING_REVIEW = '待财务审核';
const STATUS_RETURNED = '退回修改';
const STATUS_APPROVED = '已入库';
const STATUS_REJECTED = '已驳回';
const MAX_TRANSACTION_ATTEMPTS = 3;

const DEFERRED_EFFECTS: OrderApprovalEffectState = {
  customerOrderStats: 'deferred',
  commissionGeneration: 'deferred',
  deliveryCreation: 'deferred',
  customerLifecycle: 'deferred',
};

class OrderApprovalError extends Error {
  constructor(readonly responseCode: number, message: string) {
    super(message);
    this.name = 'OrderApprovalError';
  }
}

function parseJsonObject<T extends object>(value: unknown, label: string): T {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${label} is not an object`);
    }
    return parsed as T;
  } catch {
    throw new OrderApprovalError(409, `${label}数据损坏，请先修复数据`);
  }
}

function finiteAmount(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function validateAttachmentList(
  value: unknown,
  options: { label: string; max: number; category: BusinessAttachmentCategory },
): BusinessAttachment[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new OrderApprovalError(400, `${options.label}必须是数组`);
  if (value.length > options.max) throw new OrderApprovalError(400, `${options.label}最多上传 ${options.max} 张`);
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new OrderApprovalError(400, `${options.label}数据无效`);
    }
    const attachment = item as Partial<BusinessAttachment>;
    if (!String(attachment.id || '').trim() || attachment.category !== options.category || !String(attachment.mimeType || '').startsWith('image/')) {
      throw new OrderApprovalError(400, `${options.label}数据无效`);
    }
    return {
      id: String(attachment.id), name: String(attachment.name || ''), mimeType: String(attachment.mimeType),
      size: Number(attachment.size) || 0, category: attachment.category,
      uploadedById: String(attachment.uploadedById || ''), uploadedByName: String(attachment.uploadedByName || ''),
      uploadedAt: String(attachment.uploadedAt || ''),
    };
  });
}

function hashSuffix(value: string, length = 16): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function deterministicOrderId(applicationId: string): string {
  return `order-${hashSuffix(applicationId)}`;
}

function orderDate(application: OrderApplication, approvedAt: string): string {
  const submitted = new Date(application.submittedAt);
  const date = Number.isNaN(submitted.getTime()) ? new Date(approvedAt) : submitted;
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function deterministicOrderNo(application: OrderApplication, approvedAt: string): string {
  const readableSuffix = application.id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-16);
  return `ORD-${orderDate(application, approvedAt)}-${readableSuffix || hashSuffix(application.id, 12).toUpperCase()}`;
}

function normalizedEffects(value?: Partial<OrderApprovalEffectState> | null): OrderApprovalEffectState {
  const effect = (key: keyof OrderApprovalEffectState): OrderApprovalEffectStatus => (
    value?.[key] === 'applied' ? 'applied' : 'deferred'
  );
  return {
    customerOrderStats: effect('customerOrderStats'),
    commissionGeneration: effect('commissionGeneration'),
    deliveryCreation: effect('deliveryCreation'),
    customerLifecycle: effect('customerLifecycle'),
  };
}

function validatePendingApplication(applicationId: string, application: OrderApplication): void {
  if (!application.id || application.id !== applicationId) {
    throw new OrderApprovalError(409, '订单申请标识与数据库记录不一致');
  }
  if (!application.orderData || typeof application.orderData !== 'object') {
    throw new OrderApprovalError(409, '订单申请缺少订单数据');
  }
  if (!String(application.orderData.customerId || '').trim()) {
    throw new OrderApprovalError(409, '订单申请缺少客户ID');
  }
  if (!String(application.orderData.customerName || '').trim()) {
    throw new OrderApprovalError(409, '订单申请缺少客户名称');
  }
  const amount = finiteAmount(application.orderData.actualAmount ?? application.orderData.amount);
  if (amount === null || amount < 0) {
    throw new OrderApprovalError(409, '订单申请金额无效');
  }
}

function applicationIsVisible(application: OrderApplication, scope: DataVisibilityScope): boolean {
  return scope.unrestricted
    || Boolean(application.applicantId && scope.visibleUserIds.includes(application.applicantId))
    || Boolean(!application.applicantId && application.applicantName && scope.visibleUserNames.includes(application.applicantName));
}

async function loadCommandDirectory(
  prisma: OrderApplicationPrisma,
): Promise<CommandDirectory> {
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

function commandScope(
  directory: CommandDirectory,
  actor: AuthenticatedUser,
  domain: DataScopeDomain,
): DataVisibilityScope {
  return buildDataVisibilityScopeForUser(
    actor,
    directory.users,
    directory.roles,
    directory.departments,
    domain,
  );
}

async function loadApplicationScope(
  prisma: OrderApplicationPrisma,
  reviewer: AuthenticatedUser,
): Promise<DataVisibilityScope> {
  const directory = await loadCommandDirectory(prisma);
  return commandScope(directory, reviewer, 'orderApplications');
}

function activeDirectoryUser(user: User): boolean {
  return user.isActive && (user.employmentStatus || 'active') === 'active';
}

function resolveSalesOwner(
  input: OrderApplicationInput,
  actor: AuthenticatedUser,
  directory: CommandDirectory,
  orderScope: DataVisibilityScope,
): Pick<User, 'id' | 'name'> {
  const current = directory.users.find((user) => user.id === actor.id && activeDirectoryUser(user));
  if (!current) throw new OrderApprovalError(403, '当前用户不在可用员工目录中');
  if (directory.users.filter((user) => activeDirectoryUser(user) && user.name === current.name).length !== 1) {
    throw new OrderApprovalError(409, '当前员工姓名重复，请先修复员工目录');
  }

  const requestedId = String(input.salesId || '').trim();
  if (!requestedId || requestedId === actor.id) return current;
  if (orderScope.dataScopeLevel === 'self') {
    return current;
  }

  const target = directory.users.find((user) => user.id === requestedId && activeDirectoryUser(user));
  if (!target) throw new OrderApprovalError(409, '指定销售不存在或已离职');
  if (!orderScope.unrestricted && !orderScope.visibleUserIds.includes(target.id)) {
    throw new OrderApprovalError(403, '指定销售超出当前订单数据范围');
  }
  if (directory.users.filter((user) => activeDirectoryUser(user) && user.name === target.name).length !== 1) {
    throw new OrderApprovalError(409, '指定销售姓名重复，请先修复员工目录');
  }
  return target;
}

function cleanOrderInput(input: OrderApplicationInput): Record<string, unknown> {
  const clean = { ...(input as unknown as Record<string, unknown>) };
  [
    'id',
    'orderNo',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'deletedBy',
    'deleteReason',
    'sourceApplicationId',
    'approvalDownstreamEffects',
    'commissionId',
    'deliveryId',
    'applicantId',
    'applicantName',
    'reviewerId',
    'reviewerName',
  ].forEach((key) => delete clean[key]);
  return clean;
}

/**
 * Association locks prevent a customer delete from interleaving with an order
 * application write, but the writer still has to read the locked state.  Keep
 * that post-lock check shared so submit, resubmit, review transitions, and
 * approval all make the same active-customer guarantee.
 */
async function requireActiveOrderApplicationCustomer(
  transaction: Prisma.TransactionClient,
  customerIdInput: unknown,
  message = '订单申请关联客户不存在或已删除',
): Promise<Customer> {
  const customerId = String(customerIdInput || '').trim();
  if (!customerId) throw new OrderApprovalError(409, message);
  const customerRow = await transaction.businessRecord.findUnique({
    where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: customerId } },
  });
  if (!customerRow) throw new OrderApprovalError(409, message);
  const customer = parseJsonObject<Customer>(customerRow.data, '客户');
  if (customer.id !== customerId || customer.deletedAt) {
    throw new OrderApprovalError(409, message);
  }
  return customer;
}

async function canonicalizeOrderApplicationInput(
  transaction: Prisma.TransactionClient,
  input: OrderApplicationInput,
  actor: AuthenticatedUser,
  directory: CommandDirectory,
): Promise<OrderApplicationInput> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new OrderApprovalError(400, '订单申请数据无效');
  }
  const customerId = String(input.customerId || '').trim();
  const productId = String(input.productId || '').trim();
  if (!customerId) throw new OrderApprovalError(400, '客户ID不能为空');
  if (!productId) throw new OrderApprovalError(400, '产品ID不能为空');
  if (!String(input.orderType || '').trim()) throw new OrderApprovalError(400, '订单类型不能为空');
  if (!String(input.paymentMethod || '').trim()) throw new OrderApprovalError(400, '支付方式不能为空');
  const listedAmount = finiteAmount(input.amount);
  const paidAmount = finiteAmount(input.actualAmount ?? input.amount);
  if (listedAmount === null || listedAmount <= 0) throw new OrderApprovalError(400, '订单金额必须大于0');
  if (paidAmount === null || paidAmount <= 0) throw new OrderApprovalError(400, '订单实付金额必须大于0');
  if (!Array.isArray(input.payments)) throw new OrderApprovalError(400, '付款记录必须是数组');
  input.payments.forEach((payment) => validateAttachmentList(payment.attachments, {
    label: '付款截图', max: 1, category: 'order-payment-proof',
  }));
  validateAttachmentList(input.dealEvidenceAttachments, {
    label: '聊天记录', max: 8, category: 'order-deal-evidence',
  });

  const [customer, productRow] = await Promise.all([
    requireActiveOrderApplicationCustomer(transaction, customerId, '客户不存在或已删除'),
    transaction.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.PRODUCTS, recordId: productId } },
    }),
  ]);
  if (!productRow) throw new OrderApprovalError(409, '产品不存在');
  const product = parseJsonObject<Product>(productRow.data, '产品');
  if (product.id !== productId || product.isActive === false) throw new OrderApprovalError(409, '产品不存在或已停用');

  const customerAccess = buildCustomerAccessContextFromDirectory(
    actor,
    directory.users,
    directory.roles,
    directory.departments,
  );
  if (!canReadCustomer(customerAccess, customer)) throw new OrderApprovalError(403, '无权为该客户提交订单申请');
  const sales = resolveSalesOwner(input, actor, directory, commandScope(directory, actor, 'orders'));
  const clean = cleanOrderInput(input);
  return {
    ...(clean as unknown as OrderApplicationInput),
    customerId: customer.id,
    customerName: customer.name || customer.company || customer.id,
    productId: product.id,
    productName: product.name,
    productLevel: product.level,
    amount: listedAmount,
    actualAmount: paidAmount,
    status: '已确认',
    refundStatus: input.refundStatus || '无',
    owner: sales.name,
    salesId: sales.id,
    salesName: sales.name,
    sourceType: customer.leadSource || input.sourceType,
    leadSource: customer.leadSource || input.leadSource,
    leadInputBy: customer.leadInputBy || input.leadInputBy,
    leadContributorId: customer.leadContributorId || input.leadContributorId,
    leadContributorName: customer.leadContributorName || input.leadContributorName,
    resourceOwnership: normalizeResourceOwnership(customer.sourceType || input.resourceOwnership || input.sourceType),
    payments: input.payments,
  };
}

async function validateStoredApplicationSnapshot(
  transaction: Prisma.TransactionClient,
  application: OrderApplication,
  directory: CommandDirectory,
): Promise<void> {
  const customerId = String(application.orderData.customerId || '').trim();
  const productId = String(application.orderData.productId || '').trim();
  const salesId = String(application.orderData.salesId || '').trim();
  const applicantId = String(application.applicantId || '').trim();
  if (!productId) throw new OrderApprovalError(409, '待审申请缺少产品稳定ID，请退回销售重新提交');
  if (!salesId) throw new OrderApprovalError(409, '待审申请缺少销售稳定ID，请退回销售重新提交');
  if (!applicantId) throw new OrderApprovalError(409, '待审申请缺少申请人稳定ID，请退回销售重新提交');

  const [customer, productRow] = await Promise.all([
    requireActiveOrderApplicationCustomer(transaction, customerId, '待审申请关联客户不存在或已删除'),
    transaction.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.PRODUCTS, recordId: productId } },
    }),
  ]);
  if (!productRow) throw new OrderApprovalError(409, '待审申请关联产品不存在，请退回销售处理');
  const product = parseJsonObject<Product>(productRow.data, '产品');
  if (product.id !== productId || product.isActive === false) {
    throw new OrderApprovalError(409, '待审申请关联产品不存在或已停用');
  }
  const customerNames = [customer.name, customer.company].map((name) => String(name || '').trim()).filter(Boolean);
  if (!customerNames.includes(String(application.orderData.customerName || '').trim())) {
    throw new OrderApprovalError(409, '待审申请客户名称与客户稳定ID不一致，请退回销售处理');
  }
  if (application.orderData.productName !== product.name || application.orderData.productLevel !== product.level) {
    throw new OrderApprovalError(409, '待审申请产品名称或等级与产品稳定ID不一致，请退回销售处理');
  }

  const sales = directory.users.find((user) => user.id === salesId && activeDirectoryUser(user));
  if (!sales) throw new OrderApprovalError(409, '待审申请关联销售不存在或已离职');
  if (directory.users.filter((user) => activeDirectoryUser(user) && user.name === sales.name).length !== 1) {
    throw new OrderApprovalError(409, '待审申请关联销售姓名重复，请先修复员工目录');
  }
  if (application.orderData.salesName !== sales.name || application.orderData.owner !== sales.name) {
    throw new OrderApprovalError(409, '待审申请销售归属与销售稳定ID不一致，请退回销售处理');
  }
  const applicant = directory.users.find((user) => user.id === applicantId && activeDirectoryUser(user));
  if (!applicant || applicant.name !== application.applicantName) {
    throw new OrderApprovalError(409, '待审申请申请人与申请人稳定ID不一致');
  }
  if (!Array.isArray(application.orderData.payments)) {
    throw new OrderApprovalError(409, '待审申请付款记录无效');
  }
  if (application.orderData.status !== '已确认') {
    throw new OrderApprovalError(409, '待审申请订单状态无效，请退回销售处理');
  }
  const listedAmount = finiteAmount(application.orderData.amount);
  const paidAmount = finiteAmount(application.orderData.actualAmount);
  if (listedAmount === null || listedAmount <= 0 || paidAmount === null || paidAmount <= 0) {
    throw new OrderApprovalError(409, '待审申请金额无效，请退回销售处理');
  }
}

function buildOrder(
  application: OrderApplication,
  reviewer: AuthenticatedUser,
  approvedAt: string,
): StoredOrder {
  const orderId = deterministicOrderId(application.id);
  const orderNo = deterministicOrderNo(application, approvedAt);
  return {
    ...application.orderData,
    payments: Array.isArray(application.orderData.payments) ? application.orderData.payments : [],
    id: orderId,
    orderNo,
    resourceOwnership: normalizeResourceOwnership(
      application.orderData.resourceOwnership || application.orderData.sourceType,
    ),
    sourceApplicationId: application.id,
    approvalDownstreamEffects: DEFERRED_EFFECTS,
    createdAt: approvedAt,
    updatedAt: approvedAt,
    changeHistory: [{
      id: `hist-${hashSuffix(`${application.id}:create`, 12)}`,
      action: 'create',
      operator: reviewer.name,
      changedAt: approvedAt,
      summary: '订单申请审核入库',
    }],
  };
}

function buildApprovedApplication(
  application: OrderApplication,
  order: Order,
  reviewer: AuthenticatedUser,
  approvedAt: string,
): OrderApplication {
  const approvalLog: OrderApplicationReviewLog = {
    id: `oarl-${hashSuffix(`${application.id}:approve`, 12)}`,
    action: 'approve',
    operatorId: reviewer.id,
    operatorName: reviewer.name,
    createdAt: approvedAt,
  };
  const next: OrderApplication = {
    ...application,
    status: STATUS_APPROVED,
    reviewerId: reviewer.id,
    reviewerName: reviewer.name,
    reviewedAt: approvedAt,
    orderId: order.id,
    orderNo: order.orderNo,
    reviewLogs: [approvalLog, ...(Array.isArray(application.reviewLogs) ? application.reviewLogs : [])],
    updatedAt: approvedAt,
  };
  delete next.reason;
  return next;
}

function amountForOrder(order: Order): number {
  return finiteAmount(order.actualAmount ?? order.amount) || 0;
}

function effectsFromStoredOrder(order: Order): OrderApprovalEffectState {
  return normalizedEffects((order as Partial<StoredOrder>).approvalDownstreamEffects);
}

function prismaCode(error: unknown): unknown {
  return (error as { code?: unknown } | null)?.code;
}

/**
 * Server-side aggregate boundary for approving an order application.
 * The application row is the natural idempotency key; FOR UPDATE serializes
 * concurrent reviewers and the deterministic order ID prevents duplicates.
 */
export function createOrderApplicationService(
  prisma: OrderApplicationPrisma,
  options: OrderApplicationServiceOptions = {},
) {
  const now = options.now || (() => new Date());
  const idFactory = options.idFactory || randomUUID;

  async function submit(
    input: OrderApplicationInput,
    applicant: AuthenticatedUser,
  ): Promise<ApiResponse<OrderApplication | null>> {
    const directory = await loadCommandDirectory(prisma);
    const createdAt = now().toISOString();
    const rawId = String(idFactory() || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48);
    const applicationId = `oa-${rawId || hashSuffix(`${applicant.id}:${createdAt}`)}`;
    const applicationNo = `OAPP-${createdAt.slice(0, 10).replace(/-/g, '')}-${hashSuffix(applicationId, 10).toUpperCase()}`;

    try {
      const created = await prisma.$transaction(async (transaction) => {
        const requestedCustomerId = String(input?.customerId || '').trim();
        if (requestedCustomerId) {
          await lockCustomerAssociationScope(transaction, [requestedCustomerId]);
          await requireActiveOrderApplicationCustomer(transaction, requestedCustomerId);
        }
        const orderData = await canonicalizeOrderApplicationInput(transaction, input, applicant, directory);
        const application: OrderApplication = {
          id: applicationId,
          applicationNo,
          status: STATUS_PENDING_REVIEW,
          orderData,
          applicantId: applicant.id,
          applicantName: applicant.name,
          submittedAt: createdAt,
          reviewLogs: [{
            id: `oarl-${hashSuffix(`${applicationId}:submit`, 12)}`,
            action: 'submit',
            operatorId: applicant.id,
            operatorName: applicant.name,
            createdAt,
          }],
          createdAt,
          updatedAt: createdAt,
        };
        await transaction.businessRecord.create({
          data: {
            id: `${STORAGE_KEYS.ORDER_APPLICATIONS}:${application.id}`,
            domain: STORAGE_KEYS.ORDER_APPLICATIONS,
            recordId: application.id,
            title: application.applicationNo,
            status: application.status,
            owner: application.applicantName,
            customerId: application.orderData.customerId,
            orderId: null,
            amount: amountForOrder(application.orderData as Order),
            eventAt: new Date(createdAt),
            data: application as unknown as Prisma.InputJsonValue,
          },
        });
        return application;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      });
      return success<OrderApplication | null>(created);
    } catch (error) {
      if (error instanceof OrderApprovalError) return failure<OrderApplication>(error.message, error.responseCode);
      if (prismaCode(error) === 'P2002') return failure<OrderApplication>('订单申请编号冲突，请重新提交', 409);
      if (prismaCode(error) === 'P2034') return failure<OrderApplication>('订单申请发生并发冲突，请重试', 409);
      throw error;
    }
  }

  async function resubmit(
    applicationId: string,
    input: OrderApplicationInput,
    applicant: AuthenticatedUser,
  ): Promise<ApiResponse<OrderApplication | null>> {
    const cleanApplicationId = String(applicationId || '').trim();
    if (!cleanApplicationId) return failure<OrderApplication>('订单申请ID不能为空', 400);
    const directory = await loadCommandDirectory(prisma);

    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        const updated = await prisma.$transaction(async (transaction) => {
          const rows = await transaction.$queryRaw<LockedApplicationRow[]>`
            SELECT id, domain, recordId, status, data
            FROM business_records
            WHERE domain = ${STORAGE_KEYS.ORDER_APPLICATIONS}
              AND recordId = ${cleanApplicationId}
            LIMIT 1
            FOR UPDATE
          `;
          const row = rows[0];
          if (!row) throw new OrderApprovalError(404, '订单申请不存在');
          const application = parseJsonObject<OrderApplication>(row.data, '订单申请');
          if (application.id !== cleanApplicationId) throw new OrderApprovalError(409, '订单申请标识与数据库记录不一致');
          if (!application.applicantId || application.applicantId !== applicant.id) {
            throw new OrderApprovalError(403, '只能重新提交自己的订单申请');
          }
          if (application.status !== STATUS_RETURNED) {
            throw new OrderApprovalError(409, '只有退回修改的订单申请可以重新提交');
          }

          await lockCustomerAssociationScope(transaction, [
            application.orderData.customerId,
            String(input?.customerId || '').trim(),
          ]);
          for (const customerId of new Set([
            String(application.orderData.customerId || '').trim(),
            String(input?.customerId || '').trim(),
          ].filter(Boolean))) {
            await requireActiveOrderApplicationCustomer(transaction, customerId);
          }

          const submittedAt = now().toISOString();
          const orderData = await canonicalizeOrderApplicationInput(transaction, input, applicant, directory);
          const next: OrderApplication = {
            ...application,
            status: STATUS_PENDING_REVIEW,
            orderData,
            applicantId: applicant.id,
            applicantName: applicant.name,
            submittedAt,
            reviewLogs: [{
              id: `oarl-${hashSuffix(`${application.id}:resubmit:${submittedAt}`, 12)}`,
              action: 'resubmit',
              operatorId: applicant.id,
              operatorName: applicant.name,
              createdAt: submittedAt,
            }, ...(Array.isArray(application.reviewLogs) ? application.reviewLogs : [])],
            updatedAt: submittedAt,
          };
          delete next.reason;
          delete next.reviewerId;
          delete next.reviewerName;
          delete next.reviewedAt;
          delete next.orderId;
          delete next.orderNo;
          await transaction.businessRecord.update({
            where: { domain_recordId: { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: cleanApplicationId } },
            data: {
              title: next.applicationNo,
              status: next.status,
              owner: next.applicantName,
              customerId: next.orderData.customerId,
              orderId: null,
              amount: amountForOrder(next.orderData as Order),
              eventAt: new Date(submittedAt),
              data: next as unknown as Prisma.InputJsonValue,
            },
          });
          return next;
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 10_000,
        });
        return success<OrderApplication | null>(updated);
      } catch (error) {
        if (error instanceof OrderApprovalError) return failure<OrderApplication>(error.message, error.responseCode);
        if (prismaCode(error) === 'P2034' && attempt < MAX_TRANSACTION_ATTEMPTS) continue;
        if (prismaCode(error) === 'P2034') return failure<OrderApplication>('重新提交发生并发冲突，请刷新后重试', 409);
        throw error;
      }
    }
    return failure<OrderApplication>('重新提交发生并发冲突，请刷新后重试', 409);
  }

  async function reviewTransition(
    applicationId: string,
    reason: string,
    reviewer: AuthenticatedUser,
    action: 'return' | 'reject',
  ): Promise<ApiResponse<OrderApplication | null>> {
    const cleanApplicationId = String(applicationId || '').trim();
    const cleanReason = String(reason || '').trim();
    if (!cleanApplicationId) return failure<OrderApplication>('订单申请ID不能为空', 400);
    if (!cleanReason) return failure<OrderApplication>(action === 'return' ? '退回原因不能为空' : '驳回原因不能为空', 400);
    const scope = await loadApplicationScope(prisma, reviewer);

    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        const updated = await prisma.$transaction(async (transaction) => {
          const rows = await transaction.$queryRaw<LockedApplicationRow[]>`
            SELECT id, domain, recordId, status, data
            FROM business_records
            WHERE domain = ${STORAGE_KEYS.ORDER_APPLICATIONS}
              AND recordId = ${cleanApplicationId}
            LIMIT 1
            FOR UPDATE
          `;
          const row = rows[0];
          if (!row) throw new OrderApprovalError(404, '订单申请不存在');
          const application = parseJsonObject<OrderApplication>(row.data, '订单申请');
          if (application.id !== cleanApplicationId) throw new OrderApprovalError(409, '订单申请标识与数据库记录不一致');
          if (!applicationIsVisible(application, scope)) throw new OrderApprovalError(403, '无权操作该订单申请');
          if (application.status !== STATUS_PENDING_REVIEW) {
            throw new OrderApprovalError(409, action === 'return'
              ? '只有待财务审核的订单申请可以退回'
              : '只有待财务审核的订单申请可以驳回');
          }

          await lockCustomerAssociationScope(transaction, [application.orderData.customerId]);
          await requireActiveOrderApplicationCustomer(transaction, application.orderData.customerId);

          const reviewedAt = now().toISOString();
          const next: OrderApplication = {
            ...application,
            status: action === 'return' ? STATUS_RETURNED : STATUS_REJECTED,
            reviewerId: reviewer.id,
            reviewerName: reviewer.name,
            reviewedAt,
            reason: cleanReason,
            reviewLogs: [{
              id: `oarl-${hashSuffix(`${application.id}:${action}:${reviewedAt}`, 12)}`,
              action,
              operatorId: reviewer.id,
              operatorName: reviewer.name,
              reason: cleanReason,
              createdAt: reviewedAt,
            }, ...(Array.isArray(application.reviewLogs) ? application.reviewLogs : [])],
            updatedAt: reviewedAt,
          };
          await transaction.businessRecord.update({
            where: { domain_recordId: { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: cleanApplicationId } },
            data: {
              title: next.applicationNo,
              status: next.status,
              owner: next.applicantName,
              customerId: next.orderData.customerId,
              orderId: next.orderId || null,
              amount: amountForOrder(next.orderData as Order),
              eventAt: new Date(reviewedAt),
              data: next as unknown as Prisma.InputJsonValue,
            },
          });
          return next;
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 10_000,
        });
        return success<OrderApplication | null>(updated);
      } catch (error) {
        if (error instanceof OrderApprovalError) return failure<OrderApplication>(error.message, error.responseCode);
        if (prismaCode(error) === 'P2034' && attempt < MAX_TRANSACTION_ATTEMPTS) continue;
        if (prismaCode(error) === 'P2034') return failure<OrderApplication>('订单审核发生并发冲突，请刷新后重试', 409);
        throw error;
      }
    }
    return failure<OrderApplication>('订单审核发生并发冲突，请刷新后重试', 409);
  }

  return {
    submit,
    resubmit,
    returnApplication(applicationId: string, reason: string, reviewer: AuthenticatedUser) {
      return reviewTransition(applicationId, reason, reviewer, 'return');
    },
    reject(applicationId: string, reason: string, reviewer: AuthenticatedUser) {
      return reviewTransition(applicationId, reason, reviewer, 'reject');
    },
    async approve(
      applicationId: string,
      reviewer: AuthenticatedUser,
    ): Promise<ApiResponse<OrderApprovalResult | null>> {
      const cleanApplicationId = String(applicationId || '').trim();
      if (!cleanApplicationId) return failure<OrderApprovalResult>('订单申请ID不能为空', 400);
      const directory = await loadCommandDirectory(prisma);
      const scope = commandScope(directory, reviewer, 'orderApplications');

      for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
        try {
          const result = await prisma.$transaction(async (transaction) => {
            const rows = await transaction.$queryRaw<LockedApplicationRow[]>`
              SELECT id, domain, recordId, status, data
              FROM business_records
              WHERE domain = ${STORAGE_KEYS.ORDER_APPLICATIONS}
                AND recordId = ${cleanApplicationId}
              LIMIT 1
              FOR UPDATE
            `;
            const row = rows[0];
            if (!row) throw new OrderApprovalError(404, '订单申请不存在');

            const application = parseJsonObject<OrderApplication>(row.data, '订单申请');
            if (!applicationIsVisible(application, scope)) {
              throw new OrderApprovalError(403, '无权操作该订单申请');
            }

            await lockCustomerAssociationScope(transaction, [application.orderData.customerId]);
            await requireActiveOrderApplicationCustomer(transaction, application.orderData.customerId);

            if (application.status === STATUS_APPROVED) {
              if (!application.orderId || !application.orderNo) {
                throw new OrderApprovalError(409, '已入库申请缺少正式订单关联');
              }
              const storedOrder = await transaction.businessRecord.findUnique({
                where: {
                  domain_recordId: {
                    domain: STORAGE_KEYS.ORDERS,
                    recordId: application.orderId,
                  },
                },
              });
              if (!storedOrder) {
                throw new OrderApprovalError(409, '已入库申请对应的正式订单不存在');
              }
              const order = parseJsonObject<Order>(storedOrder.data, '正式订单');
              return {
                application,
                order,
                replayed: true,
                downstreamEffects: effectsFromStoredOrder(order),
              } satisfies OrderApprovalResult;
            }

            if (application.status !== STATUS_PENDING_REVIEW) {
              throw new OrderApprovalError(409, '只有待财务审核的订单申请可以入库');
            }
            validatePendingApplication(cleanApplicationId, application);
            await validateStoredApplicationSnapshot(transaction, application, directory);

            const approvedAt = now().toISOString();
            let order = buildOrder(application, reviewer, approvedAt);
            const existingOrder = await transaction.businessRecord.findUnique({
              where: {
                domain_recordId: {
                  domain: STORAGE_KEYS.ORDERS,
                  recordId: order.id,
                },
              },
            });
            if (existingOrder) {
              throw new OrderApprovalError(409, '订单申请对应的确定性订单ID已被占用');
            }

            await transaction.businessRecord.create({
              data: {
                id: `${STORAGE_KEYS.ORDERS}:${order.id}`,
                domain: STORAGE_KEYS.ORDERS,
                recordId: order.id,
                title: order.customerName || order.orderNo,
                status: order.status || null,
                owner: order.salesName || order.owner || null,
                customerId: order.customerId || null,
                orderId: order.id,
                amount: amountForOrder(order),
                eventAt: new Date(approvedAt),
                data: order as unknown as Prisma.InputJsonValue,
              },
            });

            if (options.applyDownstreamEffects) {
              const applied = await options.applyDownstreamEffects({
                transaction,
                application,
                order,
                reviewer,
                approvedAt,
              });
              const downstreamEffects = normalizedEffects(applied || undefined);
              order = { ...order, approvalDownstreamEffects: downstreamEffects };
              await transaction.businessRecord.update({
                where: {
                  domain_recordId: {
                    domain: STORAGE_KEYS.ORDERS,
                    recordId: order.id,
                  },
                },
                data: {
                  data: order as unknown as Prisma.InputJsonValue,
                },
              });
            }

            const approvedApplication = buildApprovedApplication(application, order, reviewer, approvedAt);
            await transaction.businessRecord.update({
              where: {
                domain_recordId: {
                  domain: STORAGE_KEYS.ORDER_APPLICATIONS,
                  recordId: cleanApplicationId,
                },
              },
              data: {
                title: approvedApplication.applicationNo,
                status: approvedApplication.status,
                owner: approvedApplication.applicantName || null,
                customerId: approvedApplication.orderData.customerId || null,
                orderId: order.id,
                amount: amountForOrder(order),
                eventAt: new Date(approvedAt),
                data: approvedApplication as unknown as Prisma.InputJsonValue,
              },
            });

            return {
              application: approvedApplication,
              order,
              replayed: false,
              downstreamEffects: order.approvalDownstreamEffects,
            } satisfies OrderApprovalResult;
          }, {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 5_000,
            timeout: 10_000,
          });
          return success<OrderApprovalResult | null>(result);
        } catch (error) {
          if (error instanceof OrderApprovalError) {
            return failure<OrderApprovalResult>(error.message, error.responseCode);
          }
          const customerConflict = customerWriteConflictResponse<OrderApprovalResult>(error);
          if (customerConflict) return customerConflict;
          if (prismaCode(error) === 'P2034') {
            if (attempt < MAX_TRANSACTION_ATTEMPTS) continue;
            return failure<OrderApprovalResult>('订单审核发生并发冲突，请刷新后重试', 409);
          }
          if (prismaCode(error) === 'P2002') {
            return failure<OrderApprovalResult>('订单审核幂等键冲突，请刷新后重试', 409);
          }
          throw error;
        }
      }

      return failure<OrderApprovalResult>('订单审核发生并发冲突，请刷新后重试', 409);
    },
  };
}
