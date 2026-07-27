import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  CUSTOMER_FIELD_LIMITS,
  configFromEnvironment,
  JixiangOsToolError,
  JixiangOsWechatClient,
  renderCustomerDetailUrl,
  type CustomerInput,
  type WechatCheckResult,
  type WechatCreateResult,
} from './client';

const text = z.string().trim().min(1).max(CUSTOMER_FIELD_LIMITS.text).optional();
const customerSchema = z.object({
  name: text,
  company: text,
  phone: text,
  wechat: text,
  leadSource: text,
  sourceName: text,
  sourceType: z.enum(['公司资源', '个人资源']).optional(),
  ownerAccount: text,
  ownerName: text,
  leadContributorAccount: text,
  industry: text,
  city: text,
  tagNames: z.array(z.string().trim().min(1).max(CUSTOMER_FIELD_LIMITS.tagName))
    .max(CUSTOMER_FIELD_LIMITS.tagCount).optional(),
  remark: z.string().trim().max(CUSTOMER_FIELD_LIMITS.remark).optional(),
}).strict();

export const customerCheckSchema = z.object({ customer: customerSchema }).strict();
export const customerCreateSchema = z.object({
  customer: customerSchema,
  precheckToken: z.string().trim().min(1).max(CUSTOMER_FIELD_LIMITS.precheckToken),
}).strict();

export const TOOL_NAMES = ['jxos_customer_check', 'jxos_customer_create'] as const;

const SAFE_STARTUP_MESSAGES = new Set([
  'JIXIANG_OS_REQUEST_TIMEOUT_MS 必须是 100 到 60000 的整数',
  'JIXIANG_OS_API_BASE 未配置',
  'JIXIANG_OS_API_BASE 必须是有效 URL',
  'JIXIANG_OS_API_BASE 必须使用 HTTPS（本机开发环境除外）',
  'JIXIANG_OS_API_BASE 格式无效',
  'JIXIANG_OS_AUTOMATION_TOKEN 未配置',
  'JIXIANG_OS_WECHAT_SENDER_ID 未配置',
  'JIXIANG_OS_CUSTOMER_DETAIL_URL_TEMPLATE 未配置',
  'JIXIANG_OS_CUSTOMER_DETAIL_URL_TEMPLATE 必须包含 {detailPath}',
  'JIXIANG_OS_CUSTOMER_DETAIL_URL_TEMPLATE 格式无效',
]);

export function formatStartupDiagnostic(error: unknown): string {
  const message = error instanceof Error && SAFE_STARTUP_MESSAGES.has(error.message)
    ? error.message
    : '启动失败，请检查配置和运行环境。';
  return `JixiangOS MCP 启动失败：${message}\n`;
}

export type WechatClient = {
  check(customer: CustomerInput): Promise<WechatCheckResult>;
  create(customer: CustomerInput, precheckToken: string): Promise<WechatCreateResult>;
};

export function formatToolResult(
  result: WechatCheckResult | WechatCreateResult,
  detailUrlTemplate?: string,
): { content: Array<{ type: 'text'; text: string }> } {
  const detailUrl = detailUrlTemplate && (result.status === 'created' || result.status === 'replayed')
    ? renderCustomerDetailUrl(detailUrlTemplate, result)
    : null;
  return {
    content: [{
      type: 'text',
      text: `${JSON.stringify(result)}${detailUrl ? `\n客户详情：${detailUrl}` : ''}`,
    }],
  };
}

function toolError(error: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  const message = error instanceof JixiangOsToolError
    ? error.message
    : '请求未完成，请稍后重新核验。';
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Registers the deliberately small, customer-only MCP surface. */
export function createMcpServer(client: WechatClient, detailUrlTemplate?: string): McpServer {
  const server = new McpServer({ name: 'jixiangos-openclaw', version: '1.0.0' });
  server.registerTool(TOOL_NAMES[0], {
    title: '核验客户',
    description: '核验客户信息、重复客户和创建前置条件。',
    inputSchema: customerCheckSchema,
  }, async ({ customer }) => {
    try {
      return formatToolResult(await client.check(customer), detailUrlTemplate);
    } catch (error) {
      return toolError(error);
    }
  });
  server.registerTool(TOOL_NAMES[1], {
    title: '创建客户',
    description: '使用同一会话中核验返回的预检凭据创建客户。',
    inputSchema: customerCreateSchema,
  }, async ({ customer, precheckToken }) => {
    try {
      return formatToolResult(await client.create(customer, precheckToken), detailUrlTemplate);
    } catch (error) {
      return toolError(error);
    }
  });
  return server;
}

export async function start(): Promise<void> {
  const config = configFromEnvironment();
  const server = createMcpServer(new JixiangOsWechatClient(config), config.detailUrlTemplate);
  await server.connect(new StdioServerTransport());
}

function isMainModule(moduleUrl: string, entrypoint: string | undefined): boolean {
  if (!entrypoint) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(resolve(entrypoint));
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  start().catch((error: unknown) => {
    process.stderr.write(formatStartupDiagnostic(error));
    process.exitCode = 1;
  });
}
