import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createSystemInstallationGate } from './systemInstallationGate';

let state = 'UNINITIALIZED';
const service = {
  status: async () => ({
    code: 0,
    data: { state, initialized: state === 'ACTIVE', setupAvailable: true, setupVersion: 1, companyName: null },
    message: 'success',
  }),
} as any;

const app = express();
app.use(createSystemInstallationGate(service));
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/system/setup/status', (_req, res) => res.json({ setup: true }));
app.get('/api/customers', (_req, res) => res.json({ customers: [] }));
const listener = app.listen(0, '127.0.0.1');
await once(listener, 'listening');
const address = listener.address() as AddressInfo;
const root = `http://127.0.0.1:${address.port}`;

try {
  assert.equal((await fetch(`${root}/api/health`)).status, 200);
  assert.equal((await fetch(`${root}/api/system/setup/status`)).status, 200);
  const blocked = await fetch(`${root}/api/customers`);
  assert.equal(blocked.status, 503);
  assert.match(String((await blocked.json()).message), /尚未初始化/);

  state = 'ACTIVE';
  assert.equal((await fetch(`${root}/api/customers`)).status, 200);
} finally {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}

console.log('system installation gate tests passed');
