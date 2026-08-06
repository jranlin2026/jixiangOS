import type { Prisma } from '@prisma/client';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { Product } from '../../src/types/product';

type PurchaseSnapshot = {
  sourceProductId?: string;
  sourceProductName?: string;
  sourcePaymentAmount?: number | null;
};

type PurchaseSnapshotInput = Omit<PurchaseSnapshot, 'sourcePaymentAmount'> & {
  sourcePaymentAmount?: unknown;
};

type ProductLookupTx = Pick<Prisma.TransactionClient, 'businessRecord'>;

function hasOwn(value: object, field: keyof PurchaseSnapshotInput): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseProduct(data: Prisma.JsonValue): Product | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const product = data as unknown as Partial<Product>;
  return cleanText(product.id) && cleanText(product.name) ? product as Product : null;
}

export async function canonicalizePurchaseSnapshot(
  tx: ProductLookupTx,
  input: PurchaseSnapshotInput,
  options: { existingProductId?: string } = {},
): Promise<Partial<PurchaseSnapshot>> {
  const patch: Partial<PurchaseSnapshot> = {};
  const productSubmitted = hasOwn(input, 'sourceProductId') || hasOwn(input, 'sourceProductName');

  if (productSubmitted) {
    const productId = cleanText(input.sourceProductId);
    if (!productId) {
      if (cleanText(input.sourceProductName)) throw new Error('平台购买产品必须从系统产品列表选择');
      patch.sourceProductId = undefined;
      patch.sourceProductName = undefined;
    } else {
      const row = await tx.businessRecord.findUnique({
        where: { domain_recordId: { domain: STORAGE_KEYS.PRODUCTS, recordId: productId } },
      });
      const product = row ? parseProduct(row.data) : null;
      if (!product || product.id !== productId) throw new Error('平台购买产品不存在，请重新选择');
      if (!product.isActive && productId !== options.existingProductId) {
        throw new Error('平台购买产品已停用，请重新选择');
      }
      patch.sourceProductId = product.id;
      patch.sourceProductName = product.name;
    }
  }

  if (hasOwn(input, 'sourcePaymentAmount')) {
    const amount = input.sourcePaymentAmount;
    if (amount === null || amount === undefined || amount === '') {
      patch.sourcePaymentAmount = null;
    } else {
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        throw new Error('平台付款金额必须是大于或等于 0 的有效金额');
      }
      patch.sourcePaymentAmount = amount;
    }
  }

  return patch;
}
