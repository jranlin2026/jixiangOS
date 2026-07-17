import type { Permission, Role, RoleDataScopes } from '../../src/types/role';
import type { Department } from '../../src/types/department';
import type { Position } from '../../src/types/position';
import type { User } from '../../src/types/settings';
import {
  sanitizeAuditEventForViewer,
  type CustomerAuditEventView,
} from './customerAuditProjection';

type NullableDate = Date | string | null | undefined;

const iso = (value: NullableDate): string | undefined => {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const isoRequired = (value: Date | string): string => (
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()
);

const jsonArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);

const jsonObject = <T extends object>(value: unknown): T | undefined => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as T : undefined
);

export function mapPrismaDepartment(row: {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  parentId?: string | null;
  managerId?: string | null;
  memberCount: number;
  sortOrder?: number | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}): Department {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description || undefined,
    parentId: row.parentId || undefined,
    managerId: row.managerId || undefined,
    memberCount: row.memberCount,
    sortOrder: row.sortOrder ?? undefined,
    isActive: row.isActive,
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
  };
}

export function mapPrismaPosition(row: {
  id: string;
  name: string;
  code: string;
  departmentId: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}): Position {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    departmentId: row.departmentId || undefined,
    description: row.description || undefined,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
  };
}

export function mapPrismaRole(row: {
  id: string;
  name: string;
  code: string;
  description: string | null;
  departmentId: string | null;
  permissions: unknown;
  dataScopes: unknown;
  memberCount: number;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}): Role {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description || undefined,
    departmentId: row.departmentId || undefined,
    permissions: jsonArray<Permission>(row.permissions),
    dataScopes: jsonObject<RoleDataScopes>(row.dataScopes),
    memberCount: row.memberCount,
    isActive: row.isActive,
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
  };
}

export function mapPrismaUser(row: {
  id: string;
  name: string;
  account: string | null;
  email: string;
  phone: string;
  role: string;
  avatar: string | null;
  departmentId: string | null;
  positionId: string | null;
  positionName: string | null;
  roleId: string | null;
  passwordHash: string | null;
  passwordSalt: string | null;
  passwordUpdatedAt: NullableDate;
  mustChangePassword?: boolean;
  lastLoginAt: NullableDate;
  isActive: boolean;
  employmentStatus: string | null;
  leftAt: NullableDate;
  leftBy: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): User {
  return {
    id: row.id,
    name: row.name,
    account: row.account || undefined,
    email: row.email,
    phone: row.phone,
    role: row.role,
    avatar: row.avatar || undefined,
    departmentId: row.departmentId || undefined,
    positionId: row.positionId || undefined,
    positionName: row.positionName || undefined,
    roleId: row.roleId || undefined,
    mustChangePassword: Boolean(row.mustChangePassword),
    lastLoginAt: iso(row.lastLoginAt),
    isActive: row.isActive,
    employmentStatus: (row.employmentStatus || 'active') as User['employmentStatus'],
    leftAt: iso(row.leftAt),
    leftBy: row.leftBy || undefined,
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
  };
}

/**
 * Prisma represents BIGINT as JavaScript bigint. Map it at the persistence
 * boundary so an audit payload can always be passed to JSON.stringify safely.
 */
export function mapPrismaCustomerAuditEvent(row: {
  id: string;
  eventSequence: bigint | number | string;
  customerId: string;
  batchJobId: string | null;
  operation: string;
  actorId: string;
  actorName: string;
  reason: string | null;
  inputHash: string | null;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  result: string;
  requestId: string | null;
  idempotencyKey: string | null;
  ip: string | null;
  createdAt: Date | string;
}): CustomerAuditEventView {
  return sanitizeAuditEventForViewer(row);
}
