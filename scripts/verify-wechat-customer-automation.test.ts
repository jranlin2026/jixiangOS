import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const verifierPath = fileURLToPath(new URL('./verify-wechat-customer-automation.ts', import.meta.url));
assert.ok(existsSync(verifierPath), 'the WeChat customer automation verifier must exist');

const {
  parseVerifierArgs,
  runVerifier,
  safeVerifierFailureMessage,
} = await import('./verify-wechat-customer-automation');

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const staticOptions = parseVerifierArgs([]);
let fetchCalls = 0;
const staticReport = await runVerifier(staticOptions, {
  projectRoot,
  fetch: async () => {
    fetchCalls += 1;
    throw new Error('static mode must not fetch');
  },
});
assert.equal(fetchCalls, 0, 'default static/config-only mode must perform zero fetches');
assert.deepEqual(staticReport, {
  mode: 'static',
  configPolicy: 'passed',
  networkRequests: 0,
  databaseWrites: 0,
});

const liveBase = [
  '--live',
  '--acknowledge-disposable-qa-write',
  '--api-origin=http://127.0.0.1:3001',
  '--target-marker=jixiangos_qa',
  '--qa-data=DISPOSABLE_QA_INPUT_FILE',
];
assert.throws(
  () => parseVerifierArgs(liveBase.filter((argument) => argument !== '--live')),
  /explicit --live opt-in/,
  'live-only flags without --live must fail instead of silently selecting static mode',
);

for (const [label, args, expected] of [
  ['missing second acknowledgement', liveBase.filter((arg) => !arg.startsWith('--acknowledge')), /acknowledge-disposable-qa-write/],
  ['non-loopback origin', liveBase.map((arg) => arg.startsWith('--api-origin=') ? '--api-origin=https://example.invalid' : arg), /loopback/],
  ['production-like marker', liveBase.map((arg) => arg.startsWith('--target-marker=') ? '--target-marker=production_test' : arg), /production-like/],
  ['embedded production substring', liveBase.map((arg) => arg.startsWith('--target-marker=') ? '--target-marker=customerprod_qa' : arg), /production-like/],
  ['ambiguous marker', liveBase.map((arg) => arg.startsWith('--target-marker=') ? '--target-marker=staging' : arg), /_qa or _test/],
  ['missing QA data', liveBase.filter((arg) => !arg.startsWith('--qa-data=')), /caller-supplied --qa-data/],
] as const) {
  let unsafeFetchCalls = 0;
  await assert.rejects(
    () => runVerifier(parseVerifierArgs([...args]), {
      projectRoot,
      env: {
        JIXIANG_OS_AUTOMATION_TOKEN: '<TOKEN_FROM_ENV>',
        JIXIANG_OS_WECHAT_SENDER_ID: '<SENDER_FROM_ENV>',
      },
      readTextFile: (path) => path === 'DISPOSABLE_QA_INPUT_FILE'
        ? '{"disposableQa":true}'
        : readFileSync(path, 'utf8'),
      fetch: async () => {
        unsafeFetchCalls += 1;
        throw new Error('unsafe target reached fetch');
      },
    }),
    expected,
    label,
  );
  assert.equal(unsafeFetchCalls, 0, `${label} must be rejected before fetch`);
}

let unsupportedFieldFetchCalls = 0;
await assert.rejects(
  () => runVerifier(parseVerifierArgs(liveBase), {
    projectRoot,
    env: {
      JIXIANG_OS_AUTOMATION_TOKEN: '<TOKEN_FROM_ENV>',
      JIXIANG_OS_WECHAT_SENDER_ID: '<SENDER_FROM_ENV>',
    },
    readTextFile: (path) => path === 'DISPOSABLE_QA_INPUT_FILE'
      ? JSON.stringify({
        disposableQa: true,
        customer: {
          name: '<DISPOSABLE_QA_NAME>',
          wechat: '<DISPOSABLE_QA_CONTACT>',
          leadSource: '<QA_LEAD_SOURCE>',
          command: '<UNSUPPORTED_FIELD>',
        },
      })
      : readFileSync(path, 'utf8'),
    fetch: async () => {
      unsupportedFieldFetchCalls += 1;
      throw new Error('unsupported QA field reached fetch');
    },
  }),
  /unsupported QA customer field/,
);
assert.equal(unsupportedFieldFetchCalls, 0, 'unsupported QA fields must be rejected before fetch');

