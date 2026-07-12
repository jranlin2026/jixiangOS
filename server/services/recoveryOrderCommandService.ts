import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { buildDataVisibilityScopeForUser, type DataVisibilityScope } from '../../src/shared/utils/dataVisibility';
import { PERMISSION_KEYS, hasPermission } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Department } from '../../src/types/department';
import type { RecoveryOrder, RecoveryOrderInput } from '../../src/types/recoveryOrder';
import type { Role } from '../../src/types/role';
import type { User } from '../../src/types/settings';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';

type RecoveryCommandPrisma = Pick<PrismaClient, 'businessRecord' | 'user' | 'role' | 'department' | '$transaction'>;
type Directory = { users: User[]; roles: Role[]; departments: Department[] };
type LockedRow = { id: string; domain: string; recordId: string; data: unknown };

export interface RecoveryOrderCommandServiceOptions {
  now?: () => Date;
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

function amount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
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

function sameCreate(existing: RecoveryOrder, desired: RecoveryOrder): boolean {
  return existing.createdBy === desired.createdBy
    && normalizeOrderNo(existing.thirdPartyOrderNo) === normalizeOrderNo(desired.thirdPartyOrderNo)
    && existing.customerName === desired.customerName
    && existing.originalProduct === desired.originalProduct
    && Number(existing.originalAmount) === Number(desired.originalAmount)
    && Number(existing.recoveryAmount) === Number(desired.recoveryAmount)
    && existing.recoveryUserId === desired.recoveryUserId
    && (existing.assistUserId || '') === (desired.assistUserId || '');
}

function recoveryScope(directory: Directory, actor: AuthenticatedUser): DataVisibilityScope {
  return buildDataVisibilityScopeForUser(
    actor,
    directory.users,
    directory.roles,
    directory.departments,
    'recoveryOrderApplications',
  );
}

function recoveryVisible(order: RecoveryOrder, scope: DataVisibilityScope): boolean {
  if (scope.unrestricted) return true;
  const relation = (id: string | undefined, name: string | undefined) => (
    id ? scope.visibleUserIds.includes(id) : Boolean(name && scope.visibleUserNames.includes(name))
  );
  return relation(order.createdBy, order.createdByName)
    || relation(order.recoveryUserId, order.recoveryUserName)
    || relation(order.assistUserId, order.assistUserName);
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
      eventAt: new Date(order.updatedAt),
      data: jsonValue(order),
    },
  });
}

