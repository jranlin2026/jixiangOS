import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const deploySource = readFileSync(join(process.cwd(), 'scripts', 'deploy', 'deploy-ecs.py'), 'utf8');
const legacyDeployPath = join(process.cwd(), 'scripts', 'deploy', 'deploy-linux.sh');
const legacyDeploySource = readFileSync(legacyDeployPath, 'utf8');
const backupSource = readFileSync(join(process.cwd(), 'scripts', 'mysql', 'backup-linux.sh'), 'utf8');
const cloudDeployDoc = readFileSync(join(process.cwd(), 'docs', 'cloud-deployment-aliyun.md'), 'utf8');
const minimalLaunchDoc = readFileSync(join(process.cwd(), 'docs', 'aliyun-minimal-launch.md'), 'utf8');
const nginxSource = readFileSync(join(process.cwd(), 'deploy', 'nginx', 'jixiang-os.conf'), 'utf8');
const nginxTimeoutSource = readFileSync(join(process.cwd(), 'deploy', 'nginx', 'jixiang-os-api-timeouts.conf'), 'utf8');
const remoteStart = deploySource.indexOf('def build_remote_command');
const remoteEnd = deploySource.indexOf('def public_health_check');
assert.ok(remoteStart >= 0 && remoteEnd > remoteStart);
const remote = deploySource.slice(remoteStart, remoteEnd);

function assertBefore(first: string, second: string, message: string) {
  const firstIndex = remote.indexOf(first);
  const secondIndex = remote.indexOf(second);
  assert.ok(firstIndex >= 0 && secondIndex > firstIndex, message);
}

