import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

const SNAPSHOT_FORMAT_VERSION = 1;
const SNAPSHOT_AAD_PREFIX = 'jixiangos/customer-merge-snapshot';

export interface CustomerMergeSnapshotKeyring {
  activeVersion: number;
  keys: ReadonlyMap<number, Buffer>;
}

export interface SealedMergeSnapshot {
  value: string;
  keyVersion: number;
}

function parsePositiveVersion(value: unknown, label: string): number {
  const version = Number(String(value ?? '').trim());
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return version;
}

function decodeKey(value: unknown, version: number): Buffer {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error(`CUSTOMER_MERGE_SNAPSHOT_KEYS_JSON version ${version} is empty.`);
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== raw.replace(/=+$/, '')) {
    throw new Error(`Customer merge snapshot key version ${version} must decode to exactly 32 bytes.`);
  }
  return key;
}

export function createCustomerMergeSnapshotKeyringFromEnv(
  env: NodeJS.ProcessEnv,
): CustomerMergeSnapshotKeyring {
  const activeVersion = parsePositiveVersion(
    env.CUSTOMER_MERGE_SNAPSHOT_ACTIVE_KEY_VERSION,
    'CUSTOMER_MERGE_SNAPSHOT_ACTIVE_KEY_VERSION',
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(env.CUSTOMER_MERGE_SNAPSHOT_KEYS_JSON || ''));
  } catch {
    throw new Error('CUSTOMER_MERGE_SNAPSHOT_KEYS_JSON must be a JSON object of base64 keys.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('CUSTOMER_MERGE_SNAPSHOT_KEYS_JSON must be a JSON object of base64 keys.');
  }
  const keys = new Map<number, Buffer>();
  for (const [rawVersion, value] of Object.entries(parsed)) {
    const version = parsePositiveVersion(rawVersion, 'Customer merge snapshot key version');
    if (keys.has(version)) throw new Error(`Duplicate customer merge snapshot key version ${version}.`);
    keys.set(version, decodeKey(value, version));
  }
  if (!keys.has(activeVersion)) {
    throw new Error(`CUSTOMER_MERGE_SNAPSHOT_ACTIVE_KEY_VERSION ${activeVersion} is missing from the keyring.`);
  }
  return { activeVersion, keys };
}

function aad(keyVersion: number): Buffer {
  return Buffer.from(`${SNAPSHOT_AAD_PREFIX}/v${SNAPSHOT_FORMAT_VERSION}/k${keyVersion}`, 'utf8');
}

export function sealMergeSnapshot(
  payload: unknown,
  keyring: CustomerMergeSnapshotKeyring,
): SealedMergeSnapshot {
  const keyVersion = keyring.activeVersion;
  const key = keyring.keys.get(keyVersion);
  if (!key) throw new Error(`MERGE_SNAPSHOT_KEY_VERSION_UNKNOWN:${keyVersion}`);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad(keyVersion));
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  plaintext.fill(0);
  return {
    keyVersion,
    value: [
      'cms',
      `v${SNAPSHOT_FORMAT_VERSION}`,
      nonce.toString('base64url'),
      ciphertext.toString('base64url'),
      authTag.toString('base64url'),
    ].join(':'),
  };
}

export function openMergeSnapshot<T = unknown>(
  value: string,
  keyVersion: number,
  keyring: CustomerMergeSnapshotKeyring,
): T {
  const key = keyring.keys.get(keyVersion);
  if (!key) throw new Error(`MERGE_SNAPSHOT_KEY_VERSION_UNKNOWN:${keyVersion}`);
  const [prefix, format, nonceRaw, ciphertextRaw, tagRaw, ...rest] = String(value || '').split(':');
  if (prefix !== 'cms' || format !== `v${SNAPSHOT_FORMAT_VERSION}` || rest.length) {
    throw new Error('MERGE_SNAPSHOT_FORMAT_INVALID');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonceRaw, 'base64url'));
    decipher.setAAD(aad(keyVersion));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
      decipher.final(),
    ]);
    try {
      return JSON.parse(plaintext.toString('utf8')) as T;
    } finally {
      plaintext.fill(0);
    }
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('MERGE_SNAPSHOT_PAYLOAD_INVALID');
    throw new Error('MERGE_SNAPSHOT_AUTHENTICATION_FAILED');
  }
}
