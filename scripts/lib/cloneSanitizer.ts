import { createHash } from 'node:crypto';

export const CLONE_DATABASE_NAME = 'jixiang_os_prod_clone_test';

export function assertSafeCloneDatabaseUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('DATABASE_URL 不是有效的数据库连接地址');
  }
  if (parsed.protocol !== 'mysql:') throw new Error('脱敏工具只支持 MySQL 克隆库');
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) throw new Error('脱敏工具只允许连接本机数据库');
  if (parsed.pathname.replace(/^\//, '') !== CLONE_DATABASE_NAME) throw new Error(`脱敏工具只允许处理 ${CLONE_DATABASE_NAME}`);
  return parsed;
}

const digest = (value: unknown) => createHash('sha256').update(String(value || 'missing')).digest('hex');
export const customerAlias = (id: unknown) => `测试客户-${digest(id).slice(0, 8)}`;
export const companyAlias = (id: unknown) => `测试企业-${digest(id).slice(0, 8)}`;
export const maskedPhone = (id: unknown) => `199${Number.parseInt(digest(id).slice(0, 8), 16).toString().padStart(8, '0').slice(-8)}`;
export const maskedEmail = (id: unknown) => `customer-${digest(id).slice(0, 12)}@example.invalid`;
export const maskedWechat = (id: unknown) => `wx_test_${digest(id).slice(0, 10)}`;

const PHONE_KEYS = new Set(['phone', 'mobile', 'customerPhone', 'contactPhone', 'phoneNumber']);
const EMAIL_KEYS = new Set(['email', 'customerEmail', 'contactEmail', 'boundEmail']);
const WECHAT_KEYS = new Set(['wechat', 'customerWechat', 'contactWechat']);
const ADDRESS_KEYS = new Set(['address', 'customerAddress', 'contactAddress', 'idCard', 'identityNo']);

export function sanitizeBusinessValue(value: unknown, stableId: string, customerNames: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item, index) => sanitizeBusinessValue(item, `${stableId}:${index}`, customerNames));
  if (!value || typeof value !== 'object') return value;
  const input = value as Record<string, unknown>;
  const customerId = String(input.customerId || stableId);
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(input)) {
    if (key === 'customerName') output[key] = customerNames.get(customerId) || customerAlias(customerId);
    else if (PHONE_KEYS.has(key)) output[key] = child ? maskedPhone(customerId) : child;
    else if (EMAIL_KEYS.has(key)) output[key] = child ? maskedEmail(customerId) : child;
    else if (WECHAT_KEYS.has(key)) output[key] = child ? maskedWechat(customerId) : child;
    else if (ADDRESS_KEYS.has(key)) output[key] = child ? '已脱敏' : child;
    else output[key] = sanitizeBusinessValue(child, `${stableId}:${key}`, customerNames);
  }
  return output;
}

export function sanitizeCustomerValue(value: unknown, recordId: string) {
  const input = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  return {
    ...sanitizeBusinessValue(input, recordId, new Map([[recordId, customerAlias(recordId)]])) as Record<string, unknown>,
    name: customerAlias(recordId),
    company: input.company ? companyAlias(recordId) : input.company,
  };
}
