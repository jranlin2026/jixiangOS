import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { buildDataVisibilityScopeForUser, type DataVisibilityScope } from '../../src/shared/utils/dataVisibility';
import { PERMISSION_KEYS, hasPermission } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  Delivery,
  DeliveryAttachment,
  DeliveryException,
  DeliveryMaterialItem,
  DeliveryPriority,
  DeliveryTask,
} from '../../src/types/delivery';
import type { Order } from '../../src/types/order';
import type { Product } from '../../src/types/product';
import type { Department } from '../../src/types/department';
import type { Role } from '../../src/types/role';
import type { User } from '../../src/types/settings';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import { resolveLatestCompletedDeliveryStage, resolveProductDeliveryStages } from '../../src/shared/utils/deliveryStages';
import { lockCustomerAssociationScope } from './customerAssociationRegistry';

type DeliveryCommandPrisma = Pick<PrismaClient, 'businessRecord' | 'user' | 'role' | 'department' | '$transaction'>;
type LockedRow = { id: string; domain: string; recordId: string; data: unknown };
type Directory = { users: User[]; roles: Role[]; departments: Department[] };

export interface DeliveryCommandServiceOptions {
  now?: () => Date;
  assigner?: {
    assignNext(transaction: Prisma.TransactionClient, assignedAt: string): Promise<{
      ownerId: string; owner: string; assignmentMode: 'auto'; assignedAt: string; assignedBy: 'system';
    } | null | undefined>;
  };
}

export interface DeliveryCardPatch {
  ownerId?: string;
  owner?: string;
  priority?: DeliveryPriority;
  plannedCompletedAt?: string;
  notes?: string;
  materialItems?: DeliveryMaterialItem[];
}

export interface DeliveryExceptionInput {
  type: DeliveryException['type'];
  description: string;
  needsSupervisor?: boolean;
}

class DeliveryCommandError extends Error {
  constructor(readonly responseCode: number, message: string) {
    super(message);
    this.name = 'DeliveryCommandError';
  }
}

const MAX_TRANSACTION_ATTEMPTS = 3;
const CARD_FIELDS = new Set(['ownerId', 'owner', 'priority', 'plannedCompletedAt', 'notes', 'materialItems']);

