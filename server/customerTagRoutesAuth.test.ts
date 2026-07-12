import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'server', 'index.ts'), 'utf8');

assert.match(source, /const requireCustomerTagCatalogReadAccess = createRequireAnyPermission\(authService, \[PERMISSION_KEYS\.CUSTOMER_LIST, PERMISSION_KEYS\.LEADS_DETAIL\]\);/);
assert.match(source, /app\.get\('\/api\/customer-tags\/catalog', requireCustomerTagCatalogReadAccess,/);
for (const [method, route] of [
  ['post', '/api/customer-tags/groups'],
  ['put', '/api/customer-tags/groups/:id'],
  ['post', '/api/customer-tags'],
  ['put', '/api/customer-tags/:id'],
  ['post', '/api/customer-tags/:id/merge'],
] as const) {
  assert.equal(source.split(`app.${method}('${route}', requireStorageAccess,`).length - 1, 1);
}
assert.match(source, /createCustomerTagService\(prisma\)/);
assert.match(source, /customerTagService\.mergeTag\([\s\S]*req\.currentUser!/);

