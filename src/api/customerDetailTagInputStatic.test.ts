import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.resolve('src/pages/Customers/CustomerDetail.tsx'), 'utf8');

assert.match(source, /const \[tagDialogOpen, setTagDialogOpen\] = useState\(false\)/);
assert.match(source, /handleSaveTags = async \(manualTagIds: string\[\]\)/);
assert.match(source, /updateCustomer\(currentCustomer\.id, \{ manualTagIds \}\)/);
assert.match(source, /<CustomerTagDialog[\s\S]*initialIds=\{currentCustomer\.manualTagIds\}/);
assert.doesNotMatch(source, /parseCustomerTagsInput/);

console.log('customerDetailTagInputStatic.test.ts passed');
