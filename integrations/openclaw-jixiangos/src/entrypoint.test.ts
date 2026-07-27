import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TOOL_NAMES } from './index';

const projectRoot = resolve(import.meta.dirname, '../../..');
const testRoot = mkdtempSync(join(tmpdir(), 'jixiangos-mcp-entrypoint-'));
const projectAlias = join(testRoot, 'project-alias');
symlinkSync(projectRoot, projectAlias, process.platform === 'win32' ? 'junction' : 'dir');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', 'tsx', 'integrations/openclaw-jixiangos/src/index.ts'],
  cwd: projectAlias,
  stderr: 'pipe',
  env: {
    ...getDefaultEnvironment(),
    JIXIANG_OS_API_BASE: 'http://127.0.0.1:3001',
    JIXIANG_OS_AUTOMATION_TOKEN: randomBytes(32).toString('hex'),
    JIXIANG_OS_WECHAT_SENDER_ID: 'synthetic-entrypoint-test-sender',
    JIXIANG_OS_CUSTOMER_DETAIL_URL_TEMPLATE: 'http://127.0.0.1:3002{detailPath}',
    JIXIANG_OS_REQUEST_TIMEOUT_MS: '5000',
  },
});
const client = new Client({ name: 'entrypoint-test', version: '1.0.0' });

try {
  await client.connect(transport);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [...TOOL_NAMES].sort());
  await client.close();
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}

console.log('openclaw jixiangos MCP stdio entrypoint test passed');
