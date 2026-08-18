type CredentialType = 'loginPassword' | 'paymentPassword';
type StoredCredential = { id: string; iv: number[]; ciphertext: number[]; updatedAt: string };

const memorySecrets = new Map<string, string>();
const DB_NAME = 'jixiangos-asset-credential-v1';
const STORE = 'vault';
const KEY_ID = '__aes_key__';

function credentialId(accountId: string, type: CredentialType): string {
  return `${accountId}:${type}`;
}

async function openVault(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined' || !globalThis.crypto?.subtle) return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function encryptionKey(db: IDBDatabase): Promise<CryptoKey> {
  const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const getRequest = store.get(KEY_ID);
    let selected = candidate;
    getRequest.onsuccess = () => {
      const existing = getRequest.result as { id: string; key: CryptoKey } | undefined;
      if (existing?.key) {
        selected = existing.key;
        return;
      }
      store.put({ id: KEY_ID, key: candidate });
    };
    transaction.oncomplete = () => resolve(selected);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function saveLocalAssetCredential(accountId: string, type: CredentialType, secret: string, updatedAt: string): Promise<boolean> {
  const value = secret.trim();
  if (!value) return false;
  const id = credentialId(accountId, type);
  const db = await openVault();
  if (!db) {
    memorySecrets.set(id, value);
    return true;
  }
  const key = await encryptionKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(id) },
    key,
    new TextEncoder().encode(value),
  );
  const record: StoredCredential = { id, iv: [...iv], ciphertext: [...new Uint8Array(ciphertext)], updatedAt };
  await requestValue(db.transaction(STORE, 'readwrite').objectStore(STORE).put(record));
  db.close();
  return true;
}

export async function revealLocalAssetCredential(accountId: string, type: CredentialType): Promise<string | undefined> {
  const id = credentialId(accountId, type);
  const db = await openVault();
  if (!db) return memorySecrets.get(id);
  const record = await requestValue(db.transaction(STORE).objectStore(STORE).get(id)) as StoredCredential | undefined;
  if (!record) {
    db.close();
    return undefined;
  }
  const key = await encryptionKey(db);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(record.iv), additionalData: new TextEncoder().encode(id) },
    key,
    new Uint8Array(record.ciphertext),
  );
  db.close();
  return new TextDecoder().decode(plaintext);
}

export async function deleteLocalAssetCredentials(accountId: string, type?: CredentialType): Promise<void> {
  const ids = type ? [credentialId(accountId, type)] : [credentialId(accountId, 'loginPassword'), credentialId(accountId, 'paymentPassword')];
  ids.forEach((id) => memorySecrets.delete(id));
  const db = await openVault();
  if (!db) return;
  const transaction = db.transaction(STORE, 'readwrite');
  ids.forEach((id) => transaction.objectStore(STORE).delete(id));
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function hasLocalAssetCredential(accountId: string, type: CredentialType): Promise<boolean> {
  return (await revealLocalAssetCredential(accountId, type)) !== undefined;
}
