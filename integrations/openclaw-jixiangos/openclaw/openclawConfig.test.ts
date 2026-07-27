import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const verifierPath = resolve(projectRoot, 'scripts/verify-wechat-customer-automation.ts');
const configPath = fileURLToPath(new URL('./openclaw.example.json', import.meta.url));
const agentsPath = fileURLToPath(new URL('./AGENTS.md', import.meta.url));
const toolsPath = fileURLToPath(new URL('./TOOLS.md', import.meta.url));

assert.ok(existsSync(verifierPath), 'the verifier must exist before OpenClaw policy validation can run');
const { validateOpenClawPolicy } = await import('../../../scripts/verify-wechat-customer-automation');

for (const [label, path] of [
  ['redacted OpenClaw example', configPath],
  ['agent prompt', agentsPath],
  ['tool policy', toolsPath],
] as const) {
  assert.ok(existsSync(path), `${label} must exist`);
}

const configText = readFileSync(configPath, 'utf8');
const config = JSON.parse(configText) as Record<string, unknown>;
const agentsMarkdown = readFileSync(agentsPath, 'utf8');
const toolsMarkdown = readFileSync(toolsPath, 'utf8');

assert.doesNotThrow(() => validateOpenClawPolicy(config, agentsMarkdown, toolsMarkdown));

const agent = ((config.agents as { list: Array<Record<string, unknown>> }).list[0]);
assert.equal(agent.id, 'jixiangos-crm');
assert.equal((config.session as { dmScope: string }).dmScope, 'per-account-channel-peer');
assert.deepEqual(
  (agent.tools as { allow: string[] }).allow,
  ['jxos_customer_check', 'jxos_customer_create'],
  'the agent tool allowlist must contain exactly the two customer tools',
);
const mcpServer = ((config.mcp as { servers: Record<string, Record<string, unknown>> }).servers)[
  'jixiangos-crm'
];
assert.deepEqual(
  (mcpServer.toolFilter as { include?: string[] } | undefined)?.include,
  ['jxos_customer_check', 'jxos_customer_create'],
  'the version-sensitive MCP server example must use the current toolFilter.include shape',
);
assert.equal('include' in mcpServer, false, 'the stale root-level MCP include key must not be presented as current syntax');
assert.deepEqual(
  (config.channels as Record<string, { allowFrom: string[] }>)['openclaw-weixin'].allowFrom,
  ['<ALLOWLISTED_PRIVATE_SENDER_ID>'],
);

for (const dangerousTool of ['exec', 'shell', 'read', 'write', 'browser', 'database', 'customer_search']) {
  const unsafe = structuredClone(config) as typeof config;
  const unsafeAgent = (unsafe.agents as { list: Array<{ tools: { allow: string[] } }> }).list[0];
  unsafeAgent.tools.allow.push(dangerousTool);
  assert.throws(
    () => validateOpenClawPolicy(unsafe, agentsMarkdown, toolsMarkdown),
    /exactly jxos_customer_check and jxos_customer_create/,
    `policy validation must reject additional tool ${dangerousTool}`,
  );
  const unsafeMcp = structuredClone(config) as typeof config;
  const unsafeServer = (((unsafeMcp.mcp as {
    servers: Record<string, { toolFilter: { include: string[] } }>;
  }).servers)[
    'jixiangos-crm'
  ]);
  unsafeServer.toolFilter.include.push(dangerousTool);
  assert.throws(
    () => validateOpenClawPolicy(unsafeMcp, agentsMarkdown, toolsMarkdown),
    /exactly jxos_customer_check and jxos_customer_create/,
    `MCP policy validation must reject additional tool ${dangerousTool}`,
  );
}

const wildcardSender = structuredClone(config) as typeof config;
(wildcardSender.channels as Record<string, { allowFrom: string[] }>)[
  'openclaw-weixin'
].allowFrom.push('*');
assert.throws(
  () => validateOpenClawPolicy(wildcardSender, agentsMarkdown, toolsMarkdown),
  /single redacted private sender placeholder/,
);

const sharedDm = structuredClone(config) as typeof config;
(sharedDm.session as { dmScope: string }).dmScope = 'main';
assert.throws(() => validateOpenClawPolicy(sharedDm, agentsMarkdown, toolsMarkdown), /per-account-channel-peer/);

for (const requiredRule of [
  '仅处理纯文本和引用文本',
  '不处理联系人名片、图片或语音',
  '不得猜测',
  '一次只追问一个缺失字段',
  '创建前必须先调用 `jxos_customer_check`',
  '`duplicate` 必须停止',
  '`ready` 必须自动调用 `jxos_customer_create`',
  '不再进行第二次用户确认',
  '未写入系统',
  '禁止批量新增、删除、覆盖或合并、阶段变更、对外发消息、客户搜索、创建跟进',
]) {
  assert.match(agentsMarkdown, new RegExp(requiredRule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

assert.doesNotMatch(
  configText,
  /Bearer\s+\S+|https?:\/\/(?!localhost|127\.0\.0\.1|\[::1\])[^"\s]+|1[3-9]\d{9}/,
  'the example must not contain a bearer value, real non-loopback API host, or phone number',
);
for (const placeholder of [
  '<OPENCLAW_AGENT_WORKSPACE>',
  '<REPOSITORY_ROOT>',
  '<WEIXIN_ACCOUNT_ID>',
  '<ALLOWLISTED_PRIVATE_SENDER_ID>',
  '<JIXIANG_OS_API_BASE>',
  '<JIXIANG_OS_AUTOMATION_TOKEN>',
]) {
  assert.match(configText, new RegExp(placeholder.replace(/[<>]/g, '\\$&')));
}

console.log('OpenClaw static policy test passed');
