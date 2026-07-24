import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as indexModule from './index';
import { CUSTOMER_FIELD_LIMITS } from './client';
import {
  TOOL_NAMES,
  createMcpServer,
  customerCheckSchema,
  customerCreateSchema,
  formatToolResult,
} from './index';

assert.deepEqual(TOOL_NAMES, ['jxos_customer_check', 'jxos_customer_create']);
const formatStartupDiagnostic = (indexModule as unknown as {
  formatStartupDiagnostic?: (error: unknown) => string;
}).formatStartupDiagnostic;
assert.equal(typeof formatStartupDiagnostic, 'function');
const unsafeStartupDiagnostic = formatStartupDiagnostic!(new Error(
  'transport failed: Bearer fake-token 13800000000 wx_private raw-sender precheck-token-like',
));
assert.equal(unsafeStartupDiagnostic, 'JixiangOS MCP 启动失败：启动失败，请检查配置和运行环境。\n');
assert.doesNotMatch(
  unsafeStartupDiagnostic,
  /fake-token|13800000000|wx_private|raw-sender|precheck-token-like/,
);
assert.equal(
  formatStartupDiagnostic!(new Error('JIXIANG_OS_API_BASE 格式无效')),
  'JixiangOS MCP 启动失败：JIXIANG_OS_API_BASE 格式无效\n',
);
assert.doesNotMatch(
  readFileSync(new URL('./client.ts', import.meta.url), 'utf8'),
  /console\.(log|error)|process\.(stdout|stderr)/,
  'HTTP client must not log request or response bodies',
);
assert.equal(customerCheckSchema.safeParse({
  customer: { name: '客户', phone: '13800000000', leadSource: '官网' },
}).success, true);
assert.equal(customerCheckSchema.safeParse({
  customer: { name: '客户', company: 'x'.repeat(CUSTOMER_FIELD_LIMITS.text), leadSource: '官网' },
}).success, true);
assert.equal(customerCheckSchema.safeParse({
  customer: { name: '客户', company: 'x'.repeat(CUSTOMER_FIELD_LIMITS.text + 1), leadSource: '官网' },
}).success, false);
for (const dangerousName of ['url', 'command', 'shell', 'file', 'database']) {
  assert.equal(customerCheckSchema.safeParse({
    customer: {
      name: '客户', phone: '13800000000', leadSource: '官网',
      [dangerousName]: 'unsupported-capability',
    },
  }).success, false, `customer schema must reject nested ${dangerousName} capability input`);
}
assert.equal(customerCreateSchema.safeParse({
  customer: { name: '客户', wechat: 'wx_demo', leadSource: '官网' },
  precheckToken: 'opaque-token',
}).success, true);

let checkCallbackCalls = 0;
let createCallbackCalls = 0;
const server = createMcpServer({
  check: async () => {
    checkCallbackCalls += 1;
    return { status: 'needs_input', field: 'name', message: '请提供客户姓名' };
  },
  create: async () => {
    createCallbackCalls += 1;
    return { status: 'created', customer: { id: 'customer-1', name: '客户', company: '', owner: '负责人' }, detailPath: '/customers/customer-1' };
  },
}, 'https://jxos.example.test{detailPath}');
const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
const mcpClient = new Client({ name: 'surface-test', version: '1.0.0' });
await server.connect(serverTransport);
await mcpClient.connect(clientTransport);
const listed = await mcpClient.listTools();
assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [...TOOL_NAMES].sort());
assert.deepEqual(
  listed.tools.flatMap((tool) => Object.keys(tool.inputSchema.properties || {})).sort(),
  ['customer', 'customer', 'precheckToken'],
  'the runtime tool surface exposes only the two customer-operation schemas',
);
const rejectedCheck = await mcpClient.callTool({
  name: 'jxos_customer_check',
  arguments: {
    customer: { name: '客户', phone: '13800000000', leadSource: '官网' },
    command: 'unsupported-capability',
  },
});
assert.equal(rejectedCheck.isError, true);
assert.equal(checkCallbackCalls, 0, 'invalid top-level check input must not call the HTTP client');
const rejectedCreate = await mcpClient.callTool({
  name: 'jxos_customer_create',
  arguments: {
    customer: { name: '客户', wechat: 'wx_demo', leadSource: '官网' },
    precheckToken: 'opaque-token',
    unexpected: 'unsupported-capability',
  },
});
assert.equal(rejectedCreate.isError, true);
assert.equal(createCallbackCalls, 0, 'invalid top-level create input must not call the HTTP client');
await mcpClient.close();
await server.close();

assert.deepEqual(formatToolResult({ status: 'duplicate', message: '系统中已存在相同联系方式' }), {
  content: [{ type: 'text', text: '{"status":"duplicate","message":"系统中已存在相同联系方式"}' }],
});
assert.match(
  formatToolResult({ status: 'created', customer: { id: 'customer-1', name: '客户', company: '', owner: '负责人' }, detailPath: '/customers/customer-1' }, 'https://jxos.example.test{detailPath}').content[0]?.text || '',
  /https:\/\/jxos\.example\.test\/customers\/customer-1/,
);

console.log('openclaw jixiangos MCP surface test passed');