const qaInput = {
  disposableQa: true,
  customer: {
    name: '<DISPOSABLE_QA_NAME>',
    wechat: '<DISPOSABLE_QA_CONTACT>',
    leadSource: '<QA_LEAD_SOURCE>',
  },
};
const liveResponses = [
  { code: 0, data: { status: 'ready', precheckToken: '<OPAQUE_PRECHECK_TOKEN>' }, message: 'ok' },
  { code: 0, data: { status: 'created', customer: { id: 'stable-id' } }, message: 'ok' },
  { code: 0, data: { status: 'replayed', customer: { id: 'stable-id' } }, message: 'ok' },
];
const requestedUrls: string[] = [];
const requestedInits: RequestInit[] = [];
const liveReport = await runVerifier(parseVerifierArgs(liveBase), {
  projectRoot,
  env: {
    JIXIANG_OS_AUTOMATION_TOKEN: '<TOKEN_FROM_ENV>',
    JIXIANG_OS_WECHAT_SENDER_ID: '<SENDER_FROM_ENV>',
  },
  readTextFile: (path) => path === 'DISPOSABLE_QA_INPUT_FILE'
    ? JSON.stringify(qaInput)
    : readFileSync(path, 'utf8'),
  fetch: async (input, init) => {
    requestedUrls.push(String(input));
    requestedInits.push(init || {});
    if (requestedUrls.length === 4) {
      return new Response('Bearer <TOKEN_FROM_ENV> <DISPOSABLE_QA_CONTACT>', { status: 401 });
    }
    const body = liveResponses.shift();
    assert.ok(body, 'the verifier must make only check/create/replay requests');
    return new Response(JSON.stringify(body), {
      status: body.data.status === 'created' ? 201 : 200,
      headers: { 'content-type': 'application/json' },
    });
  },
});
assert.deepEqual(requestedUrls, [
  'http://127.0.0.1:3001/api/automation/wechat/customers/check',
  'http://127.0.0.1:3001/api/automation/wechat/customers/create',
  'http://127.0.0.1:3001/api/automation/wechat/customers/create',
  'http://127.0.0.1:3001/api/automation/wechat/customers/check',
]);
assert.equal(requestedInits.length, 4);
assert.ok(requestedInits.every((init) => init.redirect === 'error'), 'requests must reject redirects to keep credentials on loopback');
assert.equal(
  new Headers(requestedInits[3]?.headers).get('authorization'),
  'Bearer [VERIFIER_NEGATIVE_PROBE]',
  'the negative check must use a fixed non-secret credential',
);
assert.deepEqual(liveReport, {
  mode: 'live-qa',
  targetSafety: 'loopback _qa/_test target acknowledged',
  checkStatus: 'ready',
  createStatus: 'created',
  replayStatus: 'replayed',
  stableCustomerId: true,
  safeFailureMessages: '401 check mapping verified without reading response body',
  networkRequests: 4,
  databaseWrites: 'create endpoint invoked once; replay verified',
  cleanup: 'manual isolated-database reset required',
  openClawAuthorization: 'not-proven; Windows manual acceptance required',
});
const serializedReport = JSON.stringify(liveReport);
assert.doesNotMatch(serializedReport, /DISPOSABLE|TOKEN_FROM_ENV|SENDER_FROM_ENV|OPAQUE_PRECHECK_TOKEN|stable-id/);

assert.equal(
  safeVerifierFailureMessage('create', 500),
  '创建验证遇到不确定的服务器错误；未写入系统',
);
assert.equal(
  safeVerifierFailureMessage('check', 401),
  '预检验证未通过认证；未写入系统',
);
assert.doesNotMatch(
  safeVerifierFailureMessage('create', 500),
  /Bearer|phone|wechat|customer|token/i,
  'safe failures must not echo secrets or contact inputs',
);

console.log('WeChat customer automation verifier safety tests passed');
