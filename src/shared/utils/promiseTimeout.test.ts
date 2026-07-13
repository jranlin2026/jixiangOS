import assert from 'node:assert/strict';
import { withTimeout } from './promiseTimeout';

await assert.rejects(
  withTimeout(new Promise<never>(() => undefined), 5, '标签目录加载超时'),
  /标签目录加载超时/,
);
assert.equal(await withTimeout(Promise.resolve('ok'), 50, '不应超时'), 'ok');

console.log('promiseTimeout.test.ts passed');