function parseObject<T extends object>(value: unknown, label: string): T {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
    return parsed as T;
  } catch {
    throw new DeliveryCommandError(409, `${label}数据损坏，请先修复数据`);
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function hash(value: string, length = 16): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function cleanAttachmentName(value: unknown): string {
  return String(value || '').trim();
}

function prismaCode(error: unknown): unknown {
  return (error as { code?: unknown } | null)?.code;
}

function activeUser(user: User): boolean {
  return user.isActive && (user.employmentStatus || 'active') === 'active';
}

async function loadDirectory(prisma: DeliveryCommandPrisma): Promise<Directory> {
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

function deliveryScope(directory: Directory, actor: AuthenticatedUser): DataVisibilityScope {
  return buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'deliveries');
}

function relationVisible(
  order: Order,
  delivery: Delivery | undefined,
  scope: DataVisibilityScope,
): boolean {
  if (scope.unrestricted) return true;
  const relation = (id: string | undefined, names: Array<string | undefined>) => (
    id
      ? scope.visibleUserIds.includes(id)
      : names.some((name) => Boolean(name && scope.visibleUserNames.includes(name)))
  );
  return relation(order.salesId, [order.salesName, order.owner])
    || relation(order.successId, [order.successName])
    || relation(order.serviceId, [order.serviceName])
    || relation(delivery?.ownerId, [delivery?.owner])
    || relation(delivery?.salesOwnerId, [delivery?.salesOwner]);
}

function assertMutationPermission(actor: AuthenticatedUser): void {
  if (
    !hasPermission(actor, PERMISSION_KEYS.DELIVERY_MOVE_CARD, 'write')
    && !hasPermission(actor, PERMISSION_KEYS.DELIVERY_STAGE_CONFIG, 'write')
  ) {
    throw new DeliveryCommandError(403, '无权修改交付单');
  }
}

async function lockRecord<T extends object>(
  transaction: Prisma.TransactionClient,
  domain: string,
  recordId: string,
  label: string,
): Promise<T> {
  const rows = await transaction.$queryRaw<LockedRow[]>`
    SELECT id, domain, recordId, data
    FROM business_records
    WHERE domain = ${domain}
      AND recordId = ${recordId}
    LIMIT 1
    FOR UPDATE
  `;
  if (!rows[0]) throw new DeliveryCommandError(404, `${label}不存在`);
  const record = parseObject<T>(rows[0].data, label);
  if (String((record as { id?: string }).id || '') !== recordId) {
    throw new DeliveryCommandError(409, `${label}标识与数据库记录不一致`);
  }
  return record;
}

function taskProgress(tasks: DeliveryTask[]): number {
  if (!tasks.length) return 0;
  return Math.round(tasks.filter((task) => task.status === '已完成' || Boolean(task.completedAt)).length / tasks.length * 100);
}

function openException(delivery: Delivery): boolean {
  return (delivery.exceptions || []).some((item) => item.status !== '已解除');
}

function deriveStatus(delivery: Delivery): NonNullable<Delivery['status']> {
  if (openException(delivery) || delivery.blockedReason) return '阻塞';
  if (delivery.approvalStatus === '已确认' || delivery.actualCompletedAt) return '已完成';
  if (taskProgress(delivery.tasks) === 100 || delivery.approvalStatus === '待主管确认') return '待验收';
  if (delivery.plannedCompletedAt && new Date(delivery.plannedCompletedAt).getTime() < Date.now()) return '超期';
  return taskProgress(delivery.tasks) === 0 ? '待开始' : '交付中';
}

function deliveryTasks(deliveryId: string, stages: string[], now: string): DeliveryTask[] {
  return stages.map((stage, index) => ({
    id: `task-${hash(`${deliveryId}:${index}`, 16)}`,
    title: stage,
    description: `${stage}任务`,
    status: index === 0 ? '进行中' : '待开始',
    records: [],
    updatedAt: now,
  }));
}

function createDelivery(
  order: Order,
  product: Product,
  createdAt: string,
  assignment?: Partial<Pick<Delivery, 'owner' | 'ownerId' | 'assignmentMode' | 'assignedAt' | 'assignedBy'>>,
): Delivery {
  const id = `delivery-${hash(order.id)}`;
  const stages = resolveProductDeliveryStages(product);
  return {
    id,
    orderId: order.id,
    orderNo: order.orderNo,
    customerId: order.customerId,
    customerName: order.customerName,
    productName: order.productName || product.name,
    productType: order.productLevel,
    currentStage: stages[0],
    stages,
    tasks: deliveryTasks(id, stages, createdAt),
    owner: assignment?.owner || order.successName || order.serviceName || '待分配',
    ownerId: assignment?.ownerId || order.successId || order.serviceId,
    assignmentMode: assignment?.assignmentMode,
    assignedAt: assignment?.assignedAt,
    assignedBy: assignment?.assignedBy,
    salesOwner: order.salesName || order.owner,
    salesOwnerId: order.salesId,
    orderAmount: order.actualAmount ?? order.amount,
    paymentDate: order.payments?.[0]?.paidAt || order.createdAt,
    orderType: order.orderType || order.dealScene,
    status: '待开始',
    priority: 'normal',
    progressPercent: 0,
    approvalStatus: '未提交',
    customerSuccessStatus: '未开始',
    createdAt,
    updatedAt: createdAt,
  };
}

async function writeOrderLink(
  transaction: Prisma.TransactionClient,
  order: Order,
  deliveryId: string | undefined,
  updatedAt: string,
): Promise<Order> {
  if (deliveryId && order.deliveryId && order.deliveryId !== deliveryId) {
    throw new DeliveryCommandError(409, '订单已关联其他交付单');
  }
  if (order.deliveryId === deliveryId) return order;
  const next = { ...order, deliveryId, updatedAt };
  await transaction.businessRecord.update({
    where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: order.id } },
    data: {
      status: next.status,
      owner: next.salesName || next.owner || null,
      customerId: next.customerId,
      orderId: next.id,
      amount: next.actualAmount,
      eventAt: new Date(updatedAt),
      data: jsonValue(next),
    },
  });
  return next;
}

