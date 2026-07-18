import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { MergedCustomerRedirect } from '../../src/types/customerMerge';

export async function resolveCanonicalCustomer(
  prisma: any,
  customerId: string,
): Promise<MergedCustomerRedirect | null> {
  const row = await prisma.businessRecord.findUnique({
    where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: customerId } },
    select: { mergedIntoId: true, mergeLedgerId: true },
  });
  if (!row?.mergedIntoId) return null;
  if (!row.mergeLedgerId) throw new Error('MERGED_CUSTOMER_LEDGER_MISSING');
  return { merged: true, canonicalCustomerId: row.mergedIntoId, mergeLedgerId: row.mergeLedgerId };
}

export class MergedCustomerRedirectError extends Error {
  readonly statusCode = 409;
  constructor(readonly redirect: MergedCustomerRedirect) {
    super('客户已合并，请查看主客户');
    this.name = 'MergedCustomerRedirectError';
  }
}

export async function assertCanonicalCustomer(prisma: any, customerId: string): Promise<void> {
  const redirect = await resolveCanonicalCustomer(prisma, customerId);
  if (redirect) throw new MergedCustomerRedirectError(redirect);
}
