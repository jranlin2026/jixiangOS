import { createHash } from 'node:crypto';
import { z } from 'zod';

export type CustomerInput = {
  name?: string;
  company?: string;
  phone?: string;
  wechat?: string;
  leadSource?: string;
  sourceName?: string;
  sourceType?: string;
  ownerAccount?: string;
  ownerName?: string;
  leadContributorAccount?: string;
  industry?: string;
  city?: string;
  tagNames?: string[];
  remark?: string;
};

export type JixiangOsConfig = {
  apiBase: string;
  automationToken: string;
  senderId: string;
  detailUrlTemplate: string;
  requestTimeoutMs: number;
};

export const CUSTOMER_FIELD_LIMITS = {
  text: 500,
  remark: 2_000,
  tagName: 100,
  tagCount: 50,
  precheckToken: 4_096,
  id: 128,
} as const;

export type WechatCheckResult =
  | { status: 'needs_input'; field: string; message: string; candidates?: Array<{ account: string; name: string }> }
  | { status: 'duplicate'; message: string; customer?: CustomerSummary }
  | { status: 'ready'; normalized: Record<string, unknown>; precheckToken: string; expiresAt: string };

export type CustomerSummary = { id: string; name: string; company: string; owner: string };

export type WechatCreateResult =
  | { status: 'created' | 'replayed'; customer: CustomerSummary; detailPath: string }
  | { status: 'duplicate'; message: string; customer?: CustomerSummary };

type ApiEnvelope<T> = { code: number; data: T | null; message: string };
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const CUSTOMER_ID = new RegExp(`^[A-Za-z0-9_-]{1,${CUSTOMER_FIELD_LIMITS.id}}$`);
const nonBlank = (max: number) => z.string().min(1).max(max).refine((value) => value.trim().length > 0);

const customerSummarySchema = z.object({
  id: z.string().regex(CUSTOMER_ID),
  name: nonBlank(CUSTOMER_FIELD_LIMITS.text),
  company: z.string().max(CUSTOMER_FIELD_LIMITS.text),
  owner: nonBlank(CUSTOMER_FIELD_LIMITS.text),
}).strict();

const normalizedCustomerSchema = z.object({
  name: nonBlank(CUSTOMER_FIELD_LIMITS.text),
  company: z.string().max(CUSTOMER_FIELD_LIMITS.text),
  phone: nonBlank(CUSTOMER_FIELD_LIMITS.text).optional(),
  wechat: nonBlank(CUSTOMER_FIELD_LIMITS.text).optional(),
  leadSource: nonBlank(CUSTOMER_FIELD_LIMITS.text),
  sourceName: nonBlank(CUSTOMER_FIELD_LIMITS.text).optional(),
  sourceType: z.enum(['公司资源', '个人资源']),
  ownerAccount: nonBlank(CUSTOMER_FIELD_LIMITS.text),
  ownerName: nonBlank(CUSTOMER_FIELD_LIMITS.text),
  leadContributorAccount: nonBlank(CUSTOMER_FIELD_LIMITS.text).optional(),
  leadContributorName: nonBlank(CUSTOMER_FIELD_LIMITS.text).optional(),
  industry: nonBlank(CUSTOMER_FIELD_LIMITS.text).optional(),
  city: nonBlank(CUSTOMER_FIELD_LIMITS.text).optional(),
  tagNames: z.array(nonBlank(CUSTOMER_FIELD_LIMITS.tagName)).max(CUSTOMER_FIELD_LIMITS.tagCount),
  remark: nonBlank(CUSTOMER_FIELD_LIMITS.remark).optional(),
}).strict();

const checkResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('needs_input'),
    field: nonBlank(100),
    message: nonBlank(500),
    candidates: z.array(z.object({
      account: nonBlank(CUSTOMER_FIELD_LIMITS.text),
      name: nonBlank(CUSTOMER_FIELD_LIMITS.text),
    }).strict()).optional(),
  }).strict(),
  z.object({
    status: z.literal('duplicate'),
    message: nonBlank(500),
    customer: customerSummarySchema.optional(),
  }).strict(),
  z.object({
    status: z.literal('ready'),
    normalized: normalizedCustomerSchema,
    precheckToken: nonBlank(CUSTOMER_FIELD_LIMITS.precheckToken),
    expiresAt: z.string().datetime({ offset: true }),
  }).strict(),
]);

