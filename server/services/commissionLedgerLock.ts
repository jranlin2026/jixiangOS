import { Prisma } from '@prisma/client';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';

const GLOBAL_LEDGER_LOCK_ID = 'global-commission-ledger';

type CommissionLedgerTransaction = Pick<
  Prisma.TransactionClient,
  'businessRecord' | '$queryRaw'
>;

/**
 * Serializes all mutations that can change paid commission facts or their
 * correction deltas. A durable row lock works with the project's MySQL
 * transaction model and avoids relying on connection-scoped named locks.
 */
export async function lockCommissionLedger(
  transaction: CommissionLedgerTransaction,
): Promise<void> {
  const selector = {
    domain_recordId: {
      domain: STORAGE_KEYS.COMMISSION_LEDGER_LOCKS,
      recordId: GLOBAL_LEDGER_LOCK_ID,
    },
  };
  const existing = await transaction.businessRecord.findUnique({ where: selector });
  if (!existing) {
    try {
      await transaction.businessRecord.create({
        data: {
          id: `${STORAGE_KEYS.COMMISSION_LEDGER_LOCKS}:${GLOBAL_LEDGER_LOCK_ID}`,
          domain: STORAGE_KEYS.COMMISSION_LEDGER_LOCKS,
          recordId: GLOBAL_LEDGER_LOCK_ID,
          title: '提成账本全局事务锁',
          status: 'active',
          data: {
            id: GLOBAL_LEDGER_LOCK_ID,
            purpose: 'serialize commission payout and correction mutations',
          },
        },
      });
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code !== 'P2002') throw error;
    }
  }
  await transaction.$queryRaw(Prisma.sql`
    SELECT recordId
    FROM business_records
    WHERE domain = ${STORAGE_KEYS.COMMISSION_LEDGER_LOCKS}
      AND recordId = ${GLOBAL_LEDGER_LOCK_ID}
    FOR UPDATE
  `);
}
