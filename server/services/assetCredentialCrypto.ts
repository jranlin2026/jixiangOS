import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export interface AssetEncryptedCredential {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: 1;
  keyId: 'asset-v1' | 'contact-v1' | 'local-v1';
}

export interface AssetCredentialCrypto {
  encrypt(value: string, context: string): AssetEncryptedCredential;
  decrypt(value: AssetEncryptedCredential, context: string): string;
}

function decodeKey(value: string): Buffer {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length < 32) throw new Error('ASSET_CREDENTIAL_ENCRYPTION_KEY must contain at least 32 bytes.');
  return decoded;
}

export function createAssetCredentialCrypto(env: NodeJS.ProcessEnv = process.env): AssetCredentialCrypto {
  const assetKey = String(env.ASSET_CREDENTIAL_ENCRYPTION_KEY || '').trim();
  const contactKey = String(env.CONTACT_IDENTITY_ENCRYPTION_KEY || '').trim();
  if (!assetKey && !contactKey && env.NODE_ENV === 'production') {
    throw new Error('ASSET_CREDENTIAL_ENCRYPTION_KEY must be configured in production.');
  }
  const localKey = Buffer.from('jixiangos-local-credential-key-only-do-not-use-in-production', 'utf8');
  const keys = new Map<AssetEncryptedCredential['keyId'], Buffer>();
  if (assetKey) keys.set('asset-v1', decodeKey(assetKey));
  if (contactKey) keys.set('contact-v1', decodeKey(contactKey));
  if (!keys.size) keys.set('local-v1', localKey);
  const activeKeyId: AssetEncryptedCredential['keyId'] = assetKey ? 'asset-v1' : contactKey ? 'contact-v1' : 'local-v1';
  const derive = (sourceKey: Buffer) => Buffer.from(hkdfSync('sha256', sourceKey, Buffer.alloc(0), Buffer.from('jixiangos/asset-credential/v1'), 32));

  return {
    encrypt(value, context) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', derive(keys.get(activeKeyId)!), iv);
      cipher.setAAD(Buffer.from(context, 'utf8'));
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return {
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
        keyVersion: 1,
        keyId: activeKeyId,
      };
    },
    decrypt(value, context) {
      const sourceKey = keys.get(value.keyId);
      if (!sourceKey) throw new Error(`Credential encryption key ${value.keyId} is unavailable.`);
      const decipher = createDecipheriv('aes-256-gcm', derive(sourceKey), Buffer.from(value.iv, 'base64'));
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(Buffer.from(value.authTag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(value.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
