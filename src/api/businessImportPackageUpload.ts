import type { BusinessAttachment } from '../types/businessAttachment';
import type { BusinessImportRow, BusinessImportType, OrderImportRow, RecoveryImportRow } from '../types/businessImport';
import type { BusinessImportPackageImage } from './businessImportWorkbook';

type UploadInput = {
  type: BusinessImportType;
  rows: BusinessImportRow[];
  images: BusinessImportPackageImage[];
  draftId: string;
  upload(image: BusinessImportPackageImage, draftKey: string): Promise<BusinessAttachment>;
  remove(id: string): Promise<unknown>;
  concurrency?: number;
};

export type UploadedBusinessImportPackage = {
  rows: BusinessImportRow[];
  attachmentIds: string[];
};

export async function businessImportAttachmentDraftId(confirmationToken: string): Promise<string> {
  const bytes = new TextEncoder().encode(confirmationToken);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

/**
 * Uploads ZIP images behind one interface, limits browser/network pressure,
 * cleans partial drafts on failure, and returns rows enriched only with opaque
 * attachment IDs. The server remains responsible for canonical metadata.
 */
export async function uploadBusinessImportPackageImages(input: UploadInput): Promise<UploadedBusinessImportPackage> {
  if (!input.images.length) return { rows: input.rows.map((row) => ({ ...row })), attachmentIds: [] };
  const rowNumbers = new Set(input.rows.map((row) => row.rowNumber));
  if (input.images.some((image) => !rowNumbers.has(image.rowNumber))) throw new Error('导入图片与 Excel 行号不匹配');
  const uploaded = new Array<BusinessAttachment | undefined>(input.images.length);
  let cursor = 0;
  let firstError: unknown;
  const worker = async () => {
    while (firstError === undefined) {
      const index = cursor;
      cursor += 1;
      if (index >= input.images.length) return;
      const image = input.images[index];
      try {
        uploaded[index] = await input.upload(image, `business-import:${input.type}:${input.draftId}:${image.rowNumber}`);
      } catch (error) {
        firstError = error;
      }
    }
  };
  const concurrency = Math.max(1, Math.min(6, Math.floor(input.concurrency || 4), input.images.length));
  await Promise.all(Array.from({ length: concurrency }, worker));
  const completed = uploaded.filter((attachment): attachment is BusinessAttachment => Boolean(attachment));
  if (firstError !== undefined) {
    await Promise.allSettled(completed.map((attachment) => input.remove(attachment.id)));
    throw firstError;
  }

  const imagesByRow = new Map<number, Array<{ image: BusinessImportPackageImage; attachment: BusinessAttachment }>>();
  input.images.forEach((image, index) => {
    const rowImages = imagesByRow.get(image.rowNumber) || [];
    rowImages.push({ image, attachment: uploaded[index]! });
    imagesByRow.set(image.rowNumber, rowImages);
  });
  const rows = input.rows.map((row) => {
    const rowImages = imagesByRow.get(row.rowNumber) || [];
    if (input.type === 'orders') {
      const order = row as OrderImportRow;
      return {
        ...order,
        paymentProofAttachmentIds: rowImages.filter(({ image }) => image.category === 'order-payment-proof').map(({ attachment }) => attachment.id),
        dealEvidenceAttachmentIds: rowImages.filter(({ image }) => image.category === 'order-deal-evidence').map(({ attachment }) => attachment.id),
      };
    }
    const recovery = row as RecoveryImportRow;
    return {
      ...recovery,
      recoveryEvidenceAttachmentIds: rowImages.filter(({ image }) => image.category === 'recovery-payment-proof').map(({ attachment }) => attachment.id),
    };
  });
  return { rows, attachmentIds: completed.map((attachment) => attachment.id) };
}
