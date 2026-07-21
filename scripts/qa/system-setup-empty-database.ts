import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createConnection } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

interface TableCountRow extends RowDataPacket {
  tableCount: number;
}

const databaseUrl = new URL(String(process.env.DATABASE_URL || ''));
const databaseName = databaseUrl.pathname.slice(1);
if (!['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) || !/(?:^|_)(?:qa|test)(?:_|$)/.test(databaseName)) {
  throw new Error('SYSTEM_SETUP_QA_REQUIRES_LOOPBACK_TEST_DATABASE');
}
if (process.env.QA_ALLOW_DESTRUCTIVE_DB !== 'true') {
  throw new Error('system setup QA requires QA_ALLOW_DESTRUCTIVE_DB=true');
}
if (!process.env.QA_DATABASE_NAME || process.env.QA_DATABASE_NAME !== databaseName) {
  throw new Error('QA_DATABASE_NAME must exactly match the DATABASE_URL database name');
}

const connection = await createConnection(databaseUrl.toString());
try {
  const [rows] = await connection.query<TableCountRow[]>(
    'SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema = ?',
    [databaseName],
  );
  assert.equal(Number(rows[0]?.tableCount || 0), 0, 'QA_DATABASE_MUST_BE_EMPTY');
} finally {
  await connection.end();
}

const packageManagerCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
function run(args: string[]): void {
  const result = spawnSync(packageManagerCommand, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${packageManagerCommand} ${args.join(' ')} failed with status ${result.status}`);
}

run(['exec', 'prisma', 'migrate', 'deploy']);
run(['run', 'system:setup-qa']);
console.log('empty database migration and system setup QA passed');
