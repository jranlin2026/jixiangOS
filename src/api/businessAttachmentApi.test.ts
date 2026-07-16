import assert from 'node:assert/strict';
import type { BusinessAttachment } from '../types/businessAttachment';
import { businessAttachmentApi } from './businessAttachmentApi';

const attachment: BusinessAttachment = {
  id: 'attachment-1',
  name: 'chat.png',
  mimeType: 'image/png',
  size: 3,
  category: 'order-deal-evidence',
  uploadedById: 'user-1',
  uploadedByName: '员工',
  uploadedAt: '2026-07-16T14:00:00.000Z',
};

const storage = new Map<string, string>([['aaos_backend_auth_token', 'token-1']]);
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});

const calls: Array<{ url: string; init?: RequestInit }> = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  return new Response(JSON.stringify({ code: 0, data: attachment, message: 'success' }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
};

const file = new File(['png'], 'chat.png', { type: 'image/png' });
const uploaded = await businessAttachmentApi.upload(file, {
  draftKey: 'draft-1',
  category: 'order-deal-evidence',
});
assert.equal(uploaded.code, 0);
assert.equal(calls[0].init?.method, 'POST');
const headers = new Headers(calls[0].init?.headers);
assert.equal(headers.get('Authorization'), 'Bearer token-1');
assert.equal(headers.get('X-Draft-Key'), 'draft-1');
assert.equal(headers.get('X-Attachment-Category'), 'order-deal-evidence');
assert.equal(headers.get('X-File-Name'), encodeURIComponent('chat.png'));
assert.equal(calls[0].init?.body, file);

await businessAttachmentApi.remove('attachment-1');
assert.equal(calls[1].init?.method, 'DELETE');
