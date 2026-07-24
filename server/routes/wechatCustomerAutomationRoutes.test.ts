import assert from 'node:assert/strict';
import {
  createWechatCustomerAutomationRouter,
  readWechatAutomationQaDatabaseIdentity,
} from './wechatCustomerAutomationRoutes';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';

const TOKEN = 'wechat-automation-token-that-is-at-least-32-characters';
const SENDER_ID = 'fixed-wechat-sender';
const actor = {
  id: 'automation-user', account: 'wechat-bot', name: '微信录入', email: '', phone: '',
  role: '销售', permissions: [
    { module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] },
    { module: PERMISSION_KEYS.CUSTOMER_CREATE, actions: ['write'] },
  ], isActive: true,
};

function response() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: new Map<string, string>(),
    status(code: number) { this.statusCode = code; return this; },
    setHeader(name: string, value: string) { this.headers.set(name.toLowerCase(), value); return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

async function post(router: any, path: string, headers: Record<string, string | undefined>, body: unknown) {
  const layer = router.stack.find((candidate: any) => candidate.route?.path === path && candidate.route.methods.post);
  assert.ok(layer, `missing ${path}`);
  const request: any = { headers, body };
  const result = response();
  let cursor = 0;
  const next = async () => {
    const handler = layer.route.stack[cursor++]?.handle;
    if (handler) await handler(request, result, next);
  };
  await next();
  return result;
}

let currentActor: typeof actor | null = actor;
const createCalls: any[] = [];
let checkCalls = 0;
let createError: unknown = null;
const qaEnvironment = {
  NODE_ENV: 'test',
  QA_ALLOW_DESTRUCTIVE_DB: 'true',
  QA_DATABASE_NAME: 'jixiang_os_qa',
  DATABASE_URL: 'mysql://qa_user:qa_password@127.0.0.1:3306/jixiang_os_qa',
};
const router = createWechatCustomerAutomationRouter({
  config: () => ({ token: TOKEN, actorAccount: 'wechat-bot', signingKey: 'signing-key-that-is-at-least-32-characters', senderId: SENDER_ID }),
  resolveActor: async () => currentActor,
  qaDatabaseIdentity: (declaredDatabaseName) => readWechatAutomationQaDatabaseIdentity(declaredDatabaseName, qaEnvironment),
  service: {
    check: async () => {
      checkCalls += 1;
      return { status: 'needs_input', field: 'name', message: '请提供客户姓名' };
    },
    create: async (customer, precheckToken, context) => {
      createCalls.push({ customer, precheckToken, context });
      if (createError) throw createError;
      return { status: 'created', customer: { id: 'c-1', name: '客户', company: '', owner: '微信录入' }, detailPath: '/customers/c-1' };
    },
  },
});

assert.deepEqual(router.stack.map((layer: any) => ({
  path: layer.route?.path,
  methods: Object.keys(layer.route?.methods || {}).sort(),
})), [
  { path: '/customers/check', methods: ['post'] },
  { path: '/customers/create', methods: ['post'] },
], 'automation router exposes exactly two POST routes');

for (const headers of [
  {},
  { authorization: `Bearer ${TOKEN}` },
  { authorization: 'Bearer wrong-token', 'x-jxos-wechat-sender': SENDER_ID },
  { authorization: `Bearer ${TOKEN}`, 'x-jxos-wechat-sender': 'wrong-sender' },
]) {
  const result = await post(router, '/customers/check', headers, { customer: {} });
  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { code: 401, data: null, message: 'Unauthorized' });
}

const checked = await post(router, '/customers/check', {
  authorization: `Bearer ${TOKEN}`,
  'x-jxos-wechat-sender': SENDER_ID,
}, { customer: {} });
assert.equal(checked.statusCode, 200);
assert.deepEqual(checked.body, { code: 0, data: { status: 'needs_input', field: 'name', message: '请提供客户姓名' }, message: 'success' });

const qaProven = await post(router, '/customers/check', {
  authorization: `Bearer ${TOKEN}`,
  'x-jxos-wechat-sender': SENDER_ID,
  'x-jxos-qa-database-proof': 'jixiang_os_qa',
}, { customer: {} });
assert.equal(qaProven.statusCode, 200);
assert.equal(qaProven.headers.get('x-jxos-qa-database-proof'), 'jixiang_os_qa');

