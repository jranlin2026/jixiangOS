import type { PrismaClient } from '@prisma/client';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { BusinessImportJobExecution, BusinessImportJobRow } from '../../src/types/businessImport';
import { PERMISSION_KEYS, hasPermission, toAuthenticatedUser } from '../../src/shared/utils/permissions';
import { mergeRoleWithDefaultAccess } from '../../src/shared/utils/organizationConfig';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import { businessImportContactKeys, loadBusinessImportDirectory } from './businessImportAdapter';
import type { BusinessImportDirectory } from './businessImportService';
import { createBusinessImportRowExecutor } from './businessImportExecution';

async function currentActor(prisma: PrismaClient, actorId: string): Promise<AuthenticatedUser> {
  const [row, roles] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId } }),
    prisma.role.findMany({ where: { isActive: true } }),
  ]);
  if (!row || !row.isActive || (row.employmentStatus || 'active') !== 'active') throw new Error('导入人不存在或已停用');
  return toAuthenticatedUser(mapPrismaUser(row), roles.map(mapPrismaRole).map(mergeRoleWithDefaultAccess));
}

function matchesForRow(directory: Awaited<ReturnType<typeof loadBusinessImportDirectory>>, row: BusinessImportJobRow) {
  const keys = businessImportContactKeys({ phone: String(row.normalized.customerPhone || ''), wechat: String(row.normalized.customerWechat || '') });
  const matches = new Map<string, { id: string; name: string; inScope: boolean }>();
  keys.flatMap((key) => directory.customerMatchesByContact.get(key) || []).forEach((match) => matches.set(match.id, match));
  if ([...matches.values()].some((match) => !match.inScope)) throw new Error('客户存在但已超出当前导入人数据范围');
  return [...matches.values()].map(({ id, name }) => ({ id, name }));
}

export function createPrismaBusinessImportRowExecutor(input: {
  prisma: PrismaClient;
  loadExecutionSnapshot?: (job: BusinessImportJobExecution) => Promise<{ actor: AuthenticatedUser; directory: BusinessImportDirectory }>;
  orderApplications: {
    submitImported(data: any, actor: AuthenticatedUser, metadata: any, idempotencyKey: string): Promise<any>;
  };
  recoveryOrders: {
    createImported(data: any, actor: AuthenticatedUser, metadata: any, customer: any): Promise<any>;
  };
}) {
  const actors = new Map<string, AuthenticatedUser>();
  const snapshots = new Map<string, Promise<{ actor: AuthenticatedUser; directory: BusinessImportDirectory }>>();
  const snapshot = (job: BusinessImportJobExecution) => {
    let loaded = snapshots.get(job.id);
    if (!loaded) {
      loaded = input.loadExecutionSnapshot ? input.loadExecutionSnapshot(job) : (async () => {
        const actor = await currentActor(input.prisma, job.actorId);
        const permission = job.type === 'orders' ? PERMISSION_KEYS.ORDER_IMPORT : PERMISSION_KEYS.AFTER_SALES_RECOVERY_IMPORT;
        if (!hasPermission(actor, permission, 'write')) throw new Error('导入人权限已变化，任务已停止');
        return { actor, directory: await loadBusinessImportDirectory(input.prisma, actor, job.type) };
      })();
      snapshots.set(job.id, loaded);
    }
    return loaded;
  };
  const executor = createBusinessImportRowExecutor({
    loadContext: async (job: BusinessImportJobExecution, row: BusinessImportJobRow) => {
      const { actor, directory } = await snapshot(job);
      actors.set(job.id, actor);
      return {
        actor, users: directory.users, products: directory.products, orderTypes: directory.orderTypes,
        paymentChannels: directory.paymentChannels, recoveryPlatforms: directory.recoveryPlatforms,
        recoveryShops: directory.recoveryShops, customerMatches: matchesForRow(directory, row),
      };
    },
    submitImportedOrderApplication: async ({ applicant: _applicant, metadata, idempotencyKey, orderData }) => {
      const actor = actors.get(idempotencyKey.split(':').slice(0, -1).join(':'));
      if (!actor) throw new Error('导入执行上下文已失效');
      const response = await input.orderApplications.submitImported(orderData, actor, metadata, idempotencyKey);
      if (response.code !== 0 || !response.data) throw new Error(response.message || '订单申请导入失败');
      return { id: response.data.id };
    },
    createImportedRecoveryOrder: async ({ idempotencyKey, metadata, data, customer }) => {
      const actor = actors.get(idempotencyKey.split(':').slice(0, -1).join(':'));
      if (!actor) throw new Error('导入执行上下文已失效');
      const response = await input.recoveryOrders.createImported(data, actor, metadata, { id: customer.id, matchStatus: customer.matchStatus });
      if (response.code !== 0 || !response.data) throw new Error(response.message || '售后挽回单导入失败');
      return { id: response.data.id };
    },
  });
  return {
    async execute(job: BusinessImportJobExecution, row: BusinessImportJobRow) {
      return executor.execute(job, row);
    },
    releaseJob(job: BusinessImportJobExecution) { actors.delete(job.id); snapshots.delete(job.id); },
  };
}
