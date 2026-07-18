import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../server/db/client';
import { auditHistoricalCustomerAssociationIds } from '../server/services/customerAssociationRegistry';

const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run');
if (apply && dryRun) throw new Error('客户关联审计不能同时指定 --apply 和 --dry-run');
const checkpointFlag = process.argv.find((argument) => argument.startsWith('--checkpoint='));
const checkpointKey = checkpointFlag?.slice('--checkpoint='.length) || 'aaos_customer_association_audit_v1';
const outIndex = process.argv.indexOf('--out');
const outputPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
if (outIndex >= 0 && !outputPath) throw new Error('--out 必须指定输出文件');

try {
  const summary = await auditHistoricalCustomerAssociationIds(prisma, { apply, checkpointKey });
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, serialized, { encoding: 'utf8', mode: 0o600 });
  }
  process.stdout.write(serialized);

  if (summary.repairRows.length > 0) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
