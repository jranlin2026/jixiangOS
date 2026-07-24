import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_NAMES = ['jxos_customer_check', 'jxos_customer_create'] as const;
const PRIVATE_SENDER_PLACEHOLDER = '<ALLOWLISTED_PRIVATE_SENDER_ID>';
const PRODUCTION_MARKERS = /(prod|production|live|main|primary)/i;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const QA_CUSTOMER_FIELDS = new Set([
  'name', 'company', 'phone', 'wechat', 'leadSource', 'sourceName', 'sourceType',
  'ownerAccount', 'ownerName', 'leadContributorAccount', 'industry', 'city', 'tagNames', 'remark',
]);

type StaticOptions = { mode: 'static'; configPath?: string };
type LiveOptions = {
  mode: 'live';
  acknowledged: boolean;
  apiOrigin: string;
  qaDatabaseName: string;
  qaDataPath: string;
  configPath?: string;
};
export type VerifierOptions = StaticOptions | LiveOptions;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type VerifierDependencies = {
  projectRoot?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: FetchLike;
  readTextFile?: (path: string) => string;
};

type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
);

function requireRecord(value: unknown, message: string): JsonRecord {
  const result = record(value);
  if (!result) throw new Error(message);
  return result;
}

function requireExactTools(value: unknown): void {
  if (!Array.isArray(value)
    || value.length !== TOOL_NAMES.length
    || value.some((entry, index) => entry !== TOOL_NAMES[index])) {
    throw new Error('OpenClaw agent tools must allow exactly jxos_customer_check and jxos_customer_create.');
  }
}

function requireMarkdownRules(agentsMarkdown: string, toolsMarkdown: string): void {
  const rules = [
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
  ];
  for (const rule of rules) {
    if (!agentsMarkdown.includes(rule)) throw new Error(`AGENTS.md is missing required policy marker: ${rule}`);
  }
  for (const tool of TOOL_NAMES) {
    if (!toolsMarkdown.includes(`\`${tool}\``)) throw new Error(`TOOLS.md is missing ${tool}.`);
  }
  if (/\b(exec|shell|browser|database)\b/i.test(toolsMarkdown.split('不存在第三个可用工具。')[0] || '')) {
    throw new Error('TOOLS.md must not advertise dangerous tools.');
  }
}

