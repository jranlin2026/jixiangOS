import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  authenticateWechatAutomationToken,
  issueWechatCustomerPrecheckToken,
  readWechatAutomationConfig,
  validateWechatAutomationRuntimeConfig,
  verifyWechatCustomerPrecheckToken,
  WECHAT_CUSTOMER_PRECHECK_TOKEN_TTL_MS,
} from './wechatAutomationSecurity';

const TOKEN = 'wechat-automation-token-that-is-at-least-32-characters';
const SIGNING_KEY = 'wechat-precheck-signing-key-that-is-at-least-32-characters';

assert.equal(readWechatAutomationConfig({}), null, 'local development may leave the optional integration disabled');

for (const partial of [
  { JIXIANG_WECHAT_AUTOMATION_TOKEN: TOKEN },
  { JIXIANG_WECHAT_AUTOMATION_ACTOR_ACCOUNT: 'wechat-automation' },
  { JIXIANG_WECHAT_AUTOMATION_SIGNING_KEY: SIGNING_KEY },
  {
    JIXIANG_WECHAT_AUTOMATION_TOKEN: TOKEN,
    JIXIANG_WECHAT_AUTOMATION_ACTOR_ACCOUNT: 'wechat-automation',
  },
  {
    JIXIANG_WECHAT_AUTOMATION_TOKEN: TOKEN,
    JIXIANG_WECHAT_AUTOMATION_SIGNING_KEY: SIGNING_KEY,
  },
  {
    JIXIANG_WECHAT_AUTOMATION_ACTOR_ACCOUNT: 'wechat-automation',
    JIXIANG_WECHAT_AUTOMATION_SIGNING_KEY: SIGNING_KEY,
  },
]) {
  assert.throws(() => readWechatAutomationConfig(partial), /must be configured together/i);
}

assert.throws(() => readWechatAutomationConfig({
  JIXIANG_WECHAT_AUTOMATION_TOKEN: 'too-short',
  JIXIANG_WECHAT_AUTOMATION_ACTOR_ACCOUNT: 'wechat-automation',
  JIXIANG_WECHAT_AUTOMATION_SIGNING_KEY: SIGNING_KEY,
}), /at least 32 characters/i);

assert.throws(() => readWechatAutomationConfig({
  JIXIANG_WECHAT_AUTOMATION_TOKEN: TOKEN,
  JIXIANG_WECHAT_AUTOMATION_ACTOR_ACCOUNT: 'wechat-automation',
  JIXIANG_WECHAT_AUTOMATION_SIGNING_KEY: 'too-short',
}), /at least 32 characters/i);

assert.deepEqual(readWechatAutomationConfig({
  JIXIANG_WECHAT_AUTOMATION_TOKEN: TOKEN,
  JIXIANG_WECHAT_AUTOMATION_ACTOR_ACCOUNT: '  wechat-automation  ',
  JIXIANG_WECHAT_AUTOMATION_SIGNING_KEY: SIGNING_KEY,
}), {
  token: TOKEN,
  actorAccount: 'wechat-automation',
  signingKey: SIGNING_KEY,
});

assert.equal(authenticateWechatAutomationToken(TOKEN, TOKEN), true);
assert.equal(authenticateWechatAutomationToken('wrong-token', TOKEN), false);
assert.equal(authenticateWechatAutomationToken(`${TOKEN}-extra`, TOKEN), false);
assert.equal(authenticateWechatAutomationToken(undefined, TOKEN), false);

assert.throws(
  () => validateWechatAutomationRuntimeConfig({ NODE_ENV: 'production' }),
  /JIXIANG_WECHAT_AUTOMATION_TOKEN/i,
  'production must fail closed when the optional integration is not fully configured',
);

