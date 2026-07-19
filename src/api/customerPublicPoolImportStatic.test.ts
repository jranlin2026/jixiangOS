import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dialogSource = readFileSync(join(process.cwd(), 'src/pages/Customers/CustomerImportDialog.tsx'), 'utf8');
const apiSource = readFileSync(join(process.cwd(), 'src/api/customerDataExchangeApi.ts'), 'utf8');
const adapterSource = readFileSync(join(process.cwd(), 'server/services/customerDataExchangeAdapter.ts'), 'utf8');
const listServiceSource = readFileSync(join(process.cwd(), 'server/services/customerListService.ts'), 'utf8');

assert.match(dialogSource, /导入客户列表/);
assert.match(dialogSource, /直接导入公海池/);
assert.match(dialogSource, /canImportToPublicPool/);
assert.match(dialogSource, /查看公海池/);
assert.match(apiSource, /destination: CustomerImportDestination/);
assert.match(adapterSource, /filter\(\(item\) => item\.code !== 'public_pool'\)/);
assert.match(listServiceSource, /ownerIdentityStatus: importToPublicPool \? 'public_pool' : 'resolved'/);
assert.match(listServiceSource, /publicPoolAt: now/);
assert.match(listServiceSource, /releaseReason: '批量导入至公海'/);