export function validateOpenClawPolicy(
  configValue: unknown,
  agentsMarkdown: string,
  toolsMarkdown: string,
): void {
  const config = requireRecord(configValue, 'OpenClaw example must be a JSON object.');
  const session = requireRecord(config.session, 'OpenClaw session policy is missing.');
  if (session.dmScope !== 'per-account-channel-peer') {
    throw new Error('OpenClaw session.dmScope must be per-account-channel-peer.');
  }

  const agents = requireRecord(config.agents, 'OpenClaw agents policy is missing.');
  if (!Array.isArray(agents.list) || agents.list.length !== 1) {
    throw new Error('OpenClaw example must contain one dedicated agent.');
  }
  const agent = requireRecord(agents.list[0], 'OpenClaw dedicated agent is invalid.');
  if (agent.id !== 'jixiangos-crm') throw new Error('OpenClaw agent id must be jixiangos-crm.');
  requireExactTools(requireRecord(agent.tools, 'OpenClaw agent tools are missing.').allow);

  const channels = requireRecord(config.channels, 'OpenClaw channels policy is missing.');
  const channel = requireRecord(channels['openclaw-weixin'], 'openclaw-weixin policy is missing.');
  if (channel.dmPolicy !== 'allowlist' || channel.contextVisibility !== 'allowlist') {
    throw new Error('openclaw-weixin must use allowlist trigger and context policies.');
  }
  if (!Array.isArray(channel.allowFrom)
    || channel.allowFrom.length !== 1
    || channel.allowFrom[0] !== PRIVATE_SENDER_PLACEHOLDER) {
    throw new Error('openclaw-weixin must contain a single redacted private sender placeholder.');
  }

  if (!Array.isArray(config.bindings) || config.bindings.length !== 1) {
    throw new Error('OpenClaw example must contain one exact Weixin route binding.');
  }
  const binding = requireRecord(config.bindings[0], 'OpenClaw binding is invalid.');
  const match = requireRecord(binding.match, 'OpenClaw binding match is invalid.');
  const peer = requireRecord(match.peer, 'OpenClaw binding peer is invalid.');
  if (binding.agentId !== 'jixiangos-crm'
    || match.channel !== 'openclaw-weixin'
    || match.accountId !== '<WEIXIN_ACCOUNT_ID>'
    || peer.kind !== 'direct'
    || peer.id !== PRIVATE_SENDER_PLACEHOLDER) {
    throw new Error('Only the exact allowlisted Weixin account/private peer may route to jixiangos-crm.');
  }

  const mcp = requireRecord(config.mcp, 'OpenClaw MCP policy is missing.');
  const servers = requireRecord(mcp.servers, 'OpenClaw MCP server registry is missing.');
  const server = requireRecord(servers['jixiangos-crm'], 'jixiangos-crm MCP server is missing.');
  const toolFilter = requireRecord(server.toolFilter, 'jixiangos-crm MCP tool filter is missing.');
  requireExactTools(toolFilter.include);
  if ('include' in server) throw new Error('jixiangos-crm MCP include must be nested under toolFilter.');
  const env = requireRecord(server.env, 'jixiangos-crm MCP environment template is missing.');
  if (env.JIXIANG_OS_WECHAT_SENDER_ID !== PRIVATE_SENDER_PLACEHOLDER) {
    throw new Error('MCP sender id must match the allowlisted private sender placeholder.');
  }
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== 'string' || !/^<[A-Z0-9_]+>$/.test(value)) {
      throw new Error(`MCP environment value ${name} must stay redacted.`);
    }
  }

  requireMarkdownRules(agentsMarkdown, toolsMarkdown);
}

function valueAfterEquals(argument: string, name: string): string | null {
  const prefix = `${name}=`;
  return argument.startsWith(prefix) ? argument.slice(prefix.length).trim() : null;
}

export function parseVerifierArgs(argv: string[]): VerifierOptions {
  let live = false;
  let acknowledged = false;
  let apiOrigin = '';
  let qaDatabaseName = '';
  let qaDataPath = '';
  let configPath: string | undefined;
  for (const argument of argv) {
    if (argument === '--live') live = true;
    else if (argument === '--acknowledge-disposable-qa-write') acknowledged = true;
    else if (valueAfterEquals(argument, '--api-origin') !== null) apiOrigin = valueAfterEquals(argument, '--api-origin') || '';
    else if (valueAfterEquals(argument, '--qa-database-name') !== null) qaDatabaseName = valueAfterEquals(argument, '--qa-database-name') || '';
    else if (valueAfterEquals(argument, '--qa-data') !== null) qaDataPath = valueAfterEquals(argument, '--qa-data') || '';
    else if (valueAfterEquals(argument, '--config') !== null) configPath = valueAfterEquals(argument, '--config') || undefined;
    else throw new Error(`Unknown verifier flag: ${argument.split('=')[0]}`);
  }
  if (!live) {
    if (acknowledged || apiOrigin || qaDatabaseName || qaDataPath) {
      throw new Error('Live-only flags require the explicit --live opt-in.');
    }
    return { mode: 'static', configPath };
  }
  return { mode: 'live', acknowledged, apiOrigin, qaDatabaseName, qaDataPath, configPath };
}

