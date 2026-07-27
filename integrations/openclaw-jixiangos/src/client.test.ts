import assert from 'node:assert/strict';
import {
  CUSTOMER_FIELD_LIMITS,
  JixiangOsWechatClient,
  JixiangOsToolError,
  redactDiagnostic,
  renderCustomerDetailUrl,
  validateConfig,
  type CustomerInput,
} from './client';

const config = {
  apiBase: 'https://jxos.example.test',
  automationToken: 'test-automation-token',
  senderId: 'test-sender',
  detailUrlTemplate: 'https://jxos.example.test{detailPath}',
  requestTimeoutMs: 500,
};

const customer: CustomerInput = {
  name: '测试客户',
  phone: '13800000000',
  leadSource: '官网',
};

const normalizedCustomer = {
  name: '测试客户',
  company: '',
  phone: '13800000000',
  leadSource: '官网',
  sourceType: '公司资源',
  ownerAccount: 'automation-owner',
  ownerName: '自动化负责人',
  tagNames: [],
} as const;

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

const calls: Array<{ url: string; init?: RequestInit }> = [];
const fetchStub: typeof fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  return response(200, {
    code: 0,
    data: {
      status: 'ready',
      normalized: normalizedCustomer,
      precheckToken: 'opaque-token',
      expiresAt: '2026-07-25T00:00:00.000Z',
    },
    message: 'success',
  });
};

const client = new JixiangOsWechatClient(config, { fetch: fetchStub });
const checked = await client.check(customer);
assert.equal(checked.status, 'ready');
assert.equal(calls[0]?.url, 'https://jxos.example.test/api/automation/wechat/customers/check');
assert.equal(calls[0]?.init?.method, 'POST');
assert.deepEqual(calls[0]?.init?.headers, {
  Authorization: 'Bearer test-automation-token',
  'X-JXOS-WECHAT-SENDER': 'test-sender',
  'Content-Type': 'application/json',
});
assert.equal(calls[0]?.init?.body, JSON.stringify({ customer }));
assert.ok(calls[0]?.init?.signal instanceof AbortSignal);
const { signal: checkSignal, ...checkRequestInit } = calls[0]?.init || {};
assert.ok(checkSignal instanceof AbortSignal);
assert.deepEqual(checkRequestInit, {
  method: 'POST',
  redirect: 'error',
  headers: {
    Authorization: 'Bearer test-automation-token',
    'X-JXOS-WECHAT-SENDER': 'test-sender',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ customer }),
});

assert.throws(() => validateConfig({
  ...config,
  apiBase: 'http://jxos.example.test',
}), /HTTPS/);
assert.equal(validateConfig({
  ...config,
  apiBase: 'https://jxos.example.test/',
}).apiBase, 'https://jxos.example.test');
for (const loopback of [
  'http://localhost:3210/',
  'http://127.0.0.1:3210/',
  'http://[::1]:3210/',
]) {
  assert.equal(validateConfig({ ...config, apiBase: loopback }).apiBase, new URL(loopback).origin);
}

let prefixedApiBaseError: unknown;
try {
  validateConfig({ ...config, apiBase: 'https://jxos.example.test/private-prefix' });
} catch (error) {
  prefixedApiBaseError = error;
}
assert.ok(prefixedApiBaseError instanceof Error);
assert.equal((prefixedApiBaseError as Error).message, 'JIXIANG_OS_API_BASE 格式无效');
assert.doesNotMatch((prefixedApiBaseError as Error).message, /private-prefix/);

let credentialTemplateError: unknown;
try {
  validateConfig({
    ...config,
    detailUrlTemplate: 'https://unsafe-user:unsafe-secret@jxos.example.test{detailPath}',
  });
} catch (error) {
  credentialTemplateError = error;
}
assert.ok(credentialTemplateError instanceof Error);
assert.match((credentialTemplateError as Error).message, /DETAIL_URL_TEMPLATE/);
assert.doesNotMatch((credentialTemplateError as Error).message, /unsafe-user|unsafe-secret/);

assert.equal(
  renderCustomerDetailUrl(config.detailUrlTemplate, { id: 'customer-1', detailPath: '/customers/customer-1' }),
  'https://jxos.example.test/customers/customer-1',
);
assert.equal(
  renderCustomerDetailUrl(config.detailUrlTemplate, { id: '../unsafe', detailPath: 'https://elsewhere.test' }),
  null,
);
assert.doesNotMatch(
  redactDiagnostic('Bearer test-automation-token 13800000000 wx_contact'),
  /test-automation-token|13800000000|wx_contact/,
);

const errorClient = new JixiangOsWechatClient(config, {
  fetch: async () => response(401, { code: 401, data: null, message: 'private detail' }),
});
await assert.rejects(() => errorClient.check(customer), (error: unknown) => (
  error instanceof JixiangOsToolError && (error as Error).message === '认证失败，请检查自动化凭据后重试。'
));

