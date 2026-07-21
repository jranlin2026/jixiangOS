import { randomUUID } from 'node:crypto';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { createPasswordSalt, hashPassword } from '../../src/shared/utils/auth';
import type {
  PersistedSystemSetupInput,
  SystemInstallationRecord,
  SystemSetupRepository,
} from './systemSetupService';
import { seedSystemBaseline } from './systemSeedService';
import { seedDemoBusinessData } from './demoSeedService';

const INSTALLATION_ID = 'primary';
const SETUP_VERSION = 1;

interface RepositoryOptions {
  installationId?: () => string;
  userId?: () => string;
  now?: () => Date;
}

function mapInstallation(row: any): SystemInstallationRecord {
  return {
    id: String(row.id),
    installationId: String(row.installationId),
    state: row.state,
    setupVersion: Number(row.setupVersion || SETUP_VERSION),
    companyName: row.companyName || null,
    initializedAt: row.initializedAt || null,
    lastError: row.lastError || null,
  };
}

function organizationCompanyName(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const companyName = String((value as { companyName?: unknown }).companyName || '').trim();
  return companyName || null;
}

function isUniqueConflict(error: unknown): boolean {
  return String((error as { code?: unknown } | null)?.code || '') === 'P2002';
}

export function createPrismaSystemSetupRepository(prisma: any, options: RepositoryOptions = {}): SystemSetupRepository {
  const createInstallationId = options.installationId || randomUUID;
  const createUserId = options.userId || randomUUID;
  const now = options.now || (() => new Date());

  const resolve = async (): Promise<SystemInstallationRecord> => {
    const existing = await prisma.systemInstallation.findUnique({ where: { id: INSTALLATION_ID } });
    if (existing) return mapInstallation(existing);

    const [userCount, businessRecordCount, leadRecordCount, initializedMarker, organizationProfile] = await Promise.all([
      prisma.user.count(),
      prisma.businessRecord.count(),
      prisma.leadRecord.count(),
      prisma.appStorage.findUnique({ where: { key: STORAGE_KEYS.INITIALIZED } }),
      prisma.appStorage.findUnique({ where: { key: STORAGE_KEYS.ORGANIZATION_PROFILE } }),
    ]);
    const isLegacyInstallation = userCount > 0
      || businessRecordCount > 0
      || leadRecordCount > 0
      || initializedMarker?.value === true;
    const timestamp = now();

    try {
      const created = await prisma.systemInstallation.create({
        data: {
          id: INSTALLATION_ID,
          installationId: createInstallationId(),
          state: isLegacyInstallation ? 'ACTIVE' : 'UNINITIALIZED',
          setupVersion: SETUP_VERSION,
          companyName: isLegacyInstallation ? organizationCompanyName(organizationProfile?.value) : null,
          initializedAt: isLegacyInstallation ? timestamp : null,
          lastError: null,
        },
      });
      return mapInstallation(created);
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const raced = await prisma.systemInstallation.findUnique({ where: { id: INSTALLATION_ID } });
      if (!raced) throw error;
      return mapInstallation(raced);
    }
  };

  const initialize = async (input: PersistedSystemSetupInput): Promise<SystemInstallationRecord> => {
    await resolve();
    const timestamp = now();

    try {
      const initialized = await prisma.$transaction(async (tx: any) => {
        const claim = await tx.systemInstallation.updateMany({
          where: { id: INSTALLATION_ID, state: { in: ['UNINITIALIZED', 'FAILED'] } },
          data: { state: 'INITIALIZING', lastError: null },
        });
        if (claim.count !== 1) {
          throw Object.assign(new Error('系统已经初始化或正在执行初始化'), { statusCode: 409 });
        }

        await seedSystemBaseline(tx, {
          companyName: input.companyName,
          organizationTemplate: input.organizationTemplate,
        });

        const userId = createUserId();
        const passwordSalt = createPasswordSalt(`${userId}-${timestamp.getTime()}`);
        const recommended = input.organizationTemplate === 'recommended';
        await tx.user.create({
          data: {
            id: userId,
            name: input.adminName,
            account: input.adminAccount,
            email: input.adminEmail,
            phone: input.adminPhone,
            role: '超级管理员',
            departmentId: recommended ? 'dept-general' : null,
            positionId: recommended ? 'pos-general-manager' : null,
            positionName: recommended ? '总经理' : null,
            roleId: 'role-super-admin',
            passwordHash: hashPassword(input.adminPassword, passwordSalt),
            passwordSalt,
            passwordUpdatedAt: timestamp,
            mustChangePassword: false,
            lastLoginAt: null,
            isActive: true,
            employmentStatus: 'active',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        });

        if (input.includeDemoData) await seedDemoBusinessData(tx);

        return tx.systemInstallation.update({
          where: { id: INSTALLATION_ID },
          data: {
            state: 'ACTIVE',
            setupVersion: SETUP_VERSION,
            companyName: input.companyName,
            initializedAt: timestamp,
            lastError: null,
          },
        });
      });
      return mapInstallation(initialized);
    } catch (error) {
      if (Number((error as { statusCode?: unknown } | null)?.statusCode) !== 409) {
        await prisma.systemInstallation.updateMany({
          where: { id: INSTALLATION_ID, state: { in: ['UNINITIALIZED', 'FAILED'] } },
          data: { state: 'FAILED', lastError: 'SETUP_FAILED' },
        }).catch(() => undefined);
      }
      throw error;
    }
  };

  return { resolve, initialize };
}
