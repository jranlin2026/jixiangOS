import type { Timestamp } from './common';
import type { Permission } from './role';
import type { User, UserRole } from './settings';

export interface AuthenticatedUser {
  id: string;
  name: string;
  account: string;
  email: string;
  phone: string;
  role: UserRole;
  roleId?: string;
  positionId?: string;
  positionName?: string;
  avatar?: string;
  departmentId?: string;
  permissions: Permission[];
  isActive: boolean;
  lastLoginAt?: Timestamp;
  mustChangePassword?: boolean;
}

export interface LoginPayload {
  account: string;
  password: string;
  remember: boolean;
}

export interface AuthSession {
  userId: string;
  token: string;
  remember: boolean;
  expiresAt?: Timestamp;
  createdAt: Timestamp;
}

export type UserWithAuth = User & {
  account: string;
  passwordHash: string;
  passwordSalt: string;
};
