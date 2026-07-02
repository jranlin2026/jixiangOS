import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'server', 'index.ts'), 'utf8');

assert.match(source, /const requireStorageAccess = createRequireAuth\(authService\);/);
assert.match(source, /app\.get\('\/api\/storage', requireStorageAccess,/);
assert.match(source, /app\.get\('\/api\/storage\/:key', requireStorageAccess,/);
assert.match(source, /app\.put\('\/api\/storage\/:key', requireStorageAccess,/);
assert.match(source, /app\.delete\('\/api\/storage\/:key', requireStorageAccess,/);
assert.match(source, /app\.delete\('\/api\/storage', requireDataMaintenanceAccess,/);
