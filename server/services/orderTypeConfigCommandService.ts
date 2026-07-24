import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { Order } from '../../src/types/order';
import type { CommissionRule } from '../../src/types/commission';
import type { OrderTypeConfig } from '../../src/types/settings';

type OrderTypeConfigPrisma = Pick<PrismaClient, 'appStorage' | 'businessRecord' | '$transaction'>;

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function createOrderTypeConfigCommandService(prisma: OrderTypeConfigPrisma) {
  return {
    async update(id: string, data: Partial<Omit<OrderTypeConfig, 'id' | 'createdAt' | 'updatedAt'>>) {
      return prisma.$transaction(async (tx) => {
        const configRow = await tx.appStorage.findUnique({ where: { key: STORAGE_KEYS.ORDER_TYPE_CONFIGS } });
        const configs = asArray<OrderTypeConfig>(configRow?.value);
        const index = configs.findIndex((config) => config.id === id);
        if (index === -1) return success(null);

        const current = configs[index];
        const nextName = typeof data.name === 'string' ? data.name.trim() : current.name;
        if (!nextName) return failure('订单类型名称不能为空');
        if (configs.some((config) => config.id !== id && config.name === nextName)) {
          return failure('订单类型已存在');
        }

        const now = new Date().toISOString();
        const updated: OrderTypeConfig = {
          ...current,
          ...data,
          name: nextName,
          sortOrder: Number(data.sortOrder ?? current.sortOrder),
          updatedAt: now,
        };
        const nextConfigs = [...configs];
        nextConfigs[index] = updated;
        nextConfigs.sort((a, b) => a.sortOrder - b.sortOrder);
        await tx.appStorage.upsert({
          where: { key: STORAGE_KEYS.ORDER_TYPE_CONFIGS },
          update: { value: jsonValue(nextConfigs) },
          create: { key: STORAGE_KEYS.ORDER_TYPE_CONFIGS, value: jsonValue(nextConfigs) },
        });

        if (current.name !== nextName) {
          const orderRows = await tx.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS } });
          for (const row of orderRows) {
            const order = row.data as unknown as Order;
            if (order.orderType !== current.name && order.dealScene !== current.name) continue;
            const nextOrder: Order = {
              ...order,
              orderType: order.orderType === current.name ? nextName : order.orderType,
              dealScene: order.dealScene === current.name ? nextName as Order['dealScene'] : order.dealScene,
              updatedAt: now,
            };
            await tx.businessRecord.update({
              where: { id: row.id },
              data: { data: jsonValue(nextOrder), recordRevision: { increment: 1 } },
            });
          }

          const ruleRow = await tx.appStorage.findUnique({ where: { key: STORAGE_KEYS.COMMISSION_RULES } });
          if (ruleRow) {
            const rules = asArray<CommissionRule>(ruleRow.value);
            const nextRules = rules.map((rule) => rule.orderType === current.name
              ? { ...rule, orderType: nextName, scene: rule.scene === current.name ? nextName as CommissionRule['scene'] : rule.scene }
              : rule);
            await tx.appStorage.update({
              where: { key: STORAGE_KEYS.COMMISSION_RULES },
              data: { value: jsonValue(nextRules) },
            });
          }
        }

        return success(updated);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 20_000,
      });
    },
  };
}
