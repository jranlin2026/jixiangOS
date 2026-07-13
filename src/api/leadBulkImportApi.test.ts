import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/api/leadBulkImportApi.ts', 'utf8');

assert.match(source, /LEAD_BULK_IMPORT_HEADERS/);
assert.match(source, /TEXT\.remark/);
assert.match(source, /function validateRow\(row: CleanRow\)/);
assert.doesNotMatch(source, /TEXT\.tags/);
assert.doesNotMatch(source, /parseTags/);
assert.doesNotMatch(source, /resolveManualTagNames/);
assert.doesNotMatch(source, /fetchCustomerTagCatalog\('lead'/);
assert.doesNotMatch(source, /manualTagIds:/);

console.log('leadBulkImportApi.test.ts passed');
