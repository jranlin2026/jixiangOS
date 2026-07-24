import assert from 'node:assert/strict';
import { createOrderReviewLoadGate } from './orderReviewLoadGate';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const gate = createOrderReviewLoadGate();
const batchA = deferred<string>();
const batchB = deferred<string>();
const applied: string[] = [];

const first = gate.begin();
const firstRun = batchA.promise.then((value) => {
  if (gate.isLatest(first.requestId)) applied.push(value);
});
const second = gate.begin();
const secondRun = batchB.promise.then((value) => {
  if (gate.isLatest(second.requestId)) applied.push(value);
});

assert.equal(first.signal.aborted, true, 'starting batch B aborts the in-flight batch A request');
batchB.resolve('batch-B');
await secondRun;
batchA.resolve('batch-A');
await firstRun;

assert.deepEqual(applied, ['batch-B'], 'a late batch A response cannot overwrite the current batch B result');
assert.equal(gate.finish(first.requestId), false, 'stale requests cannot clear the current loading state');
assert.equal(gate.finish(second.requestId), true, 'the current request may clear the loading state');

gate.dispose();
assert.equal(second.signal.aborted, true, 'disposing the page aborts the current request');