for (const [status, expected] of [
  [400, '请求参数无效，请补充或核对客户信息。'],
  [403, '当前自动化账号没有创建客户权限。'],
  [409, '客户已存在或预检已失效，请重新核验。'],
  [503, '系统暂时不可用，请稍后重试。'],
] as const) {
  const failed = new JixiangOsWechatClient(config, {
    fetch: async () => response(status, { code: status, data: null, message: 'private backend detail' }),
  });
  await assert.rejects(() => failed.check(customer), { message: expected });
}

for (const createFailure of [
  async () => { throw new Error('network failure'); },
  async () => new Response('not json', { status: 200 }),
  async () => response(500, { code: 500, data: null, message: 'private server failure' }),
] as Array<typeof fetch>) {
  let requestCount = 0;
  const uncertain = new JixiangOsWechatClient(config, { fetch: async (url, init) => {
    requestCount += 1;
    return requestCount === 1
      ? fetchStub(url, init)
      : createFailure(url, init);
  } });
  await uncertain.check(customer);
  await assert.rejects(
    () => uncertain.create(customer, 'opaque-token'),
    { message: '创建请求结果不确定，请先核验客户是否已存在；未写入系统' },
  );
}

for (const expectedResult of [
  { status: 'needs_input', field: 'name', message: '请提供客户姓名' },
  { status: 'duplicate', message: '系统中已存在相同联系方式' },
] as const) {
  const passthrough = new JixiangOsWechatClient(config, {
    fetch: async () => response(200, { code: 0, data: expectedResult, message: 'success' }),
  });
  assert.deepEqual(await passthrough.check(customer), expectedResult);
}

const boundaryText = 'x'.repeat(CUSTOMER_FIELD_LIMITS.text);
const boundaryReadyResult = {
  status: 'ready' as const,
  normalized: { ...normalizedCustomer, company: boundaryText, city: boundaryText },
  precheckToken: 'boundary-token',
  expiresAt: '2026-07-25T00:00:00.000Z',
};
const boundaryReadyClient = new JixiangOsWechatClient(config, {
  fetch: async () => response(200, { code: 0, data: boundaryReadyResult, message: 'success' }),
});
assert.deepEqual(
  await boundaryReadyClient.check({ ...customer, company: boundaryText, city: boundaryText }),
  boundaryReadyResult,
);

const boundarySummary = {
  id: 'customer-boundary',
  name: boundaryText,
  company: boundaryText,
  owner: boundaryText,
};
const boundaryDuplicateResult = {
  status: 'duplicate' as const,
  message: '系统中已存在相同联系方式',
  customer: boundarySummary,
};
const boundaryDuplicateClient = new JixiangOsWechatClient(config, {
  fetch: async () => response(200, { code: 0, data: boundaryDuplicateResult, message: 'success' }),
});
assert.deepEqual(await boundaryDuplicateClient.check(customer), boundaryDuplicateResult);

const manyCandidates = Array.from({ length: 51 }, (_value, index) => ({
  account: `directory-account-${index}`,
  name: `目录成员-${index}`,
}));
const manyCandidatesResult = {
  status: 'needs_input' as const,
  field: 'ownerAccount',
  message: '负责人姓名存在重名，请提供负责人账号',
  candidates: manyCandidates,
};
const manyCandidatesClient = new JixiangOsWechatClient(config, {
  fetch: async () => response(200, { code: 0, data: manyCandidatesResult, message: 'success' }),
});
assert.deepEqual(await manyCandidatesClient.check(customer), manyCandidatesResult);

for (const malformedResult of [
  { status: 'unexpected', message: 'private-payload' },
  { status: 'needs_input', field: 'name', message: '请提供客户姓名', unexpected: 'private-payload' },
  { status: 'needs_input', field: '', message: '' },
  { status: 'duplicate', message: '' },
  { status: 'ready', normalized: normalizedCustomer, precheckToken: 'opaque-token' },
  { status: 'ready', normalized: normalizedCustomer, precheckToken: '', expiresAt: '2026-07-25T00:00:00.000Z' },
  { status: 'ready', normalized: normalizedCustomer, precheckToken: 'opaque-token', expiresAt: 'not-an-iso-datetime' },
  { status: 'ready', normalized: { ...normalizedCustomer, name: '' }, precheckToken: 'opaque-token', expiresAt: '2026-07-25T00:00:00.000Z' },
]) {
  const malformed = new JixiangOsWechatClient(config, {
    fetch: async () => response(200, { code: 0, data: malformedResult, message: 'success' }),
  });
  await assert.rejects(() => malformed.check(customer), (error: unknown) => (
    error instanceof JixiangOsToolError
    && (error as Error).message === '系统响应异常，请稍后重试。'
    && !(error as Error).message.includes('private-payload')
  ));
}

