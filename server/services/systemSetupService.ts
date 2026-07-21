import { timingSafeEqual } from 'node:crypto';
import { failure, success, type ApiResponse } from '../api/response';

export type SystemInstallationState = 'UNINITIALIZED' | 'INITIALIZING' | 'ACTIVE' | 'RESETTING' | 'FAILED';
export type OrganizationTemplate = 'minimal' | 'recommended';

export interface SystemInstallationRecord {
  id: string;
  installationId: string;
  state: SystemInstallationState;
  setupVersion: number;
  companyName: string | null;
  initializedAt: Date | null;
  lastError: string | null;
}

export interface SystemSetupInitializeInput {
  setupToken: string;
  companyName: string;
  adminName: string;
  adminAccount: string;
  adminEmail: string;
  adminPhone: string;
  adminPassword: string;
  organizationTemplate: OrganizationTemplate;
  includeDemoData: boolean;
}

export type PersistedSystemSetupInput = Omit<SystemSetupInitializeInput, 'setupToken'>;

export interface SystemSetupStatus {
  state: SystemInstallationState;
  initialized: boolean;
  setupAvailable: boolean;
  setupVersion: number;
  companyName: string | null;
}

export interface SystemSetupRepository {
  resolve(): Promise<SystemInstallationRecord>;
  initialize(input: PersistedSystemSetupInput): Promise<SystemInstallationRecord>;
}

interface SystemSetupServiceOptions {
  repository: SystemSetupRepository;
  setupToken?: string;
  onError?: (error: unknown) => void;
}

function statusFromRecord(record: SystemInstallationRecord, setupToken: string): SystemSetupStatus {
  return {
    state: record.state,
    initialized: record.state === 'ACTIVE',
    setupAvailable: ['UNINITIALIZED', 'FAILED'].includes(record.state) && setupToken.length > 0,
    setupVersion: record.setupVersion,
    companyName: record.state === 'ACTIVE' ? record.companyName : null,
  };
}

function sameSecret(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

function cleanRequired(value: unknown, label: string, maxLength: number): string {
  const cleaned = String(value || '').trim();
  if (!cleaned) throw Object.assign(new Error(`${label}不能为空`), { statusCode: 400 });
  if (cleaned.length > maxLength) throw Object.assign(new Error(`${label}不能超过${maxLength}个字符`), { statusCode: 400 });
  return cleaned;
}

function normalizeInput(input: SystemSetupInitializeInput): PersistedSystemSetupInput {
  const companyName = cleanRequired(input.companyName, '企业名称', 100);
  const adminName = cleanRequired(input.adminName, '管理员姓名', 100);
  const adminAccount = cleanRequired(input.adminAccount, '管理员账号', 100).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,99}$/.test(adminAccount)) {
    throw Object.assign(new Error('管理员账号只能使用字母、数字、点、下划线或短横线，且至少3位'), { statusCode: 400 });
  }
  const adminEmail = cleanRequired(input.adminEmail, '管理员邮箱', 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw Object.assign(new Error('管理员邮箱格式不正确'), { statusCode: 400 });
  }
  const adminPhone = String(input.adminPhone || '').trim();
  if (adminPhone.length > 50) throw Object.assign(new Error('管理员手机号不能超过50个字符'), { statusCode: 400 });
  const adminPassword = String(input.adminPassword || '');
  if (adminPassword.length < 10 || !/[A-Za-z]/.test(adminPassword) || !/\d/.test(adminPassword)) {
    throw Object.assign(new Error('管理员密码至少10位，且必须同时包含字母和数字'), { statusCode: 400 });
  }
  if (!['minimal', 'recommended'].includes(input.organizationTemplate)) {
    throw Object.assign(new Error('组织架构模板不正确'), { statusCode: 400 });
  }
  if (typeof input.includeDemoData !== 'boolean') {
    throw Object.assign(new Error('演示数据开关必须是布尔值'), { statusCode: 400 });
  }
  return {
    companyName,
    adminName,
    adminAccount,
    adminEmail,
    adminPhone,
    adminPassword,
    organizationTemplate: input.organizationTemplate,
    includeDemoData: input.includeDemoData,
  };
}

function errorResponse<T>(error: unknown): ApiResponse<T | null> {
  const statusCode = Number((error as { statusCode?: unknown } | null)?.statusCode);
  const message = Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 && error instanceof Error
    ? error.message
    : '系统初始化失败';
  return failure<T>(message, Number.isInteger(statusCode) && statusCode >= 400 ? statusCode : 500);
}

export function createSystemSetupService(options: SystemSetupServiceOptions) {
  const configuredToken = String(options.setupToken || '').trim();
  const setupToken = configuredToken.length >= 32 ? configuredToken : '';

  return {
    async status(): Promise<ApiResponse<SystemSetupStatus | null>> {
      try {
        return success(statusFromRecord(await options.repository.resolve(), setupToken));
      } catch (error) {
        options.onError?.(error);
        return errorResponse<SystemSetupStatus>(error);
      }
    },

    async initialize(input: SystemSetupInitializeInput): Promise<ApiResponse<SystemSetupStatus | null>> {
      try {
        const current = await options.repository.resolve();
        if (current.state === 'ACTIVE') return failure<SystemSetupStatus>('系统已经初始化', 409);
        if (current.state === 'INITIALIZING' || current.state === 'RESETTING') {
          return failure<SystemSetupStatus>('系统正在执行维护操作，请稍后再试', 409);
        }
        if (!setupToken) return failure<SystemSetupStatus>('服务器尚未配置初始化码', 503);
        if (!sameSecret(String(input.setupToken || ''), setupToken)) {
          return failure<SystemSetupStatus>('初始化码不正确', 401);
        }
        const record = await options.repository.initialize(normalizeInput(input));
        return success(statusFromRecord(record, ''));
      } catch (error) {
        options.onError?.(error);
        return errorResponse<SystemSetupStatus>(error);
      }
    },
  };
}

export type SystemSetupService = ReturnType<typeof createSystemSetupService>;
