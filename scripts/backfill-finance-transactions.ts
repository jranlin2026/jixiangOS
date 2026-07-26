import { prisma } from '../server/db/client';
import { createFinanceTransactionService } from '../server/services/financeTransactionService';
import type { AuthenticatedUser } from '../src/types/auth';

const apply = process.argv.includes('--apply');
const confirmation = process.argv.find((value) => value.startsWith('--confirm='))?.slice('--confirm='.length);
if (apply && confirmation !== 'BACKFILL_FINANCE_TRANSACTIONS') {
  throw new Error('REFUSING_FINANCE_BACKFILL_WITHOUT_CONFIRMATION');
}
if (apply && !/^[a-f0-9]{64}$/i.test(String(process.env.JIXIANG_VERIFIED_BACKUP_SHA256 || ''))) {
  throw new Error('REFUSING_FINANCE_BACKFILL_WITHOUT_VERIFIED_BACKUP_SHA256');
}
const service = createFinanceTransactionService(prisma);
const actor = { id: 'system-finance-backfill', name: '资金流水历史回填', role: '系统任务', permissions: [] } as unknown as AuthenticatedUser;

try {
  const result = await service.backfill(apply, actor);
  console.log(JSON.stringify(result.data, null, 2));
  if (result.code !== 0 || result.data?.errors.length) process.exitCode = 1;
  if (process.argv.includes('--require-complete') && result.data?.missingCount !== 0) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