assert.match(deploySource, /JIXIANG_REMOTE_NODE_ENV", "production"/);
assert.match(nginxSource, /location \/api\/ \{[\s\S]*proxy_read_timeout\s+180s;/);
assert.match(nginxSource, /location \/api\/ \{[\s\S]*proxy_send_timeout\s+180s;/);
assert.match(nginxTimeoutSource, /proxy_read_timeout\s+180s;/);
assert.match(nginxTimeoutSource, /proxy_send_timeout\s+180s;/);
assert.match(remote, /install -m 644 "\$APP_DIR\/deploy\/nginx\/jixiang-os-api-timeouts\.conf" "\$NGINX_TIMEOUT_CONFIG"/);
assert.match(remote, /NGINX_CONFIG_DUMP="\$\(nginx -T 2>&1\)"/);
assert.match(remote, /proxy_read_timeout 180s/);
assert.match(remote, /proxy_send_timeout 180s/);
assert.doesNotMatch(deploySource, /JIXIANG_REMOTE_NODE_ENV", "development"/);
assert.match(deploySource, /VITE_USE_BACKEND_API[^\n]*true/);
assert.match(deploySource, /VITE_AI_API_BASE[^\n]*\/api/);
const archiveExcludes = deploySource.slice(deploySource.indexOf('EXCLUDE_DIRS'), deploySource.indexOf('EXCLUDE_FILES'));
assert.match(archiveExcludes, /"uploads"/);
assert.match(archiveExcludes, /"private_uploads"/);
assert.match(deploySource, /path\.name\.startswith\("\.env\."\)/);
assert.match(deploySource, /\.env\.example/);
assert.match(remote, /NODE_ENV_VALUE/);
assert.match(remote, /NODE_ENV_VALUE[^\n]*production|production[^\n]*NODE_ENV_VALUE/);

assert.doesNotMatch(remote, /db:push/);
assert.doesNotMatch(remote, /accept-data-loss/);
assert.match(remote, /npm run db:generate/);
assert.match(remote, /npm run db:deploy/);
assertBefore('npm run db:generate', 'npm run db:deploy', 'Prisma generate 必须先于 migrate deploy');
assert.match(remote, /prisma migrate status/);
assert.match(remote, /JIXIANG_PRISMA_BASELINE_CONFIRMED/);
assert.match(remote, /system:database-state/);
assert.match(remote, /DATABASE_INSTALLATION_STATE/);
assert.match(remote, /DATABASE_INSTALLATION_STATE" = "NONEMPTY"/);
assert.match(remote, /MIGRATE_STATUS_CODE/);
assert.match(remote, /have not yet been applied/);
assert.match(
  remote,
  /if MIGRATE_STATUS_OUTPUT="\$\(npx --no-install prisma migrate status 2>&1\)"; then[\s\S]*?MIGRATE_STATUS_CODE="\$\?"/,
  'Prisma 正常报告待应用迁移时必须捕获非零状态，不能触发全局 ERR 回滚',
);
assert.doesNotMatch(
  remote,
  /set \+e\s+MIGRATE_STATUS_OUTPUT="\$\(npx --no-install prisma migrate status 2>&1\)"/,
  '全局 ERR trap 下不能依赖 set +e 捕获 Prisma 状态',
);
assertBefore('JIXIANG_PRISMA_BASELINE_CONFIRMED', 'npm run db:deploy', 'baseline 确认必须先于 migrate deploy');
assert.match(
  remote,
  /MIGRATE_STATUS_OUTPUT.*grep.*EXPECTED_BASELINE/,
  '已确认 baseline 仍显示未应用时必须停止，而不是直接 deploy',
);
const postDeployMigrationChecks = remote.slice(
  remote.indexOf('npm run db:deploy'),
  remote.indexOf('Finalizing persistent uploads'),
);
assert.match(postDeployMigrationChecks, /prisma migrate status/);
assert.match(postDeployMigrationChecks, /prisma migrate diff/);
assert.match(postDeployMigrationChecks, /--exit-code/);
assert.match(remote, /npm run customer:permission-audit/);
assert.match(remote, /npm run customer:permission-migrate/);
assert.match(remote, /private_reports\/customer-permission-manifest-/);
assert.match(remote, /npm run customer:association-audit -- --dry-run/);
assert.match(remote, /npm run customer:association-audit -- --apply/);
assert.match(remote, /private_reports\/customer-association-apply-/);
assert.match(remote, /npm run customer:association-cleanup -- --apply --confirm-production/);
assert.match(remote, /private_reports\/legacy-orphan-associations-/);
assert.match(remote, /npm run customer:batch-verify/);
assert.match(remote, /npm run customer:demo-fixture-cleanup -- --apply --confirm-production/);
assert.match(remote, /customerBatchFoundation\.integration\.test\.ts/);
assert.match(remote, /SYSTEM_SETUP_STATE/);
assert.match(remote, /system:setup-state/);
assert.match(remote, /if \[ "\$SYSTEM_SETUP_STATE" = "ACTIVE" \]/);
assert.match(remote, /Skipping legacy production data gates for an uninitialized instance/);
assert.match(remote, /npm test/);
assert.match(
  remote,
  /NODE_ENV=test VITE_USE_BACKEND_API=false VITE_AI_API_BASE=\/api JIXIANG_DEFAULT_ADMIN_PASSWORD= JIXIANG_DEFAULT_USER_PASSWORD= npm test/,
  '发布测试必须隔离浏览器后端配置与生产默认密码，避免生产环境污染测试夹具',
);
assertBefore('customer:demo-fixture-cleanup', 'npm run customer:association-audit', '已知演示数据必须先备份清理再做关联审计');
assertBefore('npm run customer:permission-migrate', 'npm run customer:permission-audit', '客户权限基线迁移必须先于权限审计');
assertBefore('npm run customer:association-cleanup', 'npm run customer:association-audit', '已知孤儿关联必须先私有备份清理再做关联审计');
assertBefore('customer:association-audit -- --apply', 'customer:association-audit -- --dry-run', '安全关联候选必须先事务回填再做只读复核');
assertBefore('npm run customer:permission-audit', 'echo "Switching release...', '客户权限审计必须先于版本切换');
assertBefore('npm run customer:association-audit', 'echo "Switching release...', '客户关联审计必须先于版本切换');
assertBefore('npm run customer:batch-verify', 'echo "Switching release...', '客户批量验证必须先于版本切换');

assert.match(remote, /\. "\$APP_DIR\/\.env"/);
assert.match(remote, /"\$NEW_DIR\/scripts\/mysql\/backup-linux\.sh"/);
assert.doesNotMatch(remote, /"\$APP_DIR\/scripts\/mysql\/backup-linux\.sh"/);
assert.match(remote, /npm run prod:check/);
assert.match(remote, /JIXIANG_SETUP_TOKEN/);
assert.match(remote, /openssl rand -hex 24/);
assert.match(remote, /initial-setup-token/);
assert.match(remote, /export JIXIANG_SETUP_TOKEN="\$SETUP_TOKEN_VALUE"/, '部署进程必须获得实际生成的初始化码');
assertBefore('npm run prod:check', 'backup-linux.sh', '生产配置检查必须先于数据库备份');
assertBefore('backup-linux.sh', 'npm run db:deploy', 'SQL 备份必须先于数据库迁移');

assert.match(remote, /PERSISTENT_DATA_DIR/);
assert.match(remote, /readlink -m/);
assert.match(remote, /PERSISTENT_DATA_DIR must be absolute/);
assert.match(remote, /PERSISTENT_DATA_DIR must be outside APP_DIR/);
assert.match(remote, /mkdir -p[^\n]*uploads/);
assert.match(remote, /mkdir -p[^\n]*private_uploads/);
assert.match(remote, /ln -s[^\n]*PERSISTENT_DATA_DIR[^\n]*uploads[^\n]*NEW_DIR[^\n]*uploads/);
assert.match(remote, /ln -s[^\n]*PERSISTENT_DATA_DIR[^\n]*private_uploads[^\n]*NEW_DIR[^\n]*private_uploads/);
assertBefore('PERSISTENT_DATA_DIR', 'echo "Switching release...', '持久目录必须在版本切换前准备');

assert.match(remote, /npm install[^\n]*--include=dev[^\n]*--prefer-offline/);
assert.match(remote, /business-records:repair -- --apply --confirm-production/);
assertBefore('pm2 stop jixiang-os-api', 'business-records:repair', 'legacy repair must run after writes are stopped');
assertBefore('business-records:repair', 'echo "Switching release...', 'legacy repair must finish before release switch');

assert.match(remote, /trap [^\n]* ERR/);
assert.doesNotMatch(remote, /(?:^|\n)umask 077(?:\n|$)/);
assert.match(remote, /install -m 600 "\$APP_DIR\/\.env" "\$ENV_BACKUP"/);
const rollbackBlock = remote.slice(remote.indexOf('rollback_release()'), remote.indexOf('trap rollback_release ERR'));
assert.match(rollbackBlock, /rm -f "\$ENV_BACKUP"/);
assert.match(rollbackBlock, /install -m 644 "\$NGINX_TIMEOUT_BACKUP" "\$NGINX_TIMEOUT_CONFIG"/);
assert.match(rollbackBlock, /rm -f "\$NGINX_TIMEOUT_CONFIG"/);
assert.match(rollbackBlock, /nginx -t[\s\S]*systemctl reload nginx/);
const finalSync = remote.slice(
  remote.indexOf('Finalizing persistent uploads'),
  remote.indexOf('Switching release'),
);
assert.match(finalSync, /pm2 stop jixiang-os-api/);
assert.match(finalSync, /rsync -a --delete "\$APP_DIR\/uploads\/" "\$PERSISTENT_DATA_DIR\/uploads\/"/);
assert.match(finalSync, /rsync -a --delete "\$APP_DIR\/private_uploads\/" "\$PERSISTENT_DATA_DIR\/private_uploads\/"/);
assert.ok(
  finalSync.indexOf('pm2 stop jixiang-os-api') < finalSync.indexOf('rsync -a --delete'),
  '必须先停止 API 再做最终上传目录同步',
);
assertBefore('npm run db:deploy', 'Finalizing persistent uploads', '停服最终同步必须在迁移成功后执行');
const healthBlock = remote.slice(remote.indexOf('Checking local health'), remote.indexOf('Cleaning old releases'));
assert.doesNotMatch(healthBlock, /API health check failed[\s\S]{0,120}exit 1/);
assert.match(healthBlock, /API health check failed[\s\S]{0,120}\bfalse\b/);

assert.match(legacyDeploySource, /set -euo pipefail/);
assert.match(legacyDeploySource, /(?:deprecated|已停用|已废弃)/i);
assert.match(legacyDeploySource, /scripts\/deploy\/deploy-ecs\.py/);
assert.match(legacyDeploySource, /exit\s+(?:1|64)/);
assert.doesNotMatch(legacyDeploySource, /npm run db:deploy/);
assert.doesNotMatch(legacyDeploySource, /git (?:pull|checkout)/);
assert.doesNotMatch(legacyDeploySource, /pm2 (?:start|reload)/);
assert.doesNotMatch(legacyDeploySource, /\. \.\/\.env|source \.env/);
const blockedLegacyDeploy = spawnSync('bash', [legacyDeployPath], { encoding: 'utf8' });
const bashAvailable = !blockedLegacyDeploy.error;
if (blockedLegacyDeploy.error && (blockedLegacyDeploy.error as NodeJS.ErrnoException).code !== 'ENOENT') {
  throw blockedLegacyDeploy.error;
}
if (!blockedLegacyDeploy.error) {
  assert.equal(blockedLegacyDeploy.status, 64);
  assert.equal(blockedLegacyDeploy.stdout, '');
  assert.match(blockedLegacyDeploy.stderr, /scripts\/deploy\/deploy-ecs\.py/);
}

function assertSafeProductionDatabaseGuidance(source: string, documentName: string) {
  assert.doesNotMatch(
    source,
    /^\s*(?:\$\s*)?npm run db:seed\s*$/m,
    `${documentName} 不得把 db:seed 写成可执行的生产步骤`,
  );
  assert.match(source, /生产环境[^\n]*(?:禁止|不得)[^\n]*db:seed/i);
  assert.match(source, /(?:空库|全新数据库)[^\n]*初始化向导/);
  assert.match(source, /JIXIANG_SETUP_TOKEN/);
  assert.match(source, /\/setup/);
  assert.match(source, /prisma migrate status/);
  assert.match(source, /python3 scripts\/deploy\/deploy-ecs\.py/);
}

assertSafeProductionDatabaseGuidance(cloudDeployDoc, 'cloud-deployment-aliyun.md');
assertSafeProductionDatabaseGuidance(minimalLaunchDoc, 'aliyun-minimal-launch.md');

assert.match(backupSource, /set -euo pipefail/);
assert.match(backupSource, /mysqldump/);
assert.match(backupSource, /--single-transaction/);
assert.match(backupSource, /gzip > "\$partial_output"/);
assert.match(backupSource, /gzip -t "\$partial_output"/);
assert.match(backupSource, /sha256sum "\$output"/);
assert.match(backupSource, /chmod 600 "\$output"/);
assert.match(backupSource, /\.partial/);
assert.match(backupSource, /trap [^\n]* EXIT/);
assert.match(backupSource, /DATABASE_URL/);
assert.match(backupSource, /backup target does not match DATABASE_URL/);

if (!bashAvailable) process.exit(0);

const failureRoot = mkdtempSync(join(tmpdir(), 'jixiang-backup-failure-'));
const fakeBin = join(failureRoot, 'bin');
const backupDir = join(failureRoot, 'backups');
const dumpCalled = join(failureRoot, 'dump-called');
try {
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(backupDir, { recursive: true });
  const fakeDump = join(fakeBin, 'mysqldump');
  writeFileSync(fakeDump, '#!/usr/bin/env bash\n: > "$JIXIANG_FAKE_DUMP_CALLED"\nexit 1\n', 'utf8');
  chmodSync(fakeDump, 0o755);
  const failedBackup = spawnSync('bash', [join(process.cwd(), 'scripts', 'mysql', 'backup-linux.sh')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`,
      JIXIANG_FAKE_DUMP_CALLED: dumpCalled,
      DATABASE_URL: 'mysql://backup_user:secret@127.0.0.1:3306/jixiang_os',
      JIXIANG_MYSQL_HOST: '127.0.0.1',
      JIXIANG_MYSQL_PORT: '3306',
      JIXIANG_MYSQL_DATABASE: 'jixiang_os',
      JIXIANG_MYSQL_USER: 'backup_user',
      JIXIANG_MYSQL_PASSWORD: 'secret',
      JIXIANG_BACKUP_DIR: backupDir,
    },
  });
  assert.notEqual(failedBackup.status, 0);
  assert.equal(existsSync(dumpCalled), true, failedBackup.stderr);
  assert.deepEqual(readdirSync(backupDir), [], '失败备份不得留下普通命名或半成品文件');
} finally {
  rmSync(failureRoot, { recursive: true, force: true });
}
