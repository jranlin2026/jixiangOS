import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer, CustomerActivityRecord } from '../../src/types/customer';
import type { CustomerTodo, CustomerTodoExecutionMethod, CustomerTodoInput } from '../../src/types/customerTodo';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';

type CustomerTodoPrisma = Pick<PrismaClient, '$transaction' | 'customerTodo' | 'user'>;
type VisibleCustomerResolver = (customerId: string, user: AuthenticatedUser) => Promise<ApiResponse<Customer | null>>;

const METHODS = new Set<CustomerTodoExecutionMethod>(['none', 'phone', 'wechat', 'visit', 'sms', 'email']);

function clean(value: unknown) {
  return String(value || '').trim();
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

export function createCustomerTodoService(
  prisma: CustomerTodoPrisma,
  getVisibleCustomer: VisibleCustomerResolver,
  options: { now?: () => Date; createId?: () => string } = {},
) {
  const now = () => options.now?.() || new Date();
  const createId = () => options.createId?.() || `todo-${randomUUID()}`;

  const loadCustomer = async (customerId: string, user: AuthenticatedUser, writable = false) => {
    const result = await getVisibleCustomer(customerId, user);
    if (result.code !== 0 || !result.data) return result;
    if (writable && (result.data.lifecycleStatusCode === 'public_pool' || result.data.owner === '公海')) {
      return failure<Customer>('公海客户领取后才能创建或修改待办', 409);
    }
    return result;
  };

  const appendActivity = async (
    tx: Prisma.TransactionClient,
    customerId: string,
    todoId: string,
    title: string,
    content: string,
    actor: string,
    at: Date,
  ) => {
    const row = await tx.businessRecord.findFirst({
      where: { domain: STORAGE_KEYS.CUSTOMERS, customerId },
      select: { id: true, data: true },
    });
    if (!row) return;
    const customer = (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) as unknown as Customer;
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
      ...customer,
      activityRecords: [activity, ...(customer.activityRecords || [])],
      updatedAt: at.toISOString(),
    };
    await tx.businessRecord.update({
      where: { id: row.id },
      data: { data: toJson(updated), eventAt: at },
    });
  };

  const getTodo = async (customerId: string, todoId: string) => prisma.customerTodo.findFirst({
    where: { id: todoId, customerId },
  });

  return {
    async list(customerId: string, user: AuthenticatedUser) {
      const customer = await loadCustomer(customerId, user);
      if (customer.code !== 0) return failure<CustomerTodo[]>(customer.message, customer.code);
      const rows = await prisma.customerTodo.findMany({
        where: { customerId, status: { not: 'CANCELED' } },
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      });
      return success(rows.map(mapTodo));
    },

    async create(customerId: string, input: CustomerTodoInput, user: AuthenticatedUser) {
      const error = validateInput(input);
      if (error) return failure<CustomerTodo>(error, 400);
      const customer = await loadCustomer(customerId, user, true);
      if (customer.code !== 0 || !customer.data) return failure<CustomerTodo>(customer.message, customer.code);
      const assignee = await prisma.user.findUnique({ where: { id: input.assigneeId } });
      if (!assignee || !assignee.isActive || assignee.employmentStatus !== 'active') {
        return failure<CustomerTodo>('执行人不存在或已离职', 400);
      }
      const at = now();
      const actorName = user.name || user.account;
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.customerTodo.create({ data: {
          id: createId(), customerId, customerName: customer.data!.name,
          title: clean(input.title), content: clean(input.content) || null,
          dueAt: new Date(input.dueAt), executionMethod: input.executionMethod || 'none',
          assigneeId: assignee.id, assigneeName: assignee.name,
          createdById: user.id, createdByName: actorName,
        } });
        await appendActivity(tx, customerId, created.id, '新建了客户待办', `${created.title} · 执行人：${created.assigneeName}`, actorName, at);
        return created;
      });
      return success(mapTodo(row));
    },

    async update(customerId: string, todoId: string, input: CustomerTodoInput, user: AuthenticatedUser) {
      const error = validateInput(input);
      if (error) return failure<CustomerTodo>(error, 400);
      const customer = await loadCustomer(customerId, user, true);
      if (customer.code !== 0) return failure<CustomerTodo>(customer.message, customer.code);
      const existing = await getTodo(customerId, todoId);
      if (!existing) return failure<CustomerTodo>('待办不存在', 404);
      if (existing.status !== 'PENDING') return failure<CustomerTodo>('仅未完成待办可以编辑', 409);
      const assignee = await prisma.user.findUnique({ where: { id: input.assigneeId } });
      if (!assignee || !assignee.isActive || assignee.employmentStatus !== 'active') return failure<CustomerTodo>('执行人不存在或已离职', 400);
      const at = now(); const actorName = user.name || user.account;
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.customerTodo.update({ where: { id: todoId }, data: {
          title: clean(input.title), content: clean(input.content) || null, dueAt: new Date(input.dueAt),
          executionMethod: input.executionMethod || 'none', assigneeId: assignee.id, assigneeName: assignee.name,
        } });
        await appendActivity(tx, customerId, todoId, '更新了客户待办', `${updated.title} · 执行人：${updated.assigneeName}`, actorName, at);
        return updated;
      });
      return success(mapTodo(row));
    },

    async complete(customerId: string, todoId: string, user: AuthenticatedUser) {
      const customer = await loadCustomer(customerId, user, true);
      if (customer.code !== 0) return failure<CustomerTodo>(customer.message, customer.code);
      const existing = await getTodo(customerId, todoId);
      if (!existing) return failure<CustomerTodo>('待办不存在', 404);
      if (existing.status !== 'PENDING') return failure<CustomerTodo>('待办当前状态不能完成', 409);
      const at = now(); const actorName = user.name || user.account;
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.customerTodo.update({ where: { id: todoId }, data: { status: 'COMPLETED', completedAt: at, completedById: user.id, completedByName: actorName } });
        await appendActivity(tx, customerId, todoId, '完成了客户待办', updated.title, actorName, at);
        return updated;
      });
      return success(mapTodo(row));
    },

    async reopen(customerId: string, todoId: string, user: AuthenticatedUser) {
      const customer = await loadCustomer(customerId, user, true);
      if (customer.code !== 0) return failure<CustomerTodo>(customer.message, customer.code);
      const existing = await getTodo(customerId, todoId);
      if (!existing) return failure<CustomerTodo>('待办不存在', 404);
      if (existing.status !== 'COMPLETED') return failure<CustomerTodo>('仅已完成待办可以重开', 409);
      const at = now(); const actorName = user.name || user.account;
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.customerTodo.update({ where: { id: todoId }, data: { status: 'PENDING', completedAt: null, completedById: null, completedByName: null } });
        await appendActivity(tx, customerId, todoId, '重新打开了客户待办', updated.title, actorName, at);
        return updated;
      });
      return success(mapTodo(row));
    },

    async cancel(customerId: string, todoId: string, reason: string, user: AuthenticatedUser) {
      const customer = await loadCustomer(customerId, user, true);
      if (customer.code !== 0) return failure<CustomerTodo>(customer.message, customer.code);
      const existing = await getTodo(customerId, todoId);
      if (!existing) return failure<CustomerTodo>('待办不存在', 404);
      if (existing.status !== 'PENDING') return failure<CustomerTodo>('仅未完成待办可以取消', 409);
      const at = now(); const actorName = user.name || user.account;
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.customerTodo.update({ where: { id: todoId }, data: { status: 'CANCELED', canceledAt: at, canceledById: user.id, canceledByName: actorName, cancelReason: clean(reason) || null } });
        await appendActivity(tx, customerId, todoId, '取消了客户待办', `${updated.title}${reason ? ` · ${clean(reason)}` : ''}`, actorName, at);
        return updated;
      });
      return success(mapTodo(row));
    },
  };
}
