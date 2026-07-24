import { createHmac, timingSafeEqual } from 'node:crypto';

const WECHAT_CUSTOMER_PRECHECK_VERSION = 1;
export const WECHAT_CUSTOMER_PRECHECK_TOKEN_TTL_MS = 10 * 60 * 1_000;

export type WechatAutomationConfig = {
  token: string;
  actorAccount: string;
  signingKey: string;
};

export type WechatCustomerPrecheckTokenPayload = {
  version: number;
  actorId: string;
  senderIdHash: string;
  inputHash: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
};

export type WechatCustomerPrecheckTokenInput = Pick<
  WechatCustomerPrecheckTokenPayload,
  'actorId' | 'senderIdHash' | 'inputHash' | 'nonce'
>;

function readEnv(env: NodeJS.ProcessEnv, name: string): string {
  return String(env[name] || '').trim();
}

function assertStrongSecret(value: string, name: string): void {
  if (value.length < 32) throw new Error(`${name} must be at least 32 characters.`);
}

function assertSigningKey(signingKey: string): void {
  assertStrongSecret(String(signingKey || '').trim(), 'JIXIANG_WECHAT_AUTOMATION_SIGNING_KEY');
}

function invalidPrecheckToken(): never {
  throw new Error('WeChat customer precheck token is invalid or expired.');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseTokenPayload(value: unknown): WechatCustomerPrecheckTokenPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidPrecheckToken();
  const payload = value as Record<string, unknown>;
  const expectedKeys = ['actorId', 'expiresAt', 'inputHash', 'issuedAt', 'nonce', 'senderIdHash', 'version'];
  const actualKeys = Object.keys(payload).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    return invalidPrecheckToken();
  }
  if (
    payload.version !== WECHAT_CUSTOMER_PRECHECK_VERSION
    || !isNonEmptyString(payload.actorId)
    || !isNonEmptyString(payload.senderIdHash)
    || !/^[a-f0-9]{64}$/.test(payload.senderIdHash)
    || !isNonEmptyString(payload.inputHash)
    || !/^[a-f0-9]{64}$/.test(payload.inputHash)
    || !isNonEmptyString(payload.nonce)
    || !isNonEmptyString(payload.issuedAt)
    || !isNonEmptyString(payload.expiresAt)
  ) return invalidPrecheckToken();

  const issuedAt = new Date(payload.issuedAt);
  const expiresAt = new Date(payload.expiresAt);
  if (
    Number.isNaN(issuedAt.getTime())
    || Number.isNaN(expiresAt.getTime())
    || issuedAt.toISOString() !== payload.issuedAt
    || expiresAt.toISOString() !== payload.expiresAt
    || expiresAt.getTime() - issuedAt.getTime() !== WECHAT_CUSTOMER_PRECHECK_TOKEN_TTL_MS
  ) return invalidPrecheckToken();

  return {
    version: payload.version,
    actorId: payload.actorId,
    senderIdHash: payload.senderIdHash,
    inputHash: payload.inputHash,
    nonce: payload.nonce,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  };
}

function signTokenPayload(encodedPayload: string, signingKey: string): Buffer {
  return createHmac('sha256', signingKey).update(encodedPayload, 'utf8').digest();
}

export function readWechatAutomationConfig(env: NodeJS.ProcessEnv = process.env): WechatAutomationConfig | null {
  const token = readEnv(env, 'JIXIANG_WECHAT_AUTOMATION_TOKEN');
  const actorAccount = readEnv(env, 'JIXIANG_WECHAT_AUTOMATION_ACTOR_ACCOUNT');
  const signingKey = readEnv(env, 'JIXIANG_WECHAT_AUTOMATION_SIGNING_KEY');
  const configured = [token, actorAccount, signingKey].filter(Boolean).length;
  if (!configured) return null;
  if (configured !== 3) {
    throw new Error('JIXIANG_WECHAT_AUTOMATION_TOKEN, JIXIANG_WECHAT_AUTOMATION_ACTOR_ACCOUNT, and JIXIANG_WECHAT_AUTOMATION_SIGNING_KEY must be configured together.');
  }
  assertStrongSecret(token, 'JIXIANG_WECHAT_AUTOMATION_TOKEN');
  assertStrongSecret(signingKey, 'JIXIANG_WECHAT_AUTOMATION_SIGNING_KEY');
  return { token, actorAccount, signingKey };
}

/** Production treats this optional integration as an explicit allowlist: absent configuration disables startup. */
export function validateWechatAutomationRuntimeConfig(env: NodeJS.ProcessEnv = process.env): WechatAutomationConfig | null {
  const config = readWechatAutomationConfig(env);
  if (readEnv(env, 'NODE_ENV') === 'production' && !config) {
    throw new Error('JIXIANG_WECHAT_AUTOMATION_TOKEN, JIXIANG_WECHAT_AUTOMATION_ACTOR_ACCOUNT, and JIXIANG_WECHAT_AUTOMATION_SIGNING_KEY must be configured together before running jixiangOS in production.');
  }
  return config;
}

export function authenticateWechatAutomationToken(provided: string | null | undefined, configured: string | null | undefined): boolean {
  if (typeof provided !== 'string' || typeof configured !== 'string') return false;
  const providedBytes = Buffer.from(provided, 'utf8');
  const configuredBytes = Buffer.from(configured, 'utf8');
  return providedBytes.length === configuredBytes.length && timingSafeEqual(providedBytes, configuredBytes);
}

export function issueWechatCustomerPrecheckToken(
  input: WechatCustomerPrecheckTokenInput,
  signingKey: string,
  now: Date = new Date(),
): string {
  assertSigningKey(signingKey);
  const issuedAt = new Date(now);
  if (Number.isNaN(issuedAt.getTime())) throw new Error('WeChat customer precheck issuance time is invalid.');
  const payload = parseTokenPayload({
    version: WECHAT_CUSTOMER_PRECHECK_VERSION,
    actorId: input?.actorId,
    senderIdHash: input?.senderIdHash,
    inputHash: input?.inputHash,
    nonce: input?.nonce,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + WECHAT_CUSTOMER_PRECHECK_TOKEN_TTL_MS).toISOString(),
  });
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encodedPayload}.${signTokenPayload(encodedPayload, signingKey).toString('base64url')}`;
}

export function verifyWechatCustomerPrecheckToken(
  token: string,
  signingKey: string,
  now: Date = new Date(),
): WechatCustomerPrecheckTokenPayload {
  assertSigningKey(signingKey);
  const [encodedPayload, encodedSignature, ...extraParts] = String(token || '').split('.');
  if (
    extraParts.length
    || !encodedPayload
    || !encodedSignature
    || !/^[A-Za-z0-9_-]+$/.test(encodedPayload)
    || !/^[A-Za-z0-9_-]+$/.test(encodedSignature)
  ) return invalidPrecheckToken();

  const expectedSignature = signTokenPayload(encodedPayload, signingKey);
  const actualSignature = Buffer.from(encodedSignature, 'base64url');
  if (
    actualSignature.toString('base64url') !== encodedSignature
    || actualSignature.length !== expectedSignature.length
    || !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return invalidPrecheckToken();
  }

  let payload: WechatCustomerPrecheckTokenPayload;
  try {
    payload = parseTokenPayload(JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')));
  } catch {
    return invalidPrecheckToken();
  }
  const verificationTime = new Date(now);
  if (Number.isNaN(verificationTime.getTime()) || new Date(payload.expiresAt).getTime() <= verificationTime.getTime()) {
    return invalidPrecheckToken();
  }
  return payload;
}