const createCalls: Array<{ url: string; init?: RequestInit }> = [];
const readyThenCreate = new JixiangOsWechatClient(config, {
  fetch: async (url, init) => {
    createCalls.push({ url: String(url), init });
    return createCalls.length === 1
      ? response(200, { code: 0, data: { status: 'ready', normalized: normalizedCustomer, precheckToken: 'matched-token', expiresAt: '2026-07-25T00:00:00.000Z' }, message: 'success' })
      : response(201, { code: 0, data: { status: 'created', customer: { id: 'customer-1', name: '客户', company: '', owner: '负责人' }, detailPath: '/customers/customer-1' }, message: 'success' });
  },
});
await readyThenCreate.check(customer);
await assert.rejects(() => readyThenCreate.create({ ...customer, name: '不同客户' }, 'matched-token'), /预检凭据与本次客户信息不匹配/);
const createdResult = await readyThenCreate.create(customer, 'matched-token');
assert.equal(createdResult.status, 'created');
assert.equal(createCalls[1]?.url, 'https://jxos.example.test/api/automation/wechat/customers/create');
const { signal: createSignal, ...createRequestInit } = createCalls[1]?.init || {};
assert.ok(createSignal instanceof AbortSignal);
assert.deepEqual(createRequestInit, {
  method: 'POST',
  redirect: 'error',
  headers: {
    Authorization: 'Bearer test-automation-token',
    'X-JXOS-WECHAT-SENDER': 'test-sender',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ customer, precheckToken: 'matched-token' }),
});

let boundaryCreateCalls = 0;
const boundaryCreatedResult = {
  status: 'created' as const,
  customer: boundarySummary,
  detailPath: '/customers/customer-boundary',
};
const boundaryCreateClient = new JixiangOsWechatClient(config, {
  fetch: async (url, init) => {
    boundaryCreateCalls += 1;
    return boundaryCreateCalls === 1
      ? fetchStub(url, init)
      : response(201, { code: 0, data: boundaryCreatedResult, message: 'success' });
  },
});
await boundaryCreateClient.check(customer);
assert.deepEqual(await boundaryCreateClient.create(customer, 'opaque-token'), boundaryCreatedResult);

for (const malformedResult of [
  { status: 'unknown', message: 'private-payload' },
  { status: 'created', customer: { id: 'customer-1', name: '客户', company: '', owner: '负责人' }, detailPath: '/customers/customer-1', unexpected: 'private-payload' },
  { status: 'created', customer: { id: 'customer-1', name: '客户', company: '', owner: '负责人' } },
  { status: 'created', customer: { id: '', name: '客户', company: '', owner: '负责人' }, detailPath: '/customers/' },
  { status: 'created', customer: { id: 'customer-1', name: '', company: '', owner: '负责人' }, detailPath: '/customers/customer-1' },
  { status: 'created', customer: { id: 'customer-1', name: '客户', company: '', owner: '负责人' }, detailPath: '/customers/different-id' },
  { status: 'replayed', customer: { id: 'customer-1', name: '客户', company: '', owner: '负责人' }, detailPath: 'https://unsafe.test/customers/customer-1' },
  { status: 'duplicate', message: '' },
]) {
  let requestCount = 0;
  const malformed = new JixiangOsWechatClient(config, {
    fetch: async (url, init) => {
      requestCount += 1;
      return requestCount === 1
        ? fetchStub(url, init)
        : response(201, { code: 0, data: malformedResult, message: 'success' });
    },
  });
  await malformed.check(customer);
  await assert.rejects(() => malformed.create(customer, 'opaque-token'), (error: unknown) => (
    error instanceof JixiangOsToolError
    && (error as Error).message === '创建请求结果不确定，请先核验客户是否已存在；未写入系统'
    && (error as Error).message.endsWith('未写入系统')
    && !(error as Error).message.includes('private-payload')
  ));
}

for (const expectedResult of [
  { status: 'replayed', customer: { id: 'customer-1', name: '客户', company: '', owner: '负责人' }, detailPath: '/customers/customer-1' },
  { status: 'duplicate', message: '系统中已存在相同联系方式' },
] as const) {
  let callCount = 0;
  const passthrough = new JixiangOsWechatClient({ ...config, requestTimeoutMs: 100 }, {
    fetch: async (url, init) => {
      callCount += 1;
      return callCount === 1 ? fetchStub(url, init) : response(200, { code: 0, data: expectedResult, message: 'success' });
    },
  });
  await passthrough.check(customer);
  assert.deepEqual(await passthrough.create(customer, 'opaque-token'), expectedResult);
}

let timeoutRequests = 0;
const timeoutClient = new JixiangOsWechatClient({ ...config, requestTimeoutMs: 100 }, {
  fetch: async (url, init) => {
    timeoutRequests += 1;
    if (timeoutRequests === 1) return fetchStub(url, init);
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
  },
});
await timeoutClient.check(customer);
await assert.rejects(() => timeoutClient.create(customer, 'opaque-token'), /未写入系统/);

for (const partial of [
  { apiBase: '' },
  { automationToken: '' },
  { senderId: '' },
  { detailUrlTemplate: '' },
  { requestTimeoutMs: 0 },
]) {
  assert.throws(() => validateConfig({ ...config, ...partial }));
}

console.log('openclaw jixiangos client initial contract test passed');
