import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const server = read('server/index.ts');
const service = read('server/services/customerTodoService.ts');
const dashboard = read('src/pages/Dashboard/index.tsx');
const dashboardApi = read('src/api/dashboardApi.ts');
const customers = read('src/pages/Customers/index.tsx');

assert.match(service, /async listMine\(/);
assert.match(server, /app\.get\('\/api\/customer-todos\/my'/);
assert.match(dashboardApi, /customerTodoApi\.listMine\(/);
assert.match(dashboardApi, /function currentUserHasPermission\(/);
assert.match(dashboardApi, /shouldUseBackendApi\(\)\s*&&\s*currentUserHasPermission\(PERMISSION_KEYS\.CUSTOMER_LIST\)/);
assert.doesNotMatch(dashboardApi, /listMine\(\)[\s\S]{0,160}\.catch\(\(\) => \[\]\)/);
assert.match(dashboardApi, /createErrorResponse/);
assert.match(dashboard, /我的客户待办/);
assert.match(dashboard, /loadError/);
assert.match(dashboard, /customerTodoApi\.complete\(/);
assert.match(customers, /searchParams\.get\('customerId'\)/);
assert.match(customers, /detailTab.*todo/);

console.log('customer todo dashboard static tests passed');