async function writeDelivery(
  transaction: Prisma.TransactionClient,
  delivery: Delivery,
): Promise<void> {
  await transaction.businessRecord.update({
    where: { domain_recordId: { domain: STORAGE_KEYS.DELIVERIES, recordId: delivery.id } },
    data: {
      title: delivery.customerName || delivery.orderNo,
      status: delivery.status || null,
      owner: delivery.owner || null,
      customerId: delivery.customerId || null,
      orderId: delivery.orderId,
      amount: delivery.orderAmount ?? null,
      eventAt: new Date(delivery.updatedAt),
      data: jsonValue(delivery),
    },
  });
}

export function createDeliveryCommandService(
  prisma: DeliveryCommandPrisma,
  options: DeliveryCommandServiceOptions = {},
) {
  const now = options.now || (() => new Date());
  const assigner = options.assigner;
  const execute = async <T>(command: () => Promise<T>): Promise<T | ApiResponse<unknown>> => {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await command();
      } catch (error) {
        if (error instanceof DeliveryCommandError) return failure(error.message, error.responseCode);
        if (prismaCode(error) === 'P2034' && attempt < MAX_TRANSACTION_ATTEMPTS) continue;
        if (prismaCode(error) === 'P2034') return failure('交付单发生并发冲突，请刷新后重试', 409);
        throw error;
      }
    }
    return failure('交付单发生并发冲突，请刷新后重试', 409);
  };

  const mutate = async (
    deliveryId: string,
    actor: AuthenticatedUser,
    mutation: (
      delivery: Delivery,
      order: Order,
      changedAt: string,
      directory: Directory,
      scope: DataVisibilityScope,
    ) => Delivery,
  ): Promise<ApiResponse<Delivery | null>> => {
    try {
      assertMutationPermission(actor);
    } catch (error) {
      const denied = error as DeliveryCommandError;
      return failure(denied.message, denied.responseCode);
    }
    const directory = await loadDirectory(prisma);
    const scope = deliveryScope(directory, actor);
    const result = await execute(() => prisma.$transaction(async (transaction) => {
      const initial = await transaction.businessRecord.findUnique({
        where: { domain_recordId: { domain: STORAGE_KEYS.DELIVERIES, recordId: deliveryId } },
      });
      if (!initial) throw new DeliveryCommandError(404, '交付单不存在');
      const initialDelivery = parseObject<Delivery>(initial.data, '交付单');
      const order = await lockRecord<Order>(transaction, STORAGE_KEYS.ORDERS, initialDelivery.orderId, '订单');
      const delivery = await lockRecord<Delivery>(transaction, STORAGE_KEYS.DELIVERIES, deliveryId, '交付单');
      if (delivery.orderId !== order.id) throw new DeliveryCommandError(409, '交付单关联订单不一致');
      if (!relationVisible(order, delivery, scope)) throw new DeliveryCommandError(403, '无权操作该交付单');
      const changedAt = now().toISOString();
      await writeOrderLink(transaction, order, delivery.id, changedAt);
      const next = mutation(delivery, order, changedAt, directory, scope);
      await writeDelivery(transaction, next);
      return next;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 10_000,
    }));
    return result && typeof result === 'object' && 'code' in result
      ? result as ApiResponse<Delivery | null>
      : success(result as Delivery);
  };

  return {
    async createFromOrder(orderId: string, actor: AuthenticatedUser): Promise<ApiResponse<Delivery | null>> {
      try {
        assertMutationPermission(actor);
      } catch (error) {
        const denied = error as DeliveryCommandError;
        return failure(denied.message, denied.responseCode);
      }
      const directory = await loadDirectory(prisma);
      const scope = deliveryScope(directory, actor);
      const cleanOrderId = String(orderId || '').trim();
      if (!cleanOrderId) return failure('订单ID不能为空', 400);
      const result = await execute(() => prisma.$transaction(async (transaction) => {
        // Discover the stable customer ID without taking the order row lock first.
        // Every customer-association writer must acquire the shared association
        // lock before any business row lock, matching delete/merge lock ordering.
        const initialOrderRow = await transaction.businessRecord.findUnique({
          where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: cleanOrderId } },
        });
        if (!initialOrderRow) throw new DeliveryCommandError(404, '订单不存在');
        const initialOrder = parseObject<Order>(initialOrderRow.data, '订单');
        const customerId = String(initialOrder.customerId || '').trim();
        if (!customerId) throw new DeliveryCommandError(409, '订单缺少客户稳定ID');
        await lockCustomerAssociationScope(transaction, [customerId]);
        const customerRow = await transaction.businessRecord.findUnique({
          where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: customerId } },
        });
        const customer = customerRow ? parseObject<{ id?: string; deletedAt?: string }>(customerRow.data, '客户') : null;
        if (!customer || customer.id !== customerId || customer.deletedAt) {
          throw new DeliveryCommandError(409, '订单关联客户不存在或已删除');
        }
        const order = await lockRecord<Order>(transaction, STORAGE_KEYS.ORDERS, cleanOrderId, '订单');
        if (order.customerId !== customerId) {
          throw new DeliveryCommandError(409, '订单关联客户已变更，请刷新后重试');
        }
        if (!relationVisible(order, undefined, scope)) throw new DeliveryCommandError(403, '无权为该订单创建交付单');
        if (order.deletedAt) throw new DeliveryCommandError(409, '已删除订单不能创建交付单');
        if (order.status !== '已确认') throw new DeliveryCommandError(409, '只有已确认订单可以创建交付单');
        const existingRows = await transaction.businessRecord.findMany({
          where: { domain: STORAGE_KEYS.DELIVERIES, orderId: order.id },
        });
        const existing = existingRows.map((row) => parseObject<Delivery>(row.data, '交付单'))
          .find((delivery) => delivery.orderId === order.id);
        if (existing) {
          if (order.deliveryId && order.deliveryId !== existing.id) {
            throw new DeliveryCommandError(409, '订单交付关联冲突，请先修复数据');
          }
          await writeOrderLink(transaction, order, existing.id, now().toISOString());
          return existing;
        }
        if (order.deliveryId) throw new DeliveryCommandError(409, '订单关联的交付单不存在，请先修复数据');
        if (!order.productId) throw new DeliveryCommandError(409, '订单缺少产品稳定ID');
        const productRow = await transaction.businessRecord.findUnique({
          where: { domain_recordId: { domain: STORAGE_KEYS.PRODUCTS, recordId: order.productId } },
        });
        if (!productRow) throw new DeliveryCommandError(409, '订单关联产品不存在');
        const product = parseObject<Product>(productRow.data, '产品');
        if (product.id !== order.productId || product.isActive === false || product.level !== order.productLevel) {
          throw new DeliveryCommandError(409, '订单产品快照与产品稳定ID不一致');
        }
        if (!resolveProductDeliveryStages(product).length) {
          throw new DeliveryCommandError(409, '该订单产品未配置交付阶段，无需创建交付单');
        }
        const createdAt = now().toISOString();
        const automaticAssignment = assigner ? await assigner.assignNext(transaction, createdAt) : undefined;
        const assignment = automaticAssignment === null ? { owner: '待分配', ownerId: undefined } : automaticAssignment;
        const delivery = createDelivery(order, product, createdAt, assignment || undefined);
        await transaction.businessRecord.create({
          data: {
            id: `${STORAGE_KEYS.DELIVERIES}:${delivery.id}`,
            domain: STORAGE_KEYS.DELIVERIES,
            recordId: delivery.id,
            title: delivery.customerName || delivery.orderNo,
            status: delivery.status,
            owner: delivery.owner,
            customerId: delivery.customerId,
            orderId: delivery.orderId,
            amount: delivery.orderAmount ?? null,
            eventAt: new Date(createdAt),
            data: jsonValue(delivery),
          },
        });
        await writeOrderLink(transaction, order, delivery.id, createdAt);
        return delivery;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      }));
      return result && typeof result === 'object' && 'code' in result
        ? result as ApiResponse<Delivery | null>
        : success(result as Delivery);
    },

    async updateCard(deliveryId: string, patch: DeliveryCardPatch, actor: AuthenticatedUser) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return failure<Delivery>('交付卡片数据无效', 400);
      const unsupported = Object.keys(patch).find((field) => !CARD_FIELDS.has(field));
      if (unsupported) return failure<Delivery>(`字段 ${unsupported} 不允许通过交付卡片修改`, 400);
      if (patch.priority && !['low', 'normal', 'high', 'urgent'].includes(patch.priority)) {
        return failure<Delivery>('交付优先级无效', 400);
      }
      if (patch.plannedCompletedAt && !Number.isFinite(new Date(patch.plannedCompletedAt).getTime())) {
        return failure<Delivery>('计划完成时间无效', 400);
      }
      if (patch.materialItems !== undefined && !Array.isArray(patch.materialItems)) {
        return failure<Delivery>('交付资料数据无效', 400);
      }
      return mutate(deliveryId, actor, (delivery, _order, changedAt, directory, scope) => {
        let ownerId = delivery.ownerId;
        let owner = delivery.owner;
        if (Object.prototype.hasOwnProperty.call(patch, 'ownerId')) {
          if (!patch.ownerId) {
            ownerId = undefined;
            owner = '待分配';
          } else {
            const target = directory.users.find((user) => user.id === patch.ownerId && activeUser(user));
            if (!target) throw new DeliveryCommandError(400, '指定的交付负责人不存在或已停用');
            if (!scope.unrestricted && !scope.visibleUserIds.includes(target.id)) {
              throw new DeliveryCommandError(403, '无权把交付单分配给该员工');
            }
            ownerId = target.id;
            owner = target.name;
          }
        } else if (patch.owner && patch.owner !== delivery.owner) {
          throw new DeliveryCommandError(400, '修改交付负责人必须使用稳定员工ID');
        }
        const next: Delivery = {
          ...delivery,
          ...patch,
          ownerId,
          owner,
          ...(Object.prototype.hasOwnProperty.call(patch, 'ownerId') ? {
            assignmentMode: 'manual' as const,
            assignedAt: changedAt,
            assignedBy: actor.name,
          } : {}),
          updatedAt: changedAt,
        };
        next.progressPercent = taskProgress(next.tasks);
        next.status = deriveStatus(next);
        return next;
      });
    },

    async advance(deliveryId: string, targetStage: string, actor: AuthenticatedUser) {
      return mutate(deliveryId, actor, (delivery, _order, changedAt) => {
        const currentIndex = delivery.stages.indexOf(delivery.currentStage);
        const targetIndex = delivery.stages.indexOf(String(targetStage || '').trim());
        if (targetIndex === currentIndex) return delivery;
        if (targetIndex !== currentIndex + 1) throw new DeliveryCommandError(409, '交付阶段只能按顺序推进');
        const tasks = delivery.tasks.map((task, index) => {
          if (index === currentIndex) return { ...task, status: '已完成', completedAt: task.completedAt || changedAt, completedBy: task.completedBy || actor.name, updatedAt: changedAt };
          if (index === targetIndex) return { ...task, status: '进行中', updatedAt: changedAt };
          return task;
        });
        const next: Delivery = { ...delivery, tasks, currentStage: delivery.stages[targetIndex], updatedAt: changedAt };
        next.progressPercent = taskProgress(tasks);
        next.status = deriveStatus(next);
        return next;
      });
    },

    async revert(deliveryId: string, actor: AuthenticatedUser) {
      return mutate(deliveryId, actor, (delivery, _order, changedAt) => {
        if (delivery.approvalStatus === '已确认' || delivery.status === '已完成') {
          throw new DeliveryCommandError(409, '交付已确认完成，不能返回上一步');
        }
        const currentIndex = delivery.stages.indexOf(delivery.currentStage);
        if (currentIndex <= 0) throw new DeliveryCommandError(409, '当前已经是第一步');
        const previousIndex = currentIndex - 1;
        const tasks = delivery.tasks.map((task, index) => index < previousIndex
          ? task
          : index === previousIndex
            ? { ...task, status: '进行中', completedAt: undefined, completedBy: undefined, updatedAt: changedAt }
            : { ...task, status: '待开始', completedAt: undefined, completedBy: undefined, updatedAt: changedAt });
        const next: Delivery = {
          ...delivery,
          tasks,
          currentStage: delivery.stages[previousIndex],
          approvalStatus: '未提交',
          actualCompletedAt: undefined,
          supervisorConfirmedBy: undefined,
          supervisorConfirmedAt: undefined,
          supervisorNotes: undefined,
          updatedAt: changedAt,
        };
        next.progressPercent = taskProgress(tasks);
        next.status = deriveStatus(next);
        return next;
      });
    },

    async updateTask(
      deliveryId: string,
      taskId: string,
      patch: Partial<DeliveryTask>,
      actor: AuthenticatedUser,
    ) {
      const allowed = new Set(['status', 'resultFields', 'dueDate', 'assigneeId', 'assigneeName']);
      const unsupported = Object.keys(patch || {}).find((field) => !allowed.has(field));
      if (unsupported) return failure<Delivery>(`任务字段 ${unsupported} 不允许修改`, 400);
      return mutate(deliveryId, actor, (delivery, _order, changedAt, directory, scope) => {
        const taskIndex = delivery.tasks.findIndex((task) => task.id === taskId);
        if (taskIndex === -1) throw new DeliveryCommandError(404, '交付任务不存在');
        if (patch.status && !['待开始', '进行中', '已完成'].includes(patch.status)) {
          throw new DeliveryCommandError(409, '交付任务状态无效');
        }
        let assigneeId = delivery.tasks[taskIndex].assigneeId;
        let assigneeName = delivery.tasks[taskIndex].assigneeName;
        if (Object.prototype.hasOwnProperty.call(patch, 'assigneeId')) {
          if (!patch.assigneeId) {
            assigneeId = undefined;
            assigneeName = undefined;
          } else {
            const assignee = directory.users.find((user) => user.id === patch.assigneeId && activeUser(user));
            if (!assignee) throw new DeliveryCommandError(400, '任务负责人不存在或已停用');
            if (!scope.unrestricted && !scope.visibleUserIds.includes(assignee.id)) {
              throw new DeliveryCommandError(403, '无权把交付任务分配给该员工');
            }
            assigneeId = assignee.id;
            assigneeName = assignee.name;
          }
        } else if (patch.assigneeName && patch.assigneeName !== assigneeName) {
          throw new DeliveryCommandError(400, '修改任务负责人必须使用稳定员工ID');
        }
        const nextStatus = patch.status || delivery.tasks[taskIndex].status;
        const tasks = delivery.tasks.map((task, index) => index === taskIndex
          ? {
              ...task,
              ...patch,
              assigneeId,
              assigneeName,
              status: nextStatus,
              completedAt: nextStatus === '已完成' ? task.completedAt || changedAt : undefined,
              completedBy: nextStatus === '已完成' ? task.completedBy || actor.name : undefined,
              skippedAt: undefined,
              skipReason: undefined,
              updatedAt: changedAt,
            }
          : { ...task });
        const nextOpen = tasks.findIndex((task) => task.status !== '已完成' && !task.completedAt);
        const allDone = nextOpen === -1;
        const next: Delivery = {
          ...delivery,
          tasks,
          currentStage: resolveLatestCompletedDeliveryStage(delivery.stages, tasks, delivery.currentStage),
          approvalStatus: allDone ? '待主管确认' : delivery.approvalStatus || '未提交',
          updatedAt: changedAt,
        };
        next.progressPercent = taskProgress(tasks);
        next.status = deriveStatus(next);
        return next;
      });
    },

    async addAttachment(
      deliveryId: string,
      taskId: string,
      input: Omit<DeliveryAttachment, 'id' | 'uploadedAt'> & Partial<Pick<DeliveryAttachment, 'id' | 'uploadedAt'>>,
      actor: AuthenticatedUser,
    ) {
      if (!cleanAttachmentName(input?.name)) return failure<Delivery>('附件名不能为空', 400);
      return mutate(deliveryId, actor, (delivery, _order, changedAt) => {
        const taskIndex = delivery.tasks.findIndex((task) => task.id === taskId);
        if (taskIndex === -1) throw new DeliveryCommandError(404, '交付任务不存在');
        const attachmentId = input.id || `file-${hash(`${deliveryId}:${taskId}:${input.name}:${input.size || 0}`)}`;
        const existing = (delivery.tasks[taskIndex].attachments || []).find((item) => item.id === attachmentId);
        if (existing) return delivery;
        if ((delivery.tasks[taskIndex].attachments || []).length >= 8) {
          throw new DeliveryCommandError(400, '交付附件最多上传 8 个');
        }
        const attachment: DeliveryAttachment = {
          id: attachmentId,
          name: cleanAttachmentName(input.name),
          size: Number(input.size) || 0,
          fileType: input.fileType ? String(input.fileType) : undefined,
          mimeType: input.mimeType ? String(input.mimeType) : undefined,
          category: input.category === 'delivery-task-file' ? input.category : undefined,
          uploadedById: input.uploadedById ? String(input.uploadedById) : undefined,
          uploadedByName: input.uploadedByName ? String(input.uploadedByName) : undefined,
          uploadedBy: actor.name,
          uploadedAt: input.uploadedAt || changedAt,
          remark: input.remark ? String(input.remark) : undefined,
        };
        const tasks = delivery.tasks.map((task, index) => index === taskIndex
          ? { ...task, attachments: [...(task.attachments || []), attachment], updatedAt: changedAt }
          : task);
        return { ...delivery, tasks, updatedAt: changedAt };
      });
    },

    async removeAttachment(
      deliveryId: string,
      taskId: string,
      attachmentId: string,
      actor: AuthenticatedUser,
    ) {
      return mutate(deliveryId, actor, (delivery, _order, changedAt) => {
        const taskIndex = delivery.tasks.findIndex((task) => task.id === taskId);
        if (taskIndex === -1) throw new DeliveryCommandError(404, '交付任务不存在');
        const attachments = delivery.tasks[taskIndex].attachments || [];
        if (!attachments.some((item) => item.id === attachmentId)) {
          throw new DeliveryCommandError(404, '交付附件不存在');
        }
        const tasks = delivery.tasks.map((task, index) => index === taskIndex
          ? { ...task, attachments: attachments.filter((item) => item.id !== attachmentId), updatedAt: changedAt }
          : task);
        return { ...delivery, tasks, updatedAt: changedAt };
      });
    },

    async addException(deliveryId: string, input: DeliveryExceptionInput, actor: AuthenticatedUser) {
      const description = String(input?.description || '').trim();
      if (!description) return failure<Delivery>('请填写异常说明', 400);
      if (!['客户不提供资料', '交付超期', '销售承诺不一致', '其他'].includes(input.type)) {
        return failure<Delivery>('交付异常类型无效', 400);
      }
      return mutate(deliveryId, actor, (delivery, _order, changedAt) => {
        const exceptionId = `delivery-exception-${hash(`${deliveryId}:${actor.id}:${description}`)}`;
        if ((delivery.exceptions || []).some((item) => item.id === exceptionId && item.status !== '已解除')) return delivery;
        const exception: DeliveryException = {
          id: exceptionId,
          type: input.type,
          description,
          status: '待主管处理',
          needsSupervisor: input.needsSupervisor ?? true,
          createdBy: actor.name,
          createdAt: changedAt,
        };
        return {
          ...delivery,
          exceptions: [...(delivery.exceptions || []), exception],
          blockedReason: description,
          status: '阻塞',
          updatedAt: changedAt,
        };
      });
    },

    async resolveException(
      deliveryId: string,
      exceptionId: string,
      resolution: string,
      actor: AuthenticatedUser,
    ) {
      const cleanResolution = String(resolution || '').trim();
      if (!cleanResolution) return failure<Delivery>('请填写异常处理结果', 400);
      return mutate(deliveryId, actor, (delivery, _order, changedAt) => {
        const target = (delivery.exceptions || []).find((item) => item.id === exceptionId);
        if (!target) throw new DeliveryCommandError(404, '交付异常不存在');
        if (target.status === '已解除') return delivery;
        const exceptions = (delivery.exceptions || []).map((item) => item.id === exceptionId
          ? { ...item, status: '已解除' as const, resolvedBy: actor.name, resolvedAt: changedAt, resolution: cleanResolution }
          : item);
        const hasOpen = exceptions.some((item) => item.status !== '已解除');
        const next: Delivery = {
          ...delivery,
          exceptions,
          blockedReason: hasOpen ? delivery.blockedReason : undefined,
          updatedAt: changedAt,
        };
        next.status = deriveStatus(next);
        return next;
      });
    },

    async confirmCompletion(deliveryId: string, notes: string, actor: AuthenticatedUser) {
      return mutate(deliveryId, actor, (delivery, _order, changedAt) => {
        if (openException(delivery)) throw new DeliveryCommandError(409, '存在未解除异常，不能确认交付完成');
        const unfinished = delivery.tasks.find((task) => task.status !== '已完成' && !task.completedAt);
        if (unfinished) throw new DeliveryCommandError(409, `步骤「${unfinished.title}」未完成，不能主管确认`);
        if (delivery.approvalStatus === '已确认') return delivery;
        return {
          ...delivery,
          approvalStatus: '已确认',
          supervisorConfirmedBy: actor.name,
          supervisorConfirmedAt: changedAt,
          supervisorNotes: String(notes || '').trim() || undefined,
          actualCompletedAt: changedAt,
          status: '已完成',
          customerSuccessStatus: '维护中',
          updatedAt: changedAt,
        };
      });
    },

    async delete(deliveryId: string, actor: AuthenticatedUser): Promise<ApiResponse<boolean | null>> {
      try {
        assertMutationPermission(actor);
      } catch (error) {
        const denied = error as DeliveryCommandError;
        return failure(denied.message, denied.responseCode);
      }
      const directory = await loadDirectory(prisma);
      const scope = deliveryScope(directory, actor);
      const result = await execute(() => prisma.$transaction(async (transaction) => {
        const initial = await transaction.businessRecord.findUnique({
          where: { domain_recordId: { domain: STORAGE_KEYS.DELIVERIES, recordId: deliveryId } },
        });
        if (!initial) return true;
        const snapshot = parseObject<Delivery>(initial.data, '交付单');
        const order = await lockRecord<Order>(transaction, STORAGE_KEYS.ORDERS, snapshot.orderId, '订单');
        const delivery = await lockRecord<Delivery>(transaction, STORAGE_KEYS.DELIVERIES, deliveryId, '交付单');
        if (!relationVisible(order, delivery, scope)) throw new DeliveryCommandError(403, '无权删除该交付单');
        if (delivery.approvalStatus === '已确认' || delivery.status === '已完成') {
          throw new DeliveryCommandError(409, '已完成交付单不能删除');
        }
        await transaction.businessRecord.delete({
          where: { domain_recordId: { domain: STORAGE_KEYS.DELIVERIES, recordId: delivery.id } },
        });
        await writeOrderLink(transaction, order, undefined, now().toISOString());
        return true;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      }));
      return result && typeof result === 'object' && 'code' in result
        ? result as ApiResponse<boolean | null>
        : success(Boolean(result));
    },
  };
}
