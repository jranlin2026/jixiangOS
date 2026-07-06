import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.resolve('src/pages/Customers/CustomerDetail.tsx'), 'utf8');

assert.match(source, /const \[tagInput, setTagInput\] = useState\(''\)/);
assert.match(source, /tags: parseCustomerTagsInput\(tagInput\)/);
assert.match(source, /value=\{tagInput\}/);
assert.match(source, /onChange=\{\(event\) => setTagInput\(event\.target\.value\)\}/);
assert.doesNotMatch(source, /tags: parseCustomerTagsInput\(event\.target\.value\)/);

console.log('customerDetailTagInputStatic.test.ts passed');
