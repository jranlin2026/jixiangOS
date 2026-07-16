import type { ID, Timestamp } from './common';

export type BusinessAttachmentCategory =
  | 'order-payment-proof'
  | 'order-deal-evidence'
  | 'recovery-payment-proof'
  | 'recovery-chat-evidence'
  | 'delivery-task-file';

export interface BusinessAttachment {
  id: ID;
  name: string;
  mimeType: string;
  size: number;
  category: BusinessAttachmentCategory;
  uploadedById: ID;
  uploadedByName: string;
  uploadedAt: Timestamp;
}
