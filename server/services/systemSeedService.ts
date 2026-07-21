import {
  DEFAULT_LEAD_FLOW_CONFIG,
  DEFAULT_LEAD_SOURCE_CONFIGS,
  DEFAULT_LIFECYCLE_STATUS_CONFIGS,
  DEFAULT_ORDER_TYPE_CONFIGS,
  STORAGE_KEYS,
} from '../../src/shared/utils/constants';
import {
  DEFAULT_DEPARTMENTS,
  DEFAULT_POSITIONS,
  DEFAULT_ROLES,
} from '../../src/shared/utils/organizationConfig';
import { normalizeRoleNameForComparison } from '../../src/shared/utils/roles';
import type { OrganizationTemplate } from './systemSetupService';
import {
  CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY,
  CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION,
  ROLE_PERMISSION_ACTION_BASELINE_KEY,
  ROLE_PERMISSION_ACTION_BASELINE_VERSION,
} from './roleMigrationService';

interface SystemSeedOptions {
  companyName?: string;
  organizationTemplate: OrganizationTemplate;
  markInitialized?: boolean;
  hasAdmin?: boolean;
}

const EMPTY_ARRAY_KEYS = [
  STORAGE_KEYS.LEADS,
  STORAGE_KEYS.CUSTOMERS,
  STORAGE_KEYS.ORDERS,
  STORAGE_KEYS.ORDER_APPLICATIONS,
  STORAGE_KEYS.DELIVERIES,
  STORAGE_KEYS.COMMISSIONS,
  STORAGE_KEYS.COMMISSION_OPERATION_LOGS,
  STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES,
  STORAGE_KEYS.REFUNDS,
  STORAGE_KEYS.RECOVERY_ORDERS,
  STORAGE_KEYS.AI_CARDS,
  STORAGE_KEYS.AI_SESSIONS,
  STORAGE_KEYS.SERVICE_TICKETS,
  STORAGE_KEYS.OPPORTUNITIES,
  STORAGE_KEYS.LEAD_INTAKE_RECORDS,
  STORAGE_KEYS.PRODUCTS,
  STORAGE_KEYS.PRODUCT_LEVELS,
  STORAGE_KEYS.TAGS,
  STORAGE_KEYS.COMMISSION_RULES,
  STORAGE_KEYS.COMMISSION_ROLE_CONFIGS,
  STORAGE_KEYS.COMMISSION_PAYOUT_PLANS,
  STORAGE_KEYS.ECOMMERCE_SETTLEMENT_RECORDS,
] as const;

async function putStorage(store: any, key: string, value: unknown): Promise<void> {
  await store.appStorage.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function seedSystemBaseline(store: any, options: SystemSeedOptions): Promise<void> {
  const recommended = options.organizationTemplate === 'recommended';
  const hasAdmin = options.hasAdmin !== false;

  if (recommended) {
    for (const department of DEFAULT_DEPARTMENTS) {
      await store.department.upsert({
        where: { id: department.id },
        update: {
          name: department.name,
          code: department.code,
          description: department.description,
          parentId: department.parentId,
          managerId: department.managerId,
          memberCount: department.memberCount,
          sortOrder: department.sortOrder || 0,
          isActive: department.isActive,
        },
        create: {
          ...department,
          sortOrder: department.sortOrder || 0,
          createdAt: new Date(department.createdAt),
          updatedAt: new Date(department.updatedAt),
        },
      });
    }

    for (const position of DEFAULT_POSITIONS) {
      await store.position.upsert({
        where: { id: position.id },
        update: {
          name: position.name,
          code: position.code,
          departmentId: position.departmentId,
          description: position.description,
          sortOrder: position.sortOrder,
          isActive: position.isActive,
        },
        create: {
          ...position,
          createdAt: new Date(position.createdAt),
          updatedAt: new Date(position.updatedAt),
        },
      });
    }
  }

  for (const role of DEFAULT_ROLES) {
    const departmentId = recommended ? role.departmentId : null;
    const data = {
      name: role.name,
      normalizedName: normalizeRoleNameForComparison(role.name),
      code: role.code,
      description: role.description,
      departmentId,
      permissions: role.permissions,
      dataScopes: role.dataScopes || {},
      memberCount: role.code === 'super_admin' && hasAdmin ? 1 : 0,
      isActive: role.isActive,
    };
    await store.role.upsert({
      where: { id: role.id },
      update: data,
      create: {
        id: role.id,
        ...data,
        createdAt: new Date(role.createdAt),
        updatedAt: new Date(role.updatedAt),
      },
    });
  }

  if (options.companyName) {
    await putStorage(store, STORAGE_KEYS.ORGANIZATION_PROFILE, { companyName: options.companyName });
  }
  await putStorage(store, STORAGE_KEYS.ORDER_TYPE_CONFIGS, DEFAULT_ORDER_TYPE_CONFIGS);
  await putStorage(store, STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS, DEFAULT_LIFECYCLE_STATUS_CONFIGS);
  await putStorage(store, STORAGE_KEYS.LEAD_FLOW_CONFIG, DEFAULT_LEAD_FLOW_CONFIG);
  await putStorage(store, STORAGE_KEYS.LEAD_SOURCE_CONFIGS, DEFAULT_LEAD_SOURCE_CONFIGS);
  await putStorage(store, STORAGE_KEYS.FINANCE, { dailyRecords: [], channelROI: [] });
  for (const key of EMPTY_ARRAY_KEYS) await putStorage(store, key, []);
  const migratedAt = new Date().toISOString();
  await putStorage(store, ROLE_PERMISSION_ACTION_BASELINE_KEY, {
    version: ROLE_PERMISSION_ACTION_BASELINE_VERSION,
    migratedAt,
  });
  await putStorage(store, CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY, {
    version: CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION,
    migratedAt,
    migratedRoleCount: 0,
    manifestChecksum: 'fresh-installation',
  });
  if (options.markInitialized !== false) await putStorage(store, STORAGE_KEYS.INITIALIZED, true);
}
