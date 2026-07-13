import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/pages/Settings/CustomerTagConfig.tsx', 'utf8');

assert.match(source, /const \[showInactive, setShowInactive\] = useState\(false\)/);
assert.match(source, /fetchCustomerTagCatalog\('all', showInactive\)/);
assert.match(source, /deleteCustomerTag\(deleteTarget\.id\)/);
assert.match(source, /deleteCustomerTagGroup\(deleteTarget\.id\)/);
assert.match(source, /使用 0 次的标签才可以永久删除/);
assert.match(source, /没有标签的分组才可以永久删除/);

console.log('customerTagSafeDeleteStatic.test.ts passed');
