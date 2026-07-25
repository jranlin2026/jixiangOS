import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';

if (!process.env.DATABASE_URL) {
  console.log('business import migration integration skipped: DATABASE_URL is not set');
} else {
  const databaseUrl = new URL(process.env.DATABASE_URL);
  const scratchPrefix = `bit_${randomUUID().replace(/-/g, '').slice(0, 8)}_`;
  const table = (name: string) => `${scratchPrefix}${name}`;
  const batchesTable = table('business_import_batches');
  const jobsTable = table('business_import_jobs');
  const reservationsTable = table('business_import_number_reservations');
  const itemsTable = table('business_import_job_items');
  const recordsTable = table('business_records');
  const usersTable = table('users');
  const rolesTable = table('roles');
  const departmentsTable = table('departments');
  const storageTable = table('app_storage');
  const connection = await mysql.createConnection({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port || 3306),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: decodeURIComponent(databaseUrl.pathname.replace(/^\//, '')),
    multipleStatements: true,
  });
  let databaseObjectOrdinal = 0;
  const migration = async (name: string) => {
    let sql = await readFile(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8');
    sql = sql.split('business_import_').join(`${scratchPrefix}business_import_`);
    for (const original of ['business_records', 'users', 'roles', 'departments', 'app_storage']) {
      sql = sql.split(`\`${original}\``).join(`\`${table(original)}\``);
    }
    sql = sql.replace(/(UNIQUE INDEX|CREATE INDEX|INDEX|CONSTRAINT) `[^`]+`/g, (_match, kind: string) => {
      databaseObjectOrdinal += 1;
      return `${kind} \`${scratchPrefix}${databaseObjectOrdinal}\``;
    });
    return sql;
  };
  try {
    await connection.query(await migration('20260724020000_add_business_import_foundation'));
    await connection.query(await migration('20260724030000_add_business_import_execution'));
    await connection.query(`
      CREATE TABLE \`${recordsTable}\` (
        id VARCHAR(160) NOT NULL PRIMARY KEY,
        domain VARCHAR(80) NOT NULL,
        recordId VARCHAR(80) NOT NULL,
        data JSON NOT NULL,
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    for (const revisionSource of [usersTable, rolesTable, departmentsTable, storageTable]) {
      await connection.query(`CREATE TABLE \`${revisionSource}\` (id VARCHAR(64) NOT NULL PRIMARY KEY, updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))`);
    }

    const insertBatch = async (id: string) => connection.execute(
      `INSERT INTO \`${batchesTable}\`
        (id, importType, status, actorId, actorName, tokenHash, rowsHash, sourceFileName, \`rows\`, totalCount, readyCount, warningCount, blockedCount, expiresAt, consumedAt, updatedAt)
       VALUES (?, 'orders', 'failed', 'actor', '导入员', ?, ?, 'legacy.xlsx', JSON_ARRAY(), 4, 4, 0, 0, NOW(3), NOW(3), NOW(3))`,
      [id, id.padEnd(64, 't').slice(0, 64), id.padEnd(64, 'r').slice(0, 64)],
    );
    const insertJob = async (id: string, batchId: string, status: string, rows: unknown[]) => connection.execute(
      `INSERT INTO \`${jobsTable}\`
        (id, batchId, importType, status, actorId, actorName, rowsHash, sourceFileName, \`rows\`, idempotencyKey, totalCount, failedCount, successCount)
       VALUES (?, ?, 'orders', ?, 'actor', '导入员', ?, 'legacy.xlsx', ?, ?, ?, ?, ?)`,
      [id, batchId, status, id.padEnd(64, 'h').slice(0, 64), JSON.stringify(rows), id, rows.length,
        rows.filter((row: any) => row.executionStatus === 'failed').length,
        rows.filter((row: any) => row.executionStatus === 'succeeded').length],
    );
    const reserve = async (id: string, batchId: string, jobId: string, number: string) => connection.execute(
      `INSERT INTO \`${reservationsTable}\` (id, importType, normalizedNumber, batchId, jobId)
       VALUES (?, 'orders', ?, ?, ?)`, [id, number.toLowerCase(), batchId, jobId],
    );

    await insertBatch('batch-legacy-failed');
    const legacyRows = [
      { rowNumber: 2, status: 'ready', executionStatus: 'failed', normalized: { rowNumber: 2, thirdPartyOrderNo: 'FAIL-1' } },
      { rowNumber: 4, status: 'ready', executionStatus: 'failed', normalized: { rowNumber: 4, thirdPartyOrderNo: 'FAIL-2' } },
      { rowNumber: 5, status: 'ready', executionStatus: 'failed', normalized: { rowNumber: 5, thirdPartyOrderNo: 'FAIL-3' } },
      { rowNumber: 6, status: 'ready', executionStatus: 'failed', normalized: { rowNumber: 6, thirdPartyOrderNo: 'FAIL-4' } },
    ];
    await insertJob('job-legacy-failed', 'batch-legacy-failed', 'failed', legacyRows);
    for (let index = 1; index <= 4; index += 1) await reserve(`reservation-fail-${index}`, 'batch-legacy-failed', 'job-legacy-failed', `FAIL-${index}`);

    await insertBatch('batch-legacy-partial');
    await insertJob('job-legacy-partial', 'batch-legacy-partial', 'partial_failed', [
      { rowNumber: 8, status: 'ready', executionStatus: 'failed', normalized: { rowNumber: 8, thirdPartyOrderNo: 'KEEP-CREATED' } },
      { rowNumber: 9, status: 'ready', executionStatus: 'succeeded', normalized: { rowNumber: 9, thirdPartyOrderNo: 'KEEP-SUCCESS' } },
      { rowNumber: 10, status: 'ready', executionStatus: 'failed', normalized: { rowNumber: 10, thirdPartyOrderNo: 'DROP-FAILED' } },
    ]);
    await reserve('reservation-created', 'batch-legacy-partial', 'job-legacy-partial', 'KEEP-CREATED');
    await reserve('reservation-success', 'batch-legacy-partial', 'job-legacy-partial', 'KEEP-SUCCESS');
    await reserve('reservation-drop', 'batch-legacy-partial', 'job-legacy-partial', 'DROP-FAILED');
    await connection.execute(
      `INSERT INTO \`${recordsTable}\` (id, domain, recordId, data)
       VALUES ('created-row', 'aaos_order_applications', 'created-row', JSON_OBJECT('importBatchId', 'batch-legacy-partial', 'importRowNumber', 8))`,
    );

    await assert.doesNotReject(
      async () => connection.query(await migration('20260725010000_business_import_job_items')),
      '必须先以真实已部署的 010 版本建立历史 item',
    );
    const [backfilled] = await connection.query<any[]>(
      `SELECT rowNumber, JSON_EXTRACT(payload, '$.rowNumber') AS payloadRowNumber
       FROM \`${itemsTable}\` WHERE jobId = 'job-legacy-failed' ORDER BY rowNumber`,
    );
    assert.deepEqual(backfilled.map((row) => Number(row.rowNumber)), [2, 4, 5, 6]);
    assert.deepEqual(backfilled.map((row) => Number(row.payloadRowNumber)), [2, 4, 5, 6]);
    await assert.doesNotReject(
      async () => connection.query(await migration('20260725020000_business_import_directory_revision')),
      '目录版本迁移必须可在真实 MySQL 执行',
    );
    const [revisionIndexes] = await connection.query<any[]>(
      `SELECT DISTINCT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (?, ?, ?, ?, ?)
         AND INDEX_NAME LIKE ?`,
      [usersTable, rolesTable, departmentsTable, storageTable, recordsTable, `${scratchPrefix}%`],
    );
    assert.equal(revisionIndexes.length, 5, '关键事实的 MAX(updatedAt) 失效检查必须全部走有界索引');
    await connection.query(await migration('20260725030000_business_import_job_item_repair'));
    const legacy010 = await readFile(new URL('../../prisma/migrations/20260725010000_business_import_job_items/migration.sql', import.meta.url));
    const legacy030 = await readFile(new URL('../../prisma/migrations/20260725030000_business_import_job_item_repair/migration.sql', import.meta.url));
    assert.equal(createHash('sha256').update(legacy010).digest('hex'), 'b475dcc883c69b1da397f408706410aec73a697a820ed3d0283d56861f4e8629');
    assert.equal(createHash('sha256').update(legacy030).digest('hex'), '9cf034e891ac7d2c46bca95978a969e1d89f3bfe6e7fce93bb287fcff3de90fb');
    const [reservations] = await connection.query<any[]>(
      `SELECT normalizedNumber FROM \`${reservationsTable}\` ORDER BY normalizedNumber`,
    );
    assert.deepEqual(reservations.map((row) => row.normalizedNumber), ['keep-created', 'keep-success'],
      '旧 030 只释放无业务记录的终态失败行，成功行与已创建行保留占号');

    const [dirtyBefore] = await connection.query<any[]>(
      `SELECT id, reservedNumber FROM \`${itemsTable}\`
       WHERE jobId = 'job-legacy-failed' AND reservedNumber IN ('fail-1', 'fail-2') ORDER BY reservedNumber`,
    );
    await connection.query(
      `UPDATE \`${itemsTable}\` SET rowNumber = 2147483647, recordId = 'dirty-created',
         payload = JSON_SET(payload, '$.rowNumber', 2147483647, '$.normalized.rowNumber', 2147483647)
       WHERE jobId = 'job-legacy-failed' AND reservedNumber = 'fail-1'`,
    );
    await connection.query(
      `UPDATE \`${itemsTable}\` SET rowNumber = 0,
         payload = JSON_SET(payload, '$.rowNumber', 0, '$.normalized.rowNumber', 0)
       WHERE jobId = 'job-legacy-failed' AND reservedNumber = 'fail-2'`,
    );
    await connection.query(
      `INSERT INTO \`${reservationsTable}\` (id, importType, normalizedNumber, batchId, jobId, rowNumber)
       VALUES ('dirty-created-reservation', 'orders', 'fail-1', 'batch-legacy-failed', 'job-legacy-failed', 2147483647),
              ('dirty-failed-reservation', 'orders', 'fail-2', 'batch-legacy-failed', 'job-legacy-failed', 0)`,
    );
    await connection.query(
      `INSERT INTO \`${recordsTable}\` (id, domain, recordId, data)
       VALUES ('dirty-created', 'aaos_order_applications', 'dirty-created',
         JSON_OBJECT('importBatchId', 'batch-legacy-failed', 'importRowNumber', 2147483647))`,
    );

    await assert.doesNotReject(
      async () => connection.query(await migration('20260725040000_business_import_job_item_safe_repair')),
      '040 必须能从已应用旧 010/030 的真实库升级',
    );
    await assert.doesNotReject(
      async () => connection.query(await migration('20260725040000_business_import_job_item_safe_repair')),
      '040 重复执行必须可重入',
    );
    const [repairedAgain] = await connection.query<any[]>(
      `SELECT id, rowNumber, reservedNumber, JSON_EXTRACT(payload, '$.rowNumber') AS payloadRowNumber
       FROM \`${itemsTable}\` WHERE jobId = 'job-legacy-failed' ORDER BY rowNumber`,
    );
    assert.deepEqual(repairedAgain.map((row) => Number(row.rowNumber)), [2, 3, 5, 6], '040 只修复非法行号并保持唯一');
    assert.deepEqual(repairedAgain.map((row) => Number(row.payloadRowNumber)), [2, 3, 5, 6], 'item payload 行号必须与稳定映射同步');
    assert.equal(new Set(repairedAgain.map((row) => `${row.rowNumber}`)).size, repairedAgain.length, '修复后不得产生重复 item 行号');
    assert.deepEqual(repairedAgain.filter((row) => ['fail-1', 'fail-2'].includes(row.reservedNumber)).map((row) => row.id).sort(),
      dirtyBefore.map((row) => row.id).sort(), '修复必须保留已有 item 身份');
    const [dirtyRecord] = await connection.query<any[]>(
      `SELECT JSON_EXTRACT(data, '$.importRowNumber') AS importRowNumber FROM \`${recordsTable}\` WHERE id = 'dirty-created'`,
    );
    assert.equal(Number(dirtyRecord[0].importRowNumber), 3, '已创建业务记录的 importRowNumber 必须同步稳定映射');
    const [dirtyReservations] = await connection.query<any[]>(
      `SELECT normalizedNumber, rowNumber FROM \`${reservationsTable}\` WHERE id LIKE 'dirty-%' ORDER BY normalizedNumber`,
    );
    assert.deepEqual(dirtyReservations.map((row) => [row.normalizedNumber, Number(row.rowNumber)]), [['fail-1', 3]],
      '已创建行保留预留并同步行号，无业务记录的失败行释放预留');
  } finally {
    await connection.query(`DROP TABLE IF EXISTS \`${itemsTable}\`, \`${reservationsTable}\`, \`${jobsTable}\`, \`${batchesTable}\`, \`${recordsTable}\`, \`${usersTable}\`, \`${rolesTable}\`, \`${departmentsTable}\`, \`${storageTable}\``);
    await connection.end();
  }
  console.log('business import migration integration: ok');
}