const completedCreateResultSchema = z.object({
    status: z.enum(['created', 'replayed']),
    customer: customerSummarySchema,
    detailPath: z.string()
      .max('/customers/'.length + CUSTOMER_FIELD_LIMITS.id)
      .regex(new RegExp(`^/customers/[A-Za-z0-9_-]{1,${CUSTOMER_FIELD_LIMITS.id}}$`)),
  }).strict().refine(
    (value) => value.detailPath === `/customers/${value.customer.id}`,
    { path: ['detailPath'], message: 'detail path does not match customer' },
  );

const createResultSchema = z.union([
  completedCreateResultSchema,
  z.object({
    status: z.literal('duplicate'),
    message: nonBlank(500),
    customer: customerSummarySchema.optional(),
  }).strict(),
]);

export class JixiangOsToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JixiangOsToolError';
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const CONTACT_LIKE = /\b(?:\+?\d[\d -]{6,}\d|[A-Za-z][A-Za-z0-9_-]{2,})\b/g;

function required(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} 未配置`);
  return trimmed;
}

function safeApiBase(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('JIXIANG_OS_API_BASE 必须是有效 URL');
  }
  const isLoopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new Error('JIXIANG_OS_API_BASE 必须使用 HTTPS（本机开发环境除外）');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('JIXIANG_OS_API_BASE 格式无效');
  }
  return url.origin;
}

function safeTemplate(value: string): string {
  const template = required(value, 'JIXIANG_OS_CUSTOMER_DETAIL_URL_TEMPLATE');
  if (!template.includes('{detailPath}')) {
    throw new Error('JIXIANG_OS_CUSTOMER_DETAIL_URL_TEMPLATE 必须包含 {detailPath}');
  }
  const candidate = template.replace('{detailPath}', '/customers/customer-1');
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))) {
      throw new Error('invalid protocol');
    }
    if (url.username || url.password) throw new Error('credentials are not allowed');
  } catch {
    throw new Error('JIXIANG_OS_CUSTOMER_DETAIL_URL_TEMPLATE 格式无效');
  }
  return template;
}

export function validateConfig(config: JixiangOsConfig): JixiangOsConfig {
  const timeout = Number(config.requestTimeoutMs);
  if (!Number.isFinite(timeout) || !Number.isInteger(timeout) || timeout < 100 || timeout > 60_000) {
    throw new Error('JIXIANG_OS_REQUEST_TIMEOUT_MS 必须是 100 到 60000 的整数');
  }
  return {
    apiBase: safeApiBase(required(config.apiBase, 'JIXIANG_OS_API_BASE')),
    automationToken: required(config.automationToken, 'JIXIANG_OS_AUTOMATION_TOKEN'),
    senderId: required(config.senderId, 'JIXIANG_OS_WECHAT_SENDER_ID'),
    detailUrlTemplate: safeTemplate(config.detailUrlTemplate),
    requestTimeoutMs: timeout,
  };
}

export function configFromEnvironment(env: NodeJS.ProcessEnv = process.env): JixiangOsConfig {
  return validateConfig({
    apiBase: env.JIXIANG_OS_API_BASE || '',
    automationToken: env.JIXIANG_OS_AUTOMATION_TOKEN || '',
    senderId: env.JIXIANG_OS_WECHAT_SENDER_ID || '',
    detailUrlTemplate: env.JIXIANG_OS_CUSTOMER_DETAIL_URL_TEMPLATE || '',
    requestTimeoutMs: Number(env.JIXIANG_OS_REQUEST_TIMEOUT_MS || ''),
  });
}

export function redactDiagnostic(value: unknown): string {
  return String(value ?? '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(CONTACT_LIKE, '[REDACTED]')
    .slice(0, 160);
}

function fingerprint(customer: CustomerInput): string {
  const ordered = Object.fromEntries(Object.entries(customer).sort(([left], [right]) => left.localeCompare(right)));
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return Boolean(value && typeof value === 'object'
    && typeof (value as { code?: unknown }).code === 'number'
    && typeof (value as { message?: unknown }).message === 'string'
    && 'data' in (value as Record<string, unknown>));
}

function failureMessage(status: number, operation: 'check' | 'create'): string {
  if (operation === 'create' && (status >= 500 || status === 0)) return '创建请求结果不确定，请先核验客户是否已存在；未写入系统';
  if (status === 400) return '请求参数无效，请补充或核对客户信息。';
  if (status === 401) return '认证失败，请检查自动化凭据后重试。';
  if (status === 403) return '当前自动化账号没有创建客户权限。';
  if (status === 409) return '客户已存在或预检已失效，请重新核验。';
  if (status === 503) return '系统暂时不可用，请稍后重试。';
  return '系统响应异常，请稍后重试。';
}

export function renderCustomerDetailUrl(
  template: string,
  result: { detailPath?: string; customer?: { id?: string }; id?: string },
): string | null {
  const id = result.customer?.id || result.id || '';
  const detailPath = result.detailPath || '';
  const expectedPath = CUSTOMER_ID.test(id) ? `/customers/${encodeURIComponent(id)}` : '';
  if (!expectedPath || detailPath !== expectedPath) return null;
  const url = template.replace('{detailPath}', expectedPath);
  try {
    const parsed = new URL(url);
    return parsed.pathname === expectedPath && !parsed.search && !parsed.hash ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export class JixiangOsWechatClient {
  private readonly config: JixiangOsConfig;
  private readonly fetchImpl: FetchLike;
  private lastReady: { fingerprint: string; precheckToken: string } | null = null;

  constructor(config: JixiangOsConfig, dependencies: { fetch?: FetchLike } = {}) {
    this.config = validateConfig(config);
    this.fetchImpl = dependencies.fetch || fetch;
  }

  async check(customer: CustomerInput): Promise<WechatCheckResult> {
    this.lastReady = null;
    const data = await this.post<WechatCheckResult>('check', { customer });
    if (data.status === 'ready') this.lastReady = { fingerprint: fingerprint(customer), precheckToken: data.precheckToken };
    return data;
  }

  async create(customer: CustomerInput, precheckToken: string): Promise<WechatCreateResult> {
    if (!precheckToken || !this.lastReady
      || this.lastReady.fingerprint !== fingerprint(customer)
      || this.lastReady.precheckToken !== precheckToken) {
      throw new JixiangOsToolError('预检凭据与本次客户信息不匹配，请先重新核验。');
    }
    return this.post<WechatCreateResult>('create', { customer, precheckToken });
  }

  private async post<T>(operation: 'check' | 'create', body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const response = await this.fetchImpl(`${this.config.apiBase}/api/automation/wechat/customers/${operation}`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${this.config.automationToken}`,
          'X-JXOS-WECHAT-SENDER': this.config.senderId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new JixiangOsToolError(failureMessage(0, operation));
      }
      if (!isEnvelope(payload)) throw new JixiangOsToolError(failureMessage(0, operation));
      if (!response.ok || payload.code !== 0 || !payload.data) {
        throw new JixiangOsToolError(failureMessage(response.status >= 400 ? response.status : payload.code, operation));
      }
      const parsed = operation === 'check'
        ? checkResultSchema.safeParse(payload.data)
        : createResultSchema.safeParse(payload.data);
      if (!parsed.success) throw new JixiangOsToolError(failureMessage(0, operation));
      return parsed.data as T;
    } catch (error) {
      if (error instanceof JixiangOsToolError) throw error;
      if (operation === 'create') throw new JixiangOsToolError('创建请求结果不确定，请先核验客户是否已存在；未写入系统');
      throw new JixiangOsToolError('网络异常，请稍后重新核验。');
    } finally {
      clearTimeout(timer);
    }
  }
}