const now = new Date('2026-07-25T00:00:00.000Z');
const tokenInput = {
  actorId: 'wechat-automation-user-id',
  senderIdHash: 'a'.repeat(64),
  inputHash: 'b'.repeat(64),
  nonce: 'request-nonce-1',
};
const precheckToken = issueWechatCustomerPrecheckToken(tokenInput, SIGNING_KEY, now);
const [encodedPayload, signature] = precheckToken.split('.');
assert.ok(encodedPayload && signature, 'precheck token uses a headerless base64url payload and signature');
assert.equal(precheckToken.split('.').length, 2, 'precheck token has no unverified header segment');
const decodedPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
assert.deepEqual(Object.keys(decodedPayload).sort(), [
  'actorId', 'expiresAt', 'inputHash', 'issuedAt', 'nonce', 'senderIdHash', 'version',
]);
assert.equal(decodedPayload.phone, undefined, 'contact fields must never be embedded in a precheck token');
assert.equal(decodedPayload.wechat, undefined, 'contact fields must never be embedded in a precheck token');
assert.deepEqual(verifyWechatCustomerPrecheckToken(precheckToken, SIGNING_KEY, now), {
  version: 1,
  ...tokenInput,
  issuedAt: now.toISOString(),
  expiresAt: new Date(now.getTime() + WECHAT_CUSTOMER_PRECHECK_TOKEN_TTL_MS).toISOString(),
});
assert.throws(
  () => verifyWechatCustomerPrecheckToken(precheckToken, SIGNING_KEY, new Date(now.getTime() + WECHAT_CUSTOMER_PRECHECK_TOKEN_TTL_MS)),
  /invalid or expired/i,
  'a ten-minute token expires at its exact expiry boundary',
);
assert.throws(
  () => verifyWechatCustomerPrecheckToken(`${encodedPayload}.${signature.slice(0, -1)}${signature.endsWith('x') ? 'y' : 'x'}`, SIGNING_KEY, now),
  /invalid or expired/i,
  'a modified signature is rejected',
);
const base64urlAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const finalSignatureCharacter = signature.at(-1)!;
const nonCanonicalFinalCharacter = base64urlAlphabet[(base64urlAlphabet.indexOf(finalSignatureCharacter) & 0b111100) | 0b01];
const nonCanonicalSignature = `${signature.slice(0, -1)}${nonCanonicalFinalCharacter}`;
assert.notEqual(nonCanonicalSignature, signature);
assert.deepEqual(
  Buffer.from(nonCanonicalSignature, 'base64url'),
  Buffer.from(signature, 'base64url'),
  'the alternate spelling deliberately decodes to the same signature bytes',
);
assert.throws(
  () => verifyWechatCustomerPrecheckToken(`${encodedPayload}.${nonCanonicalSignature}`, SIGNING_KEY, now),
  /invalid or expired/i,
  'non-canonical base64url signatures are rejected before signature comparison',
);
const changedBinding = issueWechatCustomerPrecheckToken({ ...tokenInput, inputHash: 'c'.repeat(64) }, SIGNING_KEY, now);
assert.notEqual(changedBinding, precheckToken, 'actor, sender, and input bindings are signed into the token');
assert.equal(verifyWechatCustomerPrecheckToken(changedBinding, SIGNING_KEY, now).inputHash, 'c'.repeat(64));
const changedActorBinding = issueWechatCustomerPrecheckToken({ ...tokenInput, actorId: 'another-automation-user-id' }, SIGNING_KEY, now);
assert.notEqual(changedActorBinding, precheckToken, 'actor identity is signed into the token');
assert.equal(verifyWechatCustomerPrecheckToken(changedActorBinding, SIGNING_KEY, now).actorId, 'another-automation-user-id');
const changedSenderBinding = issueWechatCustomerPrecheckToken({ ...tokenInput, senderIdHash: 'c'.repeat(64) }, SIGNING_KEY, now);
assert.notEqual(changedSenderBinding, precheckToken, 'sender identity hash is signed into the token');
assert.equal(verifyWechatCustomerPrecheckToken(changedSenderBinding, SIGNING_KEY, now).senderIdHash, 'c'.repeat(64));

const payloadWithContact = Buffer.from(JSON.stringify({ ...decodedPayload, phone: '13800138000' }), 'utf8').toString('base64url');
const signedPayloadWithContact = createHmac('sha256', SIGNING_KEY).update(payloadWithContact, 'utf8').digest('base64url');
assert.throws(
  () => verifyWechatCustomerPrecheckToken(`${payloadWithContact}.${signedPayloadWithContact}`, SIGNING_KEY, now),
  /invalid or expired/i,
  'signed payloads with unexpected contact fields are rejected by the strict schema',
);

const payloadWithMalformedHash = Buffer.from(JSON.stringify({ ...decodedPayload, inputHash: 'not-a-sha256-hash' }), 'utf8').toString('base64url');
const signedPayloadWithMalformedHash = createHmac('sha256', SIGNING_KEY).update(payloadWithMalformedHash, 'utf8').digest('base64url');
assert.throws(
  () => verifyWechatCustomerPrecheckToken(`${payloadWithMalformedHash}.${signedPayloadWithMalformedHash}`, SIGNING_KEY, now),
  /invalid or expired/i,
  'sender and input bindings must use SHA-256 hashes',
);

console.log('wechat automation security configuration tests passed');
