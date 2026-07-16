import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Prisma, PrismaClient } from '@prisma/client';
import { failure, success } from '../api/response';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { BusinessAttachment, BusinessAttachmentCategory } from '../../src/types/businessAttachment';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const DELIVERY_MIME_TYPES = new Set([
  ...IMAGE_MIME_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const DELIVERY_MAX_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_DOMAIN = 'jixiang_os_business_attachments';
const CATEGORIES = new Set<BusinessAttachmentCategory>([
  'order-payment-proof',
  'order-deal-evidence',
  'recovery-payment-proof',
  'recovery-chat-evidence',
  'delivery-task-file',
]);

export interface BusinessAttachmentRecord extends BusinessAttachment {
  storageName: string;
  draftKey: string;
}

export interface BusinessAttachmentRepository {
  create(record: BusinessAttachmentRecord): Promise<void>;
  find(id: string): Promise<BusinessAttachmentRecord | null>;
  remove(id: string): Promise<void>;
}

export interface BusinessAttachmentUpload {
  draftKey: string;
  category: BusinessAttachmentCategory;
  file: {
    originalName: string;
    mimeType: string;
    size: number;
    buffer: Buffer;
  };
}

export interface BusinessAttachmentOpen {
  attachment: BusinessAttachment;
  absolutePath: string;
}

function publicAttachment(record: BusinessAttachmentRecord): BusinessAttachment {
  const { storageName: _storageName, draftKey: _draftKey, ...attachment } = record;
  return attachment;
}

function safeDisplayName(value: string): string {
  const raw = String(value || 'attachment').split(/[\\/]/).pop() || 'attachment';
  const sanitized = raw.replace(/[\u0000-\u001f<>:"|?*]+/g, '_').trim().slice(0, 160);
  return sanitized || 'attachment';
}

function permissionsFor(category: BusinessAttachmentCategory): { read: string[]; write: string[] } {
  if (category.startsWith('order-')) {
    return {
      read: [PERMISSION_KEYS.ORDER_MANAGE, PERMISSION_KEYS.ORDER_REVIEW_LIST, PERMISSION_KEYS.ORDER_CREATE],
      write: [PERMISSION_KEYS.ORDER_EDIT, PERMISSION_KEYS.ORDER_REVIEW, PERMISSION_KEYS.ORDER_CREATE],
    };
  }
  if (category.startsWith('recovery-')) {
    return {
      read: [PERMISSION_KEYS.AFTER_SALES_RECOVERY, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE],
      write: [PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE],
    };
  }
  return {
    read: [PERMISSION_KEYS.DELIVERY_CENTER, PERMISSION_KEYS.DELIVERY_MOVE_CARD],
    write: [PERMISSION_KEYS.DELIVERY_MOVE_CARD, PERMISSION_KEYS.DELIVERY_STAGE_CONFIG],
  };
}

function allowed(actor: AuthenticatedUser, keys: string[], action: 'read' | 'write'): boolean {
  return keys.some((key) => hasPermission(actor, key, action));
}

function validateUpload(upload: BusinessAttachmentUpload): string | null {
  if (!upload.draftKey.trim()) return '附件草稿标识不能为空';
  if (!CATEGORIES.has(upload.category)) return '附件分类无效';
  if (!upload.file.buffer.length || upload.file.size <= 0) return '附件内容不能为空';
  const delivery = upload.category === 'delivery-task-file';
  const types = delivery ? DELIVERY_MIME_TYPES : IMAGE_MIME_TYPES;
  if (!types.has(upload.file.mimeType)) return delivery ? '文件类型不支持' : '凭证只支持图片';
  const maxBytes = delivery ? DELIVERY_MAX_BYTES : IMAGE_MAX_BYTES;
  if (upload.file.size > maxBytes) return `文件不能超过 ${delivery ? 20 : 10} MB`;
  return null;
}

export function createPrismaBusinessAttachmentRepository(
  prisma: Pick<PrismaClient, 'businessRecord'>,
): BusinessAttachmentRepository {
  return {
    async create(record) {
      await prisma.businessRecord.create({
        data: {
          id: `${ATTACHMENT_DOMAIN}:${record.id}`,
          domain: ATTACHMENT_DOMAIN,
          recordId: record.id,
          title: record.name,
          owner: record.uploadedByName,
          eventAt: new Date(record.uploadedAt),
          data: record as unknown as Prisma.InputJsonValue,
        },
      });
    },
    async find(id) {
      const row = await prisma.businessRecord.findUnique({
        where: { domain_recordId: { domain: ATTACHMENT_DOMAIN, recordId: id } },
      });
      return row?.data ? row.data as unknown as BusinessAttachmentRecord : null;
    },
    async remove(id) {
      await prisma.businessRecord.delete({
        where: { domain_recordId: { domain: ATTACHMENT_DOMAIN, recordId: id } },
      });
    },
  };
}

export function createBusinessAttachmentService(options: {
  repository: BusinessAttachmentRepository;
  rootDir: string;
  now?: () => Date;
  id?: () => string;
}) {
  const now = options.now || (() => new Date());
  const nextId = options.id || randomUUID;

  return {
    async upload(upload: BusinessAttachmentUpload, actor: AuthenticatedUser) {
      const error = validateUpload(upload);
      if (error) return failure<BusinessAttachment>(error, 400);
      const access = permissionsFor(upload.category);
      if (!allowed(actor, access.write, 'write')) return failure<BusinessAttachment>('无权上传该业务附件', 403);

      const id = nextId();
      const name = safeDisplayName(upload.file.originalName);
      const extension = path.extname(name).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 12).toLowerCase();
      const storageName = `${id}${extension}`;
      const record: BusinessAttachmentRecord = {
        id,
        name,
        mimeType: upload.file.mimeType,
        size: upload.file.size,
        category: upload.category,
        uploadedById: actor.id,
        uploadedByName: actor.name,
        uploadedAt: now().toISOString(),
        storageName,
        draftKey: upload.draftKey.trim(),
      };
      await mkdir(options.rootDir, { recursive: true });
      const absolutePath = path.join(options.rootDir, storageName);
      await writeFile(absolutePath, upload.file.buffer, { flag: 'wx' });
      try {
        await options.repository.create(record);
      } catch (repositoryError) {
        await rm(absolutePath, { force: true });
        throw repositoryError;
      }
      return success(publicAttachment(record));
    },

    async open(id: string, actor: AuthenticatedUser) {
      const record = await options.repository.find(id);
      if (!record) return failure<BusinessAttachmentOpen>('附件不存在', 404);
      const access = permissionsFor(record.category);
      if (record.uploadedById !== actor.id && !allowed(actor, access.read, 'read')) {
        return failure<BusinessAttachmentOpen>('无权查看该附件', 403);
      }
      return success({ attachment: publicAttachment(record), absolutePath: path.join(options.rootDir, record.storageName) });
    },

    async remove(id: string, actor: AuthenticatedUser) {
      const record = await options.repository.find(id);
      if (!record) return failure<boolean>('附件不存在', 404);
      const access = permissionsFor(record.category);
      if (record.uploadedById !== actor.id && !allowed(actor, access.write, 'write')) {
        return failure<boolean>('无权删除该附件', 403);
      }
      await rm(path.join(options.rootDir, record.storageName), { force: true });
      await options.repository.remove(id);
      return success(true);
    },
  };
}
