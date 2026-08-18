import assert from 'node:assert/strict';
import { createAssetCredentialCrypto } from './assetCredentialCrypto';

const crypto = createAssetCredentialCrypto({ NODE_ENV: 'test' });
const encrypted = crypto.encrypt('secret-value', 'account-1:loginPassword');

assert.equal(crypto.decrypt(encrypted, 'account-1:loginPassword'), 'secret-value');
assert.throws(() => crypto.decrypt(encrypted, 'account-2:loginPassword'));
assert.throws(() => crypto.decrypt(encrypted, 'account-1:paymentPassword'));
assert.equal(JSON.stringify(encrypted).includes('secret-value'), false);