function assertSafeLiveOptions(options: LiveOptions, env: NodeJS.ProcessEnv): { origin: URL; qaDatabaseName: string } {
  if (!options.acknowledged) {
    throw new Error('Live QA requires --acknowledge-disposable-qa-write as the second explicit acknowledgement.');
  }
  let origin: URL;
  try {
    origin = new URL(options.apiOrigin);
  } catch {
    throw new Error('Live QA requires a valid loopback --api-origin.');
  }
  if (!LOOPBACK_HOSTS.has(origin.hostname)
    || !['http:', 'https:'].includes(origin.protocol)
    || origin.username
    || origin.password
    || (origin.pathname !== '/' && origin.pathname !== '')
    || origin.search
    || origin.hash) {
    throw new Error('Live QA requires a loopback API origin with no path, credentials, query, or fragment.');
  }
  const qaDatabaseName = options.qaDatabaseName || env.QA_DATABASE_NAME?.trim() || '';
  if (PRODUCTION_MARKERS.test(qaDatabaseName)) {
    throw new Error('Live QA database name is production-like and is rejected.');
  }
  const lowerName = qaDatabaseName.toLowerCase();
  if (!lowerName.includes('_qa') && !lowerName.includes('_test')) {
    throw new Error('Live QA database name must contain _qa or _test.');
  }
  if (!options.qaDataPath) throw new Error('Live QA requires caller-supplied --qa-data.');
  return { origin, qaDatabaseName };
}

function loadQaCustomer(text: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('QA data must be valid JSON.');
  }
  const root = requireRecord(parsed, 'QA data must be an object.');
  if (Object.keys(root).some((key) => key !== 'disposableQa' && key !== 'customer')) {
    throw new Error('QA data contains an unsupported root field.');
  }
  if (root.disposableQa !== true) throw new Error('QA data must explicitly set disposableQa to true.');
  const customer = requireRecord(root.customer, 'QA data must contain customer input.');
  if (Object.keys(customer).some((key) => !QA_CUSTOMER_FIELDS.has(key))) {
    throw new Error('QA data contains an unsupported QA customer field.');
  }
  for (const [key, value] of Object.entries(customer)) {
    const valid = key === 'tagNames'
      ? Array.isArray(value) && value.every((entry) => typeof entry === 'string')
      : typeof value === 'string';
    if (!valid) throw new Error('QA customer fields must use supported string or string-array values.');
  }
  const nonBlank = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
  if (!nonBlank(customer.name) || !nonBlank(customer.leadSource)
    || (!nonBlank(customer.phone) && !nonBlank(customer.wechat))) {
    throw new Error('QA customer requires name, leadSource, and phone or wechat.');
  }
  return customer;
}

export function safeVerifierFailureMessage(operation: 'check' | 'create', status: number): string {
  if (operation === 'check' && status === 401) return '预检验证未通过认证；未写入系统';
  if (operation === 'create' && (status === 0 || status >= 500)) {
    return '创建验证遇到不确定的服务器错误；未写入系统';
  }
  return operation === 'create'
    ? `创建验证失败（HTTP ${status}）；未写入系统`
    : `预检验证失败（HTTP ${status}）；未写入系统`;
}

async function postJson(
  fetchImpl: FetchLike,
  url: URL,
  operation: 'check' | 'create',
  headers: Record<string, string>,
  body: JsonRecord,
): Promise<{ data: JsonRecord; headers: Headers }> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      redirect: 'error',
    });
  } catch {
    throw new Error(safeVerifierFailureMessage(operation, 0));
  }
  if (!response.ok) throw new Error(safeVerifierFailureMessage(operation, response.status));
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(safeVerifierFailureMessage(operation, 0));
  }
  const envelope = requireRecord(payload, safeVerifierFailureMessage(operation, 0));
  if (envelope.code !== 0) throw new Error(safeVerifierFailureMessage(operation, response.status));
  return {
    data: requireRecord(envelope.data, safeVerifierFailureMessage(operation, 0)),
    headers: response.headers,
  };
}

function staticPaths(projectRoot: string, configPath?: string) {
  const openClawDir = resolve(projectRoot, 'integrations/openclaw-jixiangos/openclaw');
  return {
    config: configPath ? resolve(configPath) : resolve(openClawDir, 'openclaw.example.json'),
    agents: resolve(openClawDir, 'AGENTS.md'),
    tools: resolve(openClawDir, 'TOOLS.md'),
  };
}

