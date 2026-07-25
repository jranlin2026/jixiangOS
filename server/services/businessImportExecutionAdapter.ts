import type { PrismaClient } from '@prisma/client';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { BusinessImportJobExecution, BusinessImportJobRow } from '../../src/types/businessImport';
import { PERMISSION_KEYS, hasPermission, toAuthenticatedUser } from '../../src/shared/utils/permissions';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import { businessImportContactKeys, loadBusinessImportDirectory } from './businessImportAdapter';
import type { BusinessImportDirectory } from './businessImportService';
import { createBusinessImportRowExecutor } from './businessImportExecution';

async function currentActor(prisma: PrismaClient, actorId: string): Promise<AuthenticatedUser> {
  const rows = await prisma.$queryRaw<Array<any>>`
    SELECT u.id, u.name, u.account, u.email, u.phone, u.role, u.avatar,
      u.departmentId, u.positionId, u.positionName, u.roleId,
      u.mustChangePassword, u.lastLoginAt, u.isActive, u.employmentStatus,
      u.createdAt, u.updatedAt,
      r.id AS authorityRoleId, r.name AS authorityRoleName, r.code AS authorityRoleCode,
      r.description AS authorityRoleDescription, r.departmentId AS authorityRoleDepartmentId,
      r.permissions AS authorityRolePermissions, r.dataScopes AS authorityRoleDataScopes,
      r.memberCount AS authorityRoleMemberCount, r.isActive AS authorityRoleIsActive,
      r.createdAt AS authorityRoleCreatedAt, r.updatedAt AS authorityRoleUpdatedAt
    FROM users u
    LEFT JOIN roles r ON r.id = u.roleId
      OR (u.roleId IS NULL AND r.normalizedName = u.role)
    WHERE u.id = ${actorId}
    LIMIT 1`;
  const row = rows[0];
  if (!row || !row.isActive || (row.employmentStatus || 'active') !== 'active') throw new Error('导入人不存在或已停用');
  const roles = row.authorityRoleId ? [mapPrismaRole({
    id: row.authorityRoleId, name: row.authorityRoleName, code: row.authorityRoleCode,
    description: row.authorityRoleDescription, departmentId: row.authorityRoleDepartmentId,
    permissions: row.authorityRolePermissions, dataScopes: row.authorityRoleDataScopes,
    memberCount: row.authorityRoleMemberCount, isActive: Boolean(row.authorityRoleIsActive),
    createdAt: row.authorityRoleCreatedAt, updatedAt: row.authorityRoleUpdatedAt,
  })] : [];
  return toAuthenticatedUser(mapPrismaUser({
    ...row, passwordHash: null, passwordSalt: null, passwordUpdatedAt: null,
    leftAt: null, leftBy: null,
  }), roles);
}

export async function loadBusinessImportDirectoryRevision(prisma: PrismaClient): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ revision: string }>>`
    SELECT CONCAT_WS('|',
      (SELECT CONCAT(COUNT(*), ':', COALESCE(DATE_FORMAT(MAX(updatedAt), '%Y-%m-%dT%H:%i:%s.%f'), '')) FROM users),
      (SELECT CONCAT(COUNT(*), ':', COALESCE(DATE_FORMAT(MAX(updatedAt), '%Y-%m-%dT%H:%i:%s.%f'), '')) FROM roles),
      (SELECT CONCAT(COUNT(*), ':', COALESCE(DATE_FORMAT(MAX(updatedAt), '%Y-%m-%dT%H:%i:%s.%f'), '')) FROM departments),
      (SELECT CONCAT(COUNT(*), ':', COALESCE(DATE_FORMAT(MAX(updatedAt), '%Y-%m-%dT%H:%i:%s.%f'), '')) FROM app_storage),
      (SELECT CONCAT(COUNT(*), ':', COALESCE(DATE_FORMAT(MAX(updatedAt), '%Y-%m-%dT%H:%i:%s.%f'), '')) FROM business_records WHERE domain = 'aaos_customers')
    ) AS revision`;
  return String(rows[0]?.revision || 'empty');
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
  loadExecutionActor?: (job: BusinessImportJobExecution) => Promise<AuthenticatedUser>;
  loadExecutionRevision?: (job: BusinessImportJobExecution) => Promise<bigint | number | string>;
  loadExecutionSnapshot?: (job: BusinessImportJobExecution) => Promise<{ actor: AuthenticatedUser; directory: BusinessImportDirectory }>;
  now?: () => number;
  revalidateEveryRows?: number;
  orderApplications: {
    submitImported(data: any, actor: AuthenticatedUser, metadata: any, idempotencyKey: string): Promise<any>;
  };
  recoveryOrders: {
    createImported(data: any, actor: AuthenticatedUser, metadata: any, customer: any): Promise<any>;
  };
}) {
  const actors = new Map<string, AuthenticatedUser>();
  const snapshots = new Map<string, { revision: string; loaded: Promise<{ actor: AuthenticatedUser; directory: BusinessImportDirectory }> }>();
  const revisions = new Map<string, { revision: string; rowsSinceCheck: number }>();
  const revalidateEveryRows = input.revalidateEveryRows || 25;
  const loadActor = async (job: BusinessImportJobExecution) => (
    input.loadExecutionActor ? input.loadExecutionActor(job) : currentActor(input.prisma, job.actorId)
  );
  const revision = async (job: BusinessImportJobExecution) => {
    const cached = revisions.get(job.id);
    if (cached && cached.rowsSinceCheck < revalidateEveryRows) {
      cached.rowsSinceCheck += 1;
      return cached.revision;
    }
    const current = String(input.loadExecutionRevision
      ? await input.loadExecutionRevision(job)
      : await loadBusinessImportDirectoryRevision(input.prisma));
    revisions.set(job.id, { revision: current, rowsSinceCheck: 1 });
    return current;
  };
  const snapshot = async (job: BusinessImportJobExecution, actor: AuthenticatedUser, revision: string) => {
    let cached = snapshots.get(job.id);
    if (!cached || cached.revision !== revision) {
      const loaded = input.loadExecutionSnapshot ? input.loadExecutionSnapshot(job) : (async () => {
        return { actor, directory: await loadBusinessImportDirectory(input.prisma, actor, job.type) };
      })();
      cached = { revision, loaded };
      snapshots.set(job.id, cached);
    }
    return cached.loaded;
  };
  const executor = createBusinessImportRowExecutor({
    loadContext: async (job: BusinessImportJobExecution, row: BusinessImportJobRow) => {
      const [actor, currentRevision] = await Promise.all([loadActor(job), revision(job)]);
      if (!actor.isActive) throw new Error('导入人不存在或已停用');
      const permission = job.type === 'orders' ? PERMISSION_KEYS.ORDER_IMPORT : PERMISSION_KEYS.AFTER_SALES_RECOVERY_IMPORT;
      if (!hasPermission(actor, permission, 'write')) throw new Error('导入人权限已变化，任务已停止');
      const { directory } = await snapshot(job, actor, currentRevision);
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
    releaseJob(job: BusinessImportJobExecution) { actors.delete(job.id); snapshots.delete(job.id); revisions.delete(job.id); },
  };
}
