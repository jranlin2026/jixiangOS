import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.resolve('src/pages/Customers/CustomerDetail.tsx'), 'utf8');

assert.match(source, /const \[selectedManualTagIds, setSelectedManualTagIds\] = useState<string\[\]>\(\[\]\)/);
assert.match(source, /manualTagIds: selectedManualTagIds/);
assert.match(source, /<ManualTagSelector scope="customer" value=\{selectedManualTagIds\}/);
assert.doesNotMatch(source, /parseCustomerTagsInput/);

console.log('customerDetailTagInputStatic.test.ts passed');
