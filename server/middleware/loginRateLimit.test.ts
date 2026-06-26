import assert from 'node:assert/strict';
import { createLoginRateLimiter } from './loginRateLimit';

let timestamp = 1000;
const limiter = createLoginRateLimiter({
  maxFailures: 2,
  windowMs: 60_000,
  blockMs: 30_000,
  now: () => timestamp,
});

function request(account = 'admin') {
  return {
    ip: '127.0.0.1',
    socket: {},
    body: { account },
  } as any;
}

function response() {
  return {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
  } as any;
}

const req = request();
limiter.recordFailure(req);
let res = response();
let nextCalled = false;
limiter.guard(req, res, () => {
  nextCalled = true;
});
assert.equal(nextCalled, true);
assert.equal(res.statusCode, 200);

limiter.recordFailure(req);
res = response();
nextCalled = false;
limiter.guard(req, res, () => {
  nextCalled = true;
});
assert.equal(nextCalled, false);
assert.equal(res.statusCode, 429);

timestamp += 30_001;
res = response();
nextCalled = false;
limiter.guard(req, res, () => {
  nextCalled = true;
});
assert.equal(nextCalled, true);

limiter.recordFailure(req);
limiter.reset(req);
limiter.recordFailure(req);
res = response();
nextCalled = false;
limiter.guard(req, res, () => {
  nextCalled = true;
});
assert.equal(nextCalled, true);
