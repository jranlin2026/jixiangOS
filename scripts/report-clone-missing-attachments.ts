import { access } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { BUSINESS_ATTACHMENT_DOMAIN, type BusinessAttachmentRecord } from '../server/services/businessAttachmentService';
import { assertSafeCloneDatabaseUrl } from './lib/cloneSanitizer';

assertSafeCloneDatabaseUrl(String(process.env.DATABASE_URL || ''));
const root = path.resolve(process.env.BUSINESS_ATTACHMENT_STORAGE_DIR || 'uploads-private/business-attachments');
const prisma = new PrismaClient();

try {
  const rows = await prisma.businessRecord.findMany({ where: { domain: BUSINESS_ATTACHMENT_DOMAIN }, orderBy: { recordId: 'asc' } });
  const missing: Array<{ id: string; storageName: string }> = [];
  for (const row of rows) {
    const attachment = row.data as unknown as BusinessAttachmentRecord;
    try {
      await access(path.join(root, attachment.storageName));
    } catch {
      missing.push({ id: row.recordId, storageName: attachment.storageName });
    }
  }
  console.log(JSON.stringify({ attachmentMetadataCount: rows.length, missingCount: missing.length, missing }, null, 2));
} finally {
  await prisma.$disconnect();
}
