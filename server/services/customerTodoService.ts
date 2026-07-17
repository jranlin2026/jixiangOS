import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer, CustomerActivityRecord } from '../../src/types/customer';
import type { CustomerTodo, CustomerTodoExecutionMethod, CustomerTodoInput } from '../../src/types/customerTodo';
import {
  assertCanManageCustomer,
  assertCustomerActionPermission,
  canReadCustomer,
  loadCustomerAccessContext,
  type CustomerAccessContext,
} from './customerAccessPolicy';
import {
  createCustomerBusinessRecordRepository,
  type CustomerRecordSnapshot,
} from './customerBusinessRecordRepository';
import { customerWriteConflictResponse } from './customerWriteConflict';

type CustomerTodoPrisma = Pick<
  PrismaClient,
  '$transaction' | '$queryRaw' | 'businessRecord' | 'customerTodo' | 'department' | 'role' | 'user'
>;

type CustomerTodoServiceOptions = {
  now?: () => Date;
  createId?: () => string;
};

type LoadedCustomer =
  | { ok: false; error: ApiResponse<Customer | null> }
  | { ok: true; snapshot: CustomerRecordSnapshot; context: CustomerAccessContext };

const METHODS = new Set<CustomerTodoExecutionMethod>(['none', 'phone', 'wechat', 'visit', 'sms', 'email']);

function clean(value: unknown) {
  return String(value || '').trim();
}

