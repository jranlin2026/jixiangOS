import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../pages/AfterSales/RecoveryOrderTab.tsx', import.meta.url), 'utf8');

assert.match(source, /const \[loading, setLoading\] = useState\(false\)/);
assert.match(source, /setLoading\(true\)/);
assert.match(source, /finally\s*\{\s*if \(requestId === loadRequestIdRef\.current\) setLoading\(false\)/s,
  '只有最新请求可以结束加载状态，避免旧响应覆盖新页面结果');
assert.match(source, /subscribePageRefresh\(\(\) => \{ void load\(\); \}\)/,
  '售后挽回页面恢复显示时必须重新读取列表');
assert.match(source, /\{loading \? ['"]加载中\.\.\.['"] : mode === ['"]review['"]/);
