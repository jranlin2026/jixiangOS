import assert from 'node:assert/strict';
import test from 'node:test';
import { createLatestCommissionRuleRequestGate } from './commissionRuleRequestGate';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

test('并发刷新时较早返回的旧提成配置不能覆盖较新的响应', async () => {
  const gate = createLatestCommissionRuleRequestGate();
  const first = deferred<string>();
  const second = deferred<string>();
  const applied: string[] = [];
  const load = async (request: Promise<string>) => {
    const requestId = gate.begin();
    assert.notEqual(requestId, null);
    const value = await request;
    if (gate.isLatest(requestId!)) applied.push(value);
    gate.finish();
  };

  const firstLoad = load(first.promise);
  const secondLoad = load(second.promise);
  second.resolve('最新方案');
  await secondLoad;
  first.resolve('旧方案');
  await firstLoad;

  assert.deepEqual(applied, ['最新方案']);
});

test('前台请求执行时跳过后发的静默刷新，避免静默失败吞掉成功结果', () => {
  const gate = createLatestCommissionRuleRequestGate();
  const foregroundRequestId = gate.begin();

  assert.notEqual(foregroundRequestId, null);
  assert.equal(gate.begin({ silent: true }), null, '已有请求时不应再启动静默刷新');
  assert.equal(gate.isLatest(foregroundRequestId!), true, '被跳过的静默刷新不能使前台请求失效');

  gate.finish();
  assert.notEqual(gate.begin({ silent: true }), null, '前台请求结束后应允许下一次静默刷新');
  gate.finish();
});