function validateInput(
  input: RecoveryOrderInput,
  actor: AuthenticatedUser,
  directory: Directory,
  scope: DataVisibilityScope,
): {
  customerName: string;
  thirdPartyOrderNo: string;
  originalProduct: string;
  originalAmount: number;
  recoveryAmount: number;
  recoveryUser: User;
  assistUser?: User;
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RecoveryCommandError(400, '售后挽回订单数据无效');
  }
  const customerName = cleanText(input.customerName);
  const thirdPartyOrderNo = cleanText(input.thirdPartyOrderNo);
  const originalProduct = cleanText(input.originalProduct);
  const recoveryAmount = amount(input.recoveryAmount);
  if (!customerName) throw new RecoveryCommandError(400, '请填写客户姓名');
  if (!thirdPartyOrderNo) throw new RecoveryCommandError(400, '请填写第三方平台订单号');
  if (!originalProduct) throw new RecoveryCommandError(400, '请填写原购买产品');
  if (recoveryAmount <= 0) throw new RecoveryCommandError(400, '挽回成交金额必须大于 0');
  const recoveryUser = directory.users.find((user) => user.id === input.recoveryUserId && activeUser(user));
  if (!recoveryUser) throw new RecoveryCommandError(400, '挽回人员不存在或已停用');
  if (!scope.unrestricted && !scope.visibleUserIds.includes(recoveryUser.id)) {
    throw new RecoveryCommandError(403, '无权为该员工维护售后挽回订单');
  }
  const assistUser = input.assistUserId
    ? directory.users.find((user) => user.id === input.assistUserId && activeUser(user))
    : undefined;
  if (input.assistUserId && !assistUser) throw new RecoveryCommandError(400, '协助人员不存在或已停用');
  if (assistUser && !scope.unrestricted && !scope.visibleUserIds.includes(assistUser.id)) {
    throw new RecoveryCommandError(403, '无权指定该协助人员');
  }
  void actor;
  return {
    customerName,
    thirdPartyOrderNo,
    originalProduct,
    originalAmount: amount(input.originalAmount),
    recoveryAmount,
    recoveryUser,
    assistUser,
  };
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

  return {
    async create(
      input: RecoveryOrderInput,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<RecoveryOrder | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, 'write')) {
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
      if (!thirdPartyOrderNo) return failure('请填写第三方平台订单号', 400);
      if (!originalProduct) return failure('请填写原购买产品', 400);
      if (recoveryAmount <= 0) return failure('挽回成交金额必须大于 0', 400);

      const directory = await loadDirectory(prisma);
      const scope = buildDataVisibilityScopeForUser(
        actor,
        directory.users,
        directory.roles,
        directory.departments,
        'recoveryOrderApplications',
      );
      const recoveryUser = directory.users.find((user) => user.id === input.recoveryUserId && activeUser(user));
      if (!recoveryUser) return failure('挽回人员不存在或已停用', 400);
      if (!scope.unrestricted && !scope.visibleUserIds.includes(recoveryUser.id)) {
        return failure('无权为该员工创建售后挽回订单', 403);
      }
      const assistUser = input.assistUserId
        ? directory.users.find((user) => user.id === input.assistUserId && activeUser(user))
        : undefined;
      if (input.assistUserId && !assistUser) return failure('协助人员不存在或已停用', 400);
      if (assistUser && !scope.unrestricted && !scope.visibleUserIds.includes(assistUser.id)) {
        return failure('无权指定该协助人员', 403);
      }

      const createdAt = now().toISOString();
      const normalizedNo = normalizeOrderNo(thirdPartyOrderNo);
      const id = `recovery-${hash(normalizedNo)}`;
      const next: RecoveryOrder = {
        id,
        recoveryNo: `RCV-${createdAt.slice(0, 10).replace(/-/g, '')}-${hash(normalizedNo, 8).toUpperCase()}`,
        thirdPartyOrderNo,
        customerId: '',
        customerName,
        customerPhone: cleanText(input.customerPhone) || undefined,
        customerWechat: cleanText(input.customerWechat) || undefined,
        customerMatchStatus: '手工填写',
        sourcePlatform: cleanText(input.sourcePlatform) || undefined,
        originalProduct,
        originalAmount: amount(input.originalAmount),
        recoveryAmount,
        paymentVoucher: input.paymentVoucher,
        paymentVoucherName: input.paymentVoucherName,
        paymentVoucherPreview: input.paymentVoucherPreview,
        chatEvidence: input.chatEvidence,
        chatEvidenceName: input.chatEvidenceName,
        chatEvidencePreview: input.chatEvidencePreview,
        recoveryUserId: recoveryUser.id,
        recoveryUserName: recoveryUser.name,
        assistUserId: assistUser?.id,
        assistUserName: assistUser?.name,
        remark: cleanText(input.remark) || undefined,
        status: '待审核',
        settlementStatus: '未分账',
        commissionIds: [],
        createdBy: actor.id,
        createdByName: actor.name,
        createdAt,
        updatedAt: createdAt,
      };

      try {
        const created = await prisma.$transaction(async (transaction) => {
          const rows = await transaction.businessRecord.findMany({
            where: { domain: STORAGE_KEYS.RECOVERY_ORDERS },
          });
          const duplicate = rows
            .map((row) => parseObject<RecoveryOrder>(row.data, '售后挽回订单'))
            .find((order) => normalizeOrderNo(order.thirdPartyOrderNo) === normalizedNo);
          if (duplicate) {
            if (duplicate.id === id && sameCreate(duplicate, next)) return duplicate;
            throw new RecoveryCommandError(409, '该第三方平台订单号已经创建过售后挽回订单');
          }
          await transaction.businessRecord.create({
            data: {
              id: `${STORAGE_KEYS.RECOVERY_ORDERS}:${id}`,
              domain: STORAGE_KEYS.RECOVERY_ORDERS,
              recordId: id,
              title: next.customerName,
              status: next.status,
              owner: next.recoveryUserName,
              customerId: null,
              orderId: null,
              amount: next.recoveryAmount,
              eventAt: new Date(createdAt),
              data: jsonValue(next),
            },
          });
          return next;
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 10_000,
        });
        return success(created);
      } catch (error) {
        if (error instanceof RecoveryCommandError) return failure(error.message, error.responseCode);
        if ((error as { code?: unknown } | null)?.code === 'P2002') {
          const concurrent = await prisma.businessRecord.findUnique({
            where: { domain_recordId: { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: id } },
          });
          if (concurrent) {
            const existing = parseObject<RecoveryOrder>(concurrent.data, '售后挽回订单');
            if (sameCreate(existing, next)) return success(existing);
          }
          return failure('该第三方平台订单号已经创建过售后挽回订单', 409);
        }
        throw error;
      }
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
        if (!recoveryVisible(current, scope)) throw new RecoveryCommandError(403, '无权编辑该售后挽回订单');
        if (current.deletedAt) throw new RecoveryCommandError(409, '已删除售后挽回订单不能编辑');
        if (!canEdit && !(canCreate && current.status === '退回修改' && current.createdBy === actor.id)) {
          throw new RecoveryCommandError(403, '只有创建人可以重新提交退回修改的挽回单');
        }
        if (['待确认', '待发放', '已撤回'].includes(current.settlementStatus || '未分账') || current.status === '已分账') {
          throw new RecoveryCommandError(409, '已进入分账链路的售后挽回订单不能修改');
        }
        const validated = validateInput(input, actor, directory, scope);
        const rows = await transaction.businessRecord.findMany({ where: { domain: STORAGE_KEYS.RECOVERY_ORDERS } });
        const duplicate = rows
          .map((row) => parseObject<RecoveryOrder>(row.data, '售后挽回订单'))
          .find((order) => order.id !== current.id && normalizeOrderNo(order.thirdPartyOrderNo) === normalizeOrderNo(validated.thirdPartyOrderNo));
        if (duplicate) throw new RecoveryCommandError(409, '该第三方平台订单号已经创建过售后挽回订单');
        const changedAt = now().toISOString();
        const resubmitted = current.status === '退回修改' || current.status === '审核驳回';
        const next: RecoveryOrder = {
          ...current,
          customerName: validated.customerName,
          customerPhone: cleanText(input.customerPhone) || undefined,
          customerWechat: cleanText(input.customerWechat) || undefined,
          thirdPartyOrderNo: validated.thirdPartyOrderNo,
          sourcePlatform: cleanText(input.sourcePlatform) || undefined,
          originalProduct: validated.originalProduct,
          originalAmount: validated.originalAmount,
          recoveryAmount: validated.recoveryAmount,
          paymentVoucher: input.paymentVoucher,
          paymentVoucherName: input.paymentVoucherName,
          paymentVoucherPreview: input.paymentVoucherPreview,
          chatEvidence: input.chatEvidence,
          chatEvidenceName: input.chatEvidenceName,
          chatEvidencePreview: input.chatEvidencePreview,
          recoveryUserId: validated.recoveryUser.id,
          recoveryUserName: validated.recoveryUser.name,
          assistUserId: validated.assistUser?.id,
          assistUserName: validated.assistUser?.name,
          remark: cleanText(input.remark) || undefined,
          status: resubmitted ? '待审核' : current.status,
          settlementStatus: resubmitted ? '未分账' : current.settlementStatus,
          auditReason: resubmitted ? undefined : current.auditReason,
          auditorId: resubmitted ? undefined : current.auditorId,
          auditorName: resubmitted ? undefined : current.auditorName,
          auditedAt: resubmitted ? undefined : current.auditedAt,
          updatedAt: changedAt,
        };
        await writeRecoveryOrder(transaction, next);
        return next;
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

    async softDelete(orderId: string, reason: string, actor: AuthenticatedUser): Promise<ApiResponse<RecoveryOrder | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE, 'delete')) {
        return failure('无权删除售后挽回订单', 403);
      }
      const directory = await loadDirectory(prisma);
      const scope = recoveryScope(directory, actor);
      return run(() => prisma.$transaction(async (transaction) => {
        const current = await lockRecoveryOrder(transaction, orderId);
        if (!recoveryVisible(current, scope)) throw new RecoveryCommandError(403, '无权删除该售后挽回订单');
        if (current.deletedAt) return current;
        if ((current.commissionIds || []).length || ['待确认', '待发放', '已撤回'].includes(current.settlementStatus || '未分账')) {
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
        await writeRecoveryOrder(transaction, next);
        return next;
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
    if (!hasPermission(actor, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, 'write')) {
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
      if (action === 'approve' && ['待分账', '已分账'].includes(current.status)) return current;
      if (action === 'return' && current.status === '退回修改' && current.auditReason === normalizedReason) return current;
      if (action === 'reject' && current.status === '审核驳回' && current.auditReason === normalizedReason) return current;
      if (current.status !== '待审核') throw new RecoveryCommandError(409, '只有待审核售后挽回订单可以执行该操作');
      const changedAt = now().toISOString();
      const next: RecoveryOrder = {
        ...current,
        status: action === 'approve' ? '待分账' : action === 'return' ? '退回修改' : '审核驳回',
        settlementStatus: action === 'approve' ? '待处理' : '未分账',
        auditorId: actor.id,
        auditorName: actor.name,
        auditedAt: changedAt,
        auditReason: action === 'approve' ? `审核通过：${actor.name}` : normalizedReason,
        updatedAt: changedAt,
      };
      await writeRecoveryOrder(transaction, next);
      return next;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 10_000,
    }));
  }
}