const checksBeforeRejectedProof = checkCalls;
const qaProofRejected = await post(router, '/customers/check', {
  authorization: `Bearer ${TOKEN}`,
  'x-jxos-wechat-sender': SENDER_ID,
  'x-jxos-qa-database-proof': 'another_qa',
}, { customer: {} });
assert.equal(qaProofRejected.statusCode, 503);
assert.deepEqual(qaProofRejected.body, { code: 503, data: null, message: 'WeChat customer automation is unavailable.' });
assert.equal(checkCalls, checksBeforeRejectedProof, 'failed QA database proof must stop before the business service');

assert.deepEqual(
  readWechatAutomationQaDatabaseIdentity('jixiang_os_qa', qaEnvironment),
  { databaseName: 'jixiang_os_qa' },
  'proof returns only the safe database name, never the URL or credentials',
);
for (const unsafeEnvironment of [
  { ...qaEnvironment, NODE_ENV: 'production' },
  { ...qaEnvironment, NODE_ENV: 'PrOdUcTiOn' },
  { ...qaEnvironment, NODE_ENV: undefined },
  { ...qaEnvironment, QA_ALLOW_DESTRUCTIVE_DB: 'false' },
  { ...qaEnvironment, QA_DATABASE_NAME: 'customerprod_qa', DATABASE_URL: 'mysql://qa_user:qa_password@127.0.0.1:3306/customerprod_qa' },
  { ...qaEnvironment, DATABASE_URL: 'mysql://qa_user:qa_password@127.0.0.1:3306/another_qa' },
  { ...qaEnvironment, DATABASE_URL: 'mysql://qa_user:qa_password@db.internal:3306/jixiang_os_qa' },
]) {
  assert.equal(readWechatAutomationQaDatabaseIdentity('jixiang_os_qa', unsafeEnvironment), null);
}
assert.equal(readWechatAutomationQaDatabaseIdentity('another_qa', qaEnvironment), null);

for (const replacement of [
  { ...actor, isActive: false },
  { ...actor, permissions: [] },
]) {
  currentActor = replacement;
  const result = await post(router, '/customers/check', {
    authorization: `Bearer ${TOKEN}`,
    'x-jxos-wechat-sender': SENDER_ID,
  }, { customer: {} });
  assert.equal(result.statusCode, 401, 'inactive or under-permissioned automation actors fail closed');
}
currentActor = actor;

const createHeaders = {
  authorization: `Bearer ${TOKEN}`,
  'x-jxos-wechat-sender': SENDER_ID,
};
const customer = { name: '路由创建客户', phone: '13800138125', leadSource: '官网' };
const created = await post(router, '/customers/create', createHeaders, {
  customer,
  precheckToken: 'opaque-precheck-token',
});
assert.equal(created.statusCode, 201);
assert.deepEqual(created.body, {
  code: 0,
  data: {
    status: 'created',
    customer: { id: 'c-1', name: '客户', company: '', owner: '微信录入' },
    detailPath: '/customers/c-1',
  },
  message: 'success',
});
assert.deepEqual(createCalls[0], {
  customer,
  precheckToken: 'opaque-precheck-token',
  context: { actor, senderId: SENDER_ID },
});

createError = Object.assign(new Error('private conflict detail'), { statusCode: 409 });
const conflicted = await post(router, '/customers/create', createHeaders, {
  customer,
  precheckToken: 'opaque-precheck-token',
});
assert.equal(conflicted.statusCode, 409);
assert.deepEqual(conflicted.body, { code: 409, data: null, message: 'WeChat customer create conflict.' });
createError = null;

createError = Object.assign(new Error('winner still active'), { statusCode: 503 });
const pending = await post(router, '/customers/create', createHeaders, {
  customer,
  precheckToken: 'opaque-precheck-token',
});
assert.equal(pending.statusCode, 503);
assert.deepEqual(pending.body, { code: 503, data: null, message: 'WeChat customer automation is unavailable.' });
createError = null;

const callsBeforeInvalid = createCalls.length;
const invalid = await post(router, '/customers/create', createHeaders, {
  customer,
  precheckToken: '',
});
assert.equal(invalid.statusCode, 400);
assert.deepEqual(invalid.body, { code: 400, data: null, message: 'WeChat customer request is invalid.' });
assert.equal(createCalls.length, callsBeforeInvalid, 'invalid create body must not reach the service');

console.log('wechat customer automation route tests passed');
