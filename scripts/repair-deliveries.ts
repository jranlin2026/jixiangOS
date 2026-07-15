import 'dotenv/config';
import { prisma } from '../server/db/client';
import { STORAGE_KEYS } from '../src/shared/utils/constants';
import type { AuthenticatedUser } from '../src/types/auth';
import type { Delivery } from '../src/types/delivery';
import type { Order } from '../src/types/order';
import { createDeliveryCommandService } from '../server/services/deliveryCommandService';
import { buildDeliveryRepairPlan } from '../server/services/deliveryRepairPlan';

const apply = process.argv.includes('--apply');
const productionConfirmed = process.argv.includes('--confirm-production');

if (apply && process.env.NODE_ENV === 'production' && !productionConfirmed) {
  throw new Error('生产环境执行必须同时提供 --apply --confirm-production，并在执行前完成备份和人工确认');
}

const rows = await prisma.businessRecord.findMany({
  where: { domain: { in: [STORAGE_KEYS.ORDERS, STORAGE_KEYS.DELIVERIES] } },
  select: { domain: true, data: true },
});
const orders = rows.filter((row) => row.domain === STORAGE_KEYS.ORDERS).map((row) => row.data as unknown as Order);
const deliveries = rows.filter((row) => row.domain === STORAGE_KEYS.DELIVERIES).map((row) => row.data as unknown as Delivery);
const plan = buildDeliveryRepairPlan(orders, deliveries);

console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...plan }, null, 2));

if (apply) {
  if (plan.conflicts.length) throw new Error('存在关联冲突，已停止执行；请先人工处理 conflicts');
  const admin = await prisma.user.findFirst({ where: { roleId: 'role-super-admin', isActive: true } });
  if (!admin) throw new Error('找不到可用于受审计修复的超级管理员账号');
  const actor: AuthenticatedUser = {
    id: admin.id,
    name: admin.name,
    account: admin.account || '',
    email: admin.email,
    phone: admin.phone,
    role: admin.role,
    roleId: admin.roleId || undefined,
    departmentId: admin.departmentId || undefined,
    positionId: admin.positionId || undefined,
    positionName: admin.positionName || undefined,
    avatar: admin.avatar || undefined,
    isActive: admin.isActive,
    permissions: [{ module: '全部', actions: ['read', 'write', 'delete', 'admin'] }],
  };
  const service = createDeliveryCommandService(prisma);
  const results = [];
  for (const orderId of [...plan.linkRepairs.map((item) => item.orderId), ...plan.createFromOrderIds]) {
    const result = await service.createFromOrder(orderId, actor);
    results.push({ orderId, code: result.code, message: result.message, deliveryId: result.data?.id });
    if (result.code !== 0) throw new Error(`修复订单 ${orderId} 失败：${result.message}`);
  }
  console.log(JSON.stringify({ applied: results }, null, 2));
}

await prisma.$disconnect();