function mapTodo(row: any): CustomerTodo {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName,
    title: row.title,
    content: row.content || undefined,
    status: String(row.status).toLowerCase() as CustomerTodo['status'],
    dueAt: row.dueAt.toISOString(),
    executionMethod: row.executionMethod as CustomerTodoExecutionMethod,
    assigneeId: row.assigneeId,
    assigneeName: row.assigneeName,
    createdById: row.createdById,
    createdByName: row.createdByName,
    completedAt: row.completedAt?.toISOString(),
    completedById: row.completedById || undefined,
    completedByName: row.completedByName || undefined,
    canceledAt: row.canceledAt?.toISOString(),
    canceledById: row.canceledById || undefined,
    canceledByName: row.canceledByName || undefined,
    cancelReason: row.cancelReason || undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function validateInput(input: Partial<CustomerTodoInput>) {
  const title = clean(input.title);
  if (!title) return '待办标题不能为空';
  if (title.length > 120) return '待办标题不能超过120个字符';
  if (clean(input.content).length > 2000) return '待办内容不能超过2000个字符';
  if (!input.dueAt || Number.isNaN(new Date(input.dueAt).getTime())) return '请选择有效的提醒时间';
  if (!input.assigneeId) return '请选择执行人';
  if (!METHODS.has(input.executionMethod || 'none')) return '执行方式无效';
  return '';
}

function authorizationError(operation: () => void): string | null {
  try {
    operation();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : '无权操作该客户';
  }
}

function authorizeTodoMutation(context: CustomerAccessContext, customer: Customer): string | null {
  return authorizationError(() => {
    assertCustomerActionPermission(context, 'add_todo');
    assertCanManageCustomer(context, customer);
  });
}

export function createCustomerTodoService(
  prisma: CustomerTodoPrisma,
  options: CustomerTodoServiceOptions = {},
) {
  const now = () => options.now?.() || new Date();
  const createId = () => options.createId?.() || `todo-${randomUUID()}`;
  const runMutation = async <T>(
    operation: (tx: Prisma.TransactionClient) => Promise<ApiResponse<T | null>>,
  ): Promise<ApiResponse<T | null>> => {
    try {
      return await prisma.$transaction((rawTx) => operation(rawTx as Prisma.TransactionClient));
    } catch (error) {
      const conflict = customerWriteConflictResponse<T>(error);
      if (conflict) return conflict;
      throw error;
    }
  };

  const loadReadableCustomer = async (
    client: CustomerTodoPrisma | Prisma.TransactionClient,
    customerId: string,
    user: AuthenticatedUser,
  ): Promise<LoadedCustomer> => {
    const snapshot = await createCustomerBusinessRecordRepository(client).findById(customerId);
    if (!snapshot || snapshot.customer.deletedAt) {
      return { ok: false, error: failure<Customer>('客户不存在或无权访问', 404) };
    }
    const context = await loadCustomerAccessContext(client, user);
    if (!canReadCustomer(context, snapshot.customer)) {
      return { ok: false, error: failure<Customer>('客户不存在或无权访问', 404) };
    }
    return { ok: true, snapshot, context };
  };

  const loadLockedCustomer = async (
    tx: Prisma.TransactionClient,
    customerId: string,
    user: AuthenticatedUser,
  ): Promise<LoadedCustomer> => {
    const snapshot = await createCustomerBusinessRecordRepository(tx).lockById(customerId);
    if (!snapshot || snapshot.customer.deletedAt) {
      return { ok: false, error: failure<Customer>('客户不存在或无权访问', 404) };
    }
    const context = await loadCustomerAccessContext(tx, user);
    return { ok: true, snapshot, context };
  };

  const appendActivity = async (
    tx: Prisma.TransactionClient,
    snapshot: CustomerRecordSnapshot,
    todoId: string,
    title: string,
    content: string,
    actor: string,
    at: Date,
  ) => {
    const activity: CustomerActivityRecord = {
      id: `activity-${randomUUID()}`,
      type: 'todo',
      title,
      content,
      operator: actor,
      createdAt: at.toISOString(),
      relatedId: todoId,
      relatedType: 'todo',
    };
    const updated: Customer = {
      ...snapshot.customer,
      activityRecords: [activity, ...(snapshot.customer.activityRecords || [])],
      updatedAt: at.toISOString(),
    };
    await createCustomerBusinessRecordRepository(tx).compareAndSave(snapshot, updated, at);
  };

  return {
    async listMine(user: AuthenticatedUser) {
      const rows = await prisma.customerTodo.findMany({
        where: { assigneeId: user.id, status: 'PENDING' },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      });
      const customerIds = [...new Set(rows.map((row) => row.customerId))];
      const context = await loadCustomerAccessContext(prisma, user);
      const visibility = await Promise.all(customerIds.map(async (customerId) => {
        const snapshot = await createCustomerBusinessRecordRepository(prisma).findById(customerId);
        return {
          customerId,
          visible: Boolean(snapshot && canReadCustomer(context, snapshot.customer)),
        };
      }));
      const visibleCustomerIds = new Set(visibility.filter((item) => item.visible).map((item) => item.customerId));
      return success(rows.filter((row) => visibleCustomerIds.has(row.customerId)).map(mapTodo));
    },

    async list(customerId: string, user: AuthenticatedUser) {
      const customer = await loadReadableCustomer(prisma, customerId, user);
      if (!customer.ok) {
        return failure<CustomerTodo[]>(customer.error.message, customer.error.code);
      }
      const rows = await prisma.customerTodo.findMany({
        where: { customerId, status: { not: 'CANCELED' } },
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      });
      return success(rows.map(mapTodo));
    },

    async create(customerId: string, input: CustomerTodoInput, user: AuthenticatedUser) {
      const error = validateInput(input);
      if (error) return failure<CustomerTodo>(error, 400);
      return runMutation(async (tx) => {
        const customer = await loadLockedCustomer(tx, customerId, user);
        if (!customer.ok) return failure<CustomerTodo>(customer.error.message, customer.error.code);
        const denied = authorizeTodoMutation(customer.context, customer.snapshot.customer);
        if (denied) return failure<CustomerTodo>(denied, 403);
        const assignee = await tx.user.findUnique({ where: { id: input.assigneeId } });
        if (!assignee || !assignee.isActive || assignee.employmentStatus !== 'active') {
          return failure<CustomerTodo>('执行人不存在或已离职', 400);
        }
        const at = now();
        const actorName = user.name || user.account;
        const created = await tx.customerTodo.create({ data: {
          id: createId(), customerId, customerName: customer.snapshot.customer.name,
          title: clean(input.title), content: clean(input.content) || null,
          dueAt: new Date(input.dueAt), executionMethod: input.executionMethod || 'none',
          assigneeId: assignee.id, assigneeName: assignee.name,
          createdById: user.id, createdByName: actorName,
        } });
        await appendActivity(
          tx,
          customer.snapshot,
          created.id,
          '新建了客户待办',
          `${created.title} · 执行人：${created.assigneeName}`,
          actorName,
          at,
        );
        return success(mapTodo(created));
      });
    },

    async update(customerId: string, todoId: string, input: CustomerTodoInput, user: AuthenticatedUser) {
      const error = validateInput(input);
      if (error) return failure<CustomerTodo>(error, 400);
      return runMutation(async (tx) => {
        const customer = await loadLockedCustomer(tx, customerId, user);
        if (!customer.ok) return failure<CustomerTodo>(customer.error.message, customer.error.code);
        const denied = authorizeTodoMutation(customer.context, customer.snapshot.customer);
        if (denied) return failure<CustomerTodo>(denied, 403);
        const existing = await tx.customerTodo.findFirst({ where: { id: todoId, customerId } });
        if (!existing) return failure<CustomerTodo>('待办不存在', 404);
        if (existing.status !== 'PENDING') return failure<CustomerTodo>('仅未完成待办可以编辑', 409);
        const assignee = await tx.user.findUnique({ where: { id: input.assigneeId } });
        if (!assignee || !assignee.isActive || assignee.employmentStatus !== 'active') {
          return failure<CustomerTodo>('执行人不存在或已离职', 400);
        }
        const at = now();
        const actorName = user.name || user.account;
        const updated = await tx.customerTodo.update({ where: { id: todoId }, data: {
          title: clean(input.title), content: clean(input.content) || null, dueAt: new Date(input.dueAt),
          executionMethod: input.executionMethod || 'none', assigneeId: assignee.id, assigneeName: assignee.name,
        } });
        await appendActivity(
          tx,
          customer.snapshot,
          todoId,
          '更新了客户待办',
          `${updated.title} · 执行人：${updated.assigneeName}`,
          actorName,
          at,
        );
        return success(mapTodo(updated));
      });
    },

    async complete(customerId: string, todoId: string, user: AuthenticatedUser) {
      return runMutation(async (tx) => {
        const customer = await loadLockedCustomer(tx, customerId, user);
        if (!customer.ok) return failure<CustomerTodo>(customer.error.message, customer.error.code);
        const existing = await tx.customerTodo.findFirst({ where: { id: todoId, customerId } });
        if (!existing) return failure<CustomerTodo>('待办不存在', 404);
        if (existing.status !== 'PENDING') return failure<CustomerTodo>('待办当前状态不能完成', 409);
        const canCompleteOwnTodo = existing.assigneeId === user.id
          && canReadCustomer(customer.context, customer.snapshot.customer);
        if (!canCompleteOwnTodo) {
          const denied = authorizeTodoMutation(customer.context, customer.snapshot.customer);
          if (denied) return failure<CustomerTodo>('仅执行人或有客户待办权限的人员可以完成待办', 403);
        }
        const at = now();
        const actorName = user.name || user.account;
        const updated = await tx.customerTodo.update({
          where: { id: todoId },
          data: {
            status: 'COMPLETED',
            completedAt: at,
            completedById: user.id,
            completedByName: actorName,
          },
        });
        await appendActivity(tx, customer.snapshot, todoId, '完成了客户待办', updated.title, actorName, at);
        return success(mapTodo(updated));
      });
    },

    async reopen(customerId: string, todoId: string, user: AuthenticatedUser) {
      return runMutation(async (tx) => {
        const customer = await loadLockedCustomer(tx, customerId, user);
        if (!customer.ok) return failure<CustomerTodo>(customer.error.message, customer.error.code);
        const denied = authorizeTodoMutation(customer.context, customer.snapshot.customer);
        if (denied) return failure<CustomerTodo>(denied, 403);
        const existing = await tx.customerTodo.findFirst({ where: { id: todoId, customerId } });
        if (!existing) return failure<CustomerTodo>('待办不存在', 404);
        if (existing.status !== 'COMPLETED') return failure<CustomerTodo>('仅已完成待办可以重开', 409);
        const at = now();
        const actorName = user.name || user.account;
        const updated = await tx.customerTodo.update({
          where: { id: todoId },
          data: { status: 'PENDING', completedAt: null, completedById: null, completedByName: null },
        });
        await appendActivity(tx, customer.snapshot, todoId, '重新打开了客户待办', updated.title, actorName, at);
        return success(mapTodo(updated));
      });
    },

    async cancel(customerId: string, todoId: string, reason: string, user: AuthenticatedUser) {
      return runMutation(async (tx) => {
        const customer = await loadLockedCustomer(tx, customerId, user);
        if (!customer.ok) return failure<CustomerTodo>(customer.error.message, customer.error.code);
        const denied = authorizeTodoMutation(customer.context, customer.snapshot.customer);
        if (denied) return failure<CustomerTodo>(denied, 403);
        const existing = await tx.customerTodo.findFirst({ where: { id: todoId, customerId } });
        if (!existing) return failure<CustomerTodo>('待办不存在', 404);
        if (existing.status !== 'PENDING') return failure<CustomerTodo>('仅未完成待办可以取消', 409);
        const at = now();
        const actorName = user.name || user.account;
        const updated = await tx.customerTodo.update({
          where: { id: todoId },
          data: {
            status: 'CANCELED',
            canceledAt: at,
            canceledById: user.id,
            canceledByName: actorName,
            cancelReason: clean(reason) || null,
          },
        });
        await appendActivity(
          tx,
          customer.snapshot,
          todoId,
          '取消了客户待办',
          `${updated.title}${reason ? ` · ${clean(reason)}` : ''}`,
          actorName,
          at,
        );
        return success(mapTodo(updated));
      });
    },
  };
}