export async function runVerifier(
  options: VerifierOptions,
  dependencies: VerifierDependencies = {},
): Promise<Record<string, unknown>> {
  const projectRoot = dependencies.projectRoot || resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const readTextFile = dependencies.readTextFile || ((path: string) => readFileSync(path, 'utf8'));
  const paths = staticPaths(projectRoot, options.configPath);
  const config = JSON.parse(readTextFile(paths.config)) as unknown;
  validateOpenClawPolicy(config, readTextFile(paths.agents), readTextFile(paths.tools));

  if (options.mode === 'static') {
    return { mode: 'static', configPolicy: 'passed', networkRequests: 0, databaseWrites: 0 };
  }

  const env = dependencies.env || process.env;
  const { origin, qaDatabaseName } = assertSafeLiveOptions(options, env);
  const token = env.JIXIANG_OS_AUTOMATION_TOKEN?.trim() || '';
  const senderId = env.JIXIANG_OS_WECHAT_SENDER_ID?.trim() || '';
  if (!token || !senderId) {
    throw new Error('Live QA requires JIXIANG_OS_AUTOMATION_TOKEN and JIXIANG_OS_WECHAT_SENDER_ID in the process environment.');
  }
  const customer = loadQaCustomer(readTextFile(options.qaDataPath));
  const fetchImpl = dependencies.fetch || fetch;
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-jxos-wechat-sender': senderId,
  };
  const endpoint = (action: 'check' | 'create') => new URL(`/api/automation/wechat/customers/${action}`, origin);

  let resetRequired = false;
  try {
    const checked = await postJson(fetchImpl, endpoint('check'), 'check', {
      ...headers,
      'x-jxos-qa-database-proof': qaDatabaseName,
    }, { customer });
    if (checked.headers.get('x-jxos-qa-database-proof') !== qaDatabaseName) {
      throw new Error('QA database identity proof failed; no create request was sent.');
    }
    const check = checked.data;
    if (check.status === 'duplicate') resetRequired = true;
    if (check.status !== 'ready' || typeof check.precheckToken !== 'string' || !check.precheckToken) {
      throw new Error('预检未返回 ready；未写入系统');
    }
    const createBody = { customer, precheckToken: check.precheckToken };
    resetRequired = true;
    const created = (await postJson(fetchImpl, endpoint('create'), 'create', headers, createBody)).data;
    if (created.status !== 'created') throw new Error('首次创建未返回 created；未写入系统');
    const replayed = (await postJson(fetchImpl, endpoint('create'), 'create', headers, createBody)).data;
    if (replayed.status !== 'replayed') throw new Error('重放未返回 replayed；未写入系统');
    const createdId = record(created.customer)?.id;
    const replayedId = record(replayed.customer)?.id;
    if (typeof createdId !== 'string' || !createdId || createdId !== replayedId) {
      throw new Error('创建与重放的客户 ID 不稳定；未写入系统');
    }
    try {
      await postJson(fetchImpl, endpoint('check'), 'check', {
        ...headers,
        authorization: 'Bearer [VERIFIER_NEGATIVE_PROBE]',
      }, { customer });
      throw new Error('负向认证检查意外成功；未写入系统');
    } catch (error) {
      if (!(error instanceof Error)
        || error.message !== safeVerifierFailureMessage('check', 401)) {
        throw new Error('负向认证检查未返回预期的安全失败；未写入系统');
      }
    }
  } catch (error) {
    if (resetRequired) throw new Error('QA客户已经或可能存在，必须重置隔离库');
    throw error;
  }

  return {
    mode: 'live-qa',
    targetSafety: 'loopback API and authenticated QA database identity proven',
    checkStatus: 'ready',
    createStatus: 'created',
    replayStatus: 'replayed',
    stableCustomerId: true,
    safeFailureMessages: '401 check mapping verified without reading response body',
    networkRequests: 4,
    databaseWrites: 'create endpoint invoked once; replay verified',
    cleanup: 'manual isolated-database reset required',
    openClawAuthorization: 'not-proven; Windows manual acceptance required',
  };
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const report = await runVerifier(parseVerifierArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`WeChat automation verification failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  }
}
