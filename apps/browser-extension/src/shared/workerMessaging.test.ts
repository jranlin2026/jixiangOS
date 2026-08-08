import assert from 'node:assert/strict';
import { withWorkerTimeout } from './workerMessaging';

const never = new Promise<never>(() => undefined);
await assert.rejects(
  withWorkerTimeout(never, 15),
  /插件后台响应超时，请在扩展程序页面重新加载插件/,
);

assert.equal(await withWorkerTimeout(Promise.resolve('ok'), 100), 'ok');

console.log('browser worker messaging timeout: ok');
