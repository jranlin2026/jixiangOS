import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../pages/AfterSales/RecoveryOrderTab.tsx', import.meta.url), 'utf8');

assert.match(source, /const \[loading, setLoading\] = useState\(false\)/);
assert.match(source, /setLoading\(true\)/);
assert.match(source, /finally\s*\{\s*setLoading\(false\)/s);
assert.match(source, /\{loading \? ['"]加载中\.\.\.['"] : mode === ['"]review['"]/);

