import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/shared/components/StorageSyncFailureNotice.tsx'), 'utf8');

assert.match(source, /subscribeStorageSyncFailures/);
assert.match(source, /数据未保存：/);
