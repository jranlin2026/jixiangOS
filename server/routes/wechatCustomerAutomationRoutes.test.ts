import assert from 'node:assert/strict';
import { createWechatCustomerAutomationRouter } from './wechatCustomerAutomationRoutes';
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
    status(code: number) { this.statusCode = code; return this; },
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
const router = createWechatCustomerAutomationRouter({
  config: () => ({ token: TOKEN, actorAccount: 'wechat-bot', signingKey: 'signing-key-that-is-at-least-32-characters', senderId: SENDER_ID }),
  resolveActor: async () => currentActor,
  service: {
    check: async () => ({ status: 'needs_input', field: 'name', message: '请提供客户姓名' }),
    create: async () => ({ status: 'created', customer: { id: 'c-1', name: '客户', company: '', owner: '微信录入' }, detailPath: '/customers/c-1' }),
  },
});

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

console.log('wechat customer automation route tests passed');
