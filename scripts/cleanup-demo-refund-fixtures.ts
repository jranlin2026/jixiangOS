import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../server/db/client';
import { cleanupLegacyDemoRefundFixtures } from '../server/services/customerDemoFixtureCleanup';

const apply = process.argv.includes('--apply');
const confirmedProduction = process.argv.includes('--confirm-production');
const outIndex = process.argv.indexOf('--out');
const outputPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
if (outIndex >= 0 && !outputPath) throw new Error('--out 必须指定输出文件');
if (apply && process.env.NODE_ENV === 'production' && !confirmedProduction) {
  throw new Error('生产环境清理演示数据必须显式指定 --confirm-production');
}
if (apply && !outputPath) throw new Error('应用清理时必须使用 --out 保存原始备份');

try {
  const result = await cleanupLegacyDemoRefundFixtures(prisma as any, {
    apply,
    ...(outputPath ? {
      backup: async (rows) => {
        const resolved = path.resolve(outputPath);
        await mkdir(path.dirname(resolved), { recursive: true, mode: 0o700 });
        await writeFile(resolved, `${JSON.stringify(rows, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      },
    } : {}),
  });
  process.stdout.write(`${JSON.stringify({ apply, ...result }, null, 2)}\n`);
  if (result.conflicts.length > 0 || (!apply && result.found > 0)) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
