import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createDisabledCrmCustomerImportHandler } from './crmMigrationRoutes';

const app = express();
app.use(express.json());
app.post('/api/crm-migration/import', createDisabledCrmCustomerImportHandler());

const listener = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => listener.once('listening', resolve));
const address = listener.address() as AddressInfo;

try {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/crm-migration/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ customers: [{ id: 'bypass-customer' }] }),
  });
  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), {
    code: 410,
    data: null,
    message: '旧 CRM 客户导入已停用，请使用统一客户导入模板',
  });
} finally {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}
