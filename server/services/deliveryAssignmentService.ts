import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  DeliveryAssignmentConfig,
  DeliveryAssignmentConfigView,
  DeliveryAssignmentParticipantView,
  DeliveryAssignmentUser,
} from '../../src/types/deliveryAssignment';
import { selectNextDeliveryAssignee } from './deliveryAssignmentPolicy';

type AssignmentPrisma = Pick<PrismaClient, 'appStorage' | 'user'>;
const DEFAULT_CONFIG: DeliveryAssignmentConfig = { enabled: false, participants: [] };

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseConfig(value: unknown): DeliveryAssignmentConfig {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_CONFIG };
  const row = parsed as Partial<DeliveryAssignmentConfig>;
  return {
    enabled: Boolean(row.enabled),
    participants: Array.isArray(row.participants)
      ? row.participants.map((item) => ({ userId: String(item.userId || '').trim(), paused: Boolean(item.paused) })).filter((item) => item.userId)
      : [],
    lastAssignedUserId: row.lastAssignedUserId || undefined,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

function participantView(
  participant: DeliveryAssignmentConfig['participants'][number],
  user: DeliveryAssignmentUser | undefined,
): DeliveryAssignmentParticipantView {
  const status: DeliveryAssignmentParticipantView['status'] = !user
    ? 'missing'
    : participant.paused
      ? 'paused'
      : !user.isActive
        ? 'inactive'
        : (user.employmentStatus || 'active') === 'left'
          ? 'left'
          : 'active';
  return {
    ...participant,
    userName: user?.name || '员工不存在',
    eligible: status === 'active',
    status,
  };
}

export function createDeliveryAssignmentService(prisma: AssignmentPrisma) {
  const load = async (client: AssignmentPrisma): Promise<DeliveryAssignmentConfig> => {
    const row = await client.appStorage.findUnique({ where: { key: STORAGE_KEYS.DELIVERY_ASSIGNMENT_CONFIG } });
    return row ? parseConfig(row.value) : { ...DEFAULT_CONFIG };
  };

  return {
    async getConfig() {
      const [config, rawUsers] = await Promise.all([load(prisma), prisma.user.findMany()]);
      const users = rawUsers as unknown as DeliveryAssignmentUser[];
      const userMap = new Map(users.map((user) => [user.id, user]));
      const selected = selectNextDeliveryAssignee(config, users);
      const data: DeliveryAssignmentConfigView = {
        ...config,
        participantViews: config.participants.map((item) => participantView(item, userMap.get(item.userId))),
        nextAssigneeId: selected?.user.id,
        nextAssigneeName: selected?.user.name,
      };
      return success(data);
    },

    async saveConfig(input: Partial<DeliveryAssignmentConfig>, actor: AuthenticatedUser) {
      const participants = Array.isArray(input.participants)
        ? input.participants.map((item) => ({ userId: String(item.userId || '').trim(), paused: Boolean(item.paused) })).filter((item) => item.userId)
        : [];
      if (new Set(participants.map((item) => item.userId)).size !== participants.length) {
        return failure<DeliveryAssignmentConfigView>('参与分配人员不能重复', 400);
      }
      const current = await load(prisma);
      const next: DeliveryAssignmentConfig = {
        enabled: Boolean(input.enabled),
        participants,
        lastAssignedUserId: participants.some((item) => item.userId === current.lastAssignedUserId)
          ? current.lastAssignedUserId
          : undefined,
        updatedAt: new Date().toISOString(),
        updatedBy: actor.name,
      };
      await prisma.appStorage.upsert({
        where: { key: STORAGE_KEYS.DELIVERY_ASSIGNMENT_CONFIG },
        create: { key: STORAGE_KEYS.DELIVERY_ASSIGNMENT_CONFIG, value: jsonValue(next) },
        update: { value: jsonValue(next) },
      });
      return success(next);
    },

    async assignNext(transaction: Prisma.TransactionClient, assignedAt: string) {
      await transaction.appStorage.upsert({
        where: { key: STORAGE_KEYS.DELIVERY_ASSIGNMENT_CONFIG },
        create: { key: STORAGE_KEYS.DELIVERY_ASSIGNMENT_CONFIG, value: jsonValue(DEFAULT_CONFIG) },
        update: {},
      });
      const rows = await transaction.$queryRaw<Array<{ value: unknown }>>(Prisma.sql`
        SELECT value FROM app_storage
        WHERE \`key\` = ${STORAGE_KEYS.DELIVERY_ASSIGNMENT_CONFIG}
        LIMIT 1 FOR UPDATE
      `);
      const config = parseConfig(rows[0]?.value);
      if (!config.enabled) return undefined;
      const users = await transaction.user.findMany() as unknown as DeliveryAssignmentUser[];
      const selected = selectNextDeliveryAssignee(config, users);
      if (!selected) return null;
      const next = { ...config, lastAssignedUserId: selected.user.id };
      await transaction.appStorage.update({
        where: { key: STORAGE_KEYS.DELIVERY_ASSIGNMENT_CONFIG },
        data: { value: jsonValue(next) },
      });
      return {
        ownerId: selected.user.id,
        owner: selected.user.name,
        assignmentMode: 'auto' as const,
        assignedAt,
        assignedBy: 'system' as const,
      };
    },
  };
}

export type DeliveryAssignmentService = ReturnType<typeof createDeliveryAssignmentService>;
