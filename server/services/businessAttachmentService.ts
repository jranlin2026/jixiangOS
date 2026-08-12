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
const ACADEMY_MIME_TYPES = new Set([
  ...DELIVERY_MIME_TYPES,
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'video/mp4',
]);
const ACADEMY_TASK_MIME_TYPES = new Set([
  ...DELIVERY_MIME_TYPES,
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const DELIVERY_MAX_BYTES = 20 * 1024 * 1024;
const ACADEMY_MAX_BYTES = 200 * 1024 * 1024;
export const BUSINESS_ATTACHMENT_DOMAIN = 'jixiang_os_business_attachments';
const CATEGORIES = new Set<BusinessAttachmentCategory>([
  'order-payment-proof',
  'order-deal-evidence',
  'recovery-payment-proof',
  'recovery-chat-evidence',
  'delivery-task-file',
  'academy-course-asset',
  'academy-task-evidence',
]);

const ACADEMY_TASK_DRAFT_PREFIX = 'academy-task:';
const ACADEMY_COURSE_DRAFT_PATTERN = /^academy-course-([A-Za-z0-9_-]{1,80})-(PPT|SCRIPT|CASE|POSTER|INVITATION|REPLAY)$/;

export interface BusinessAttachmentRecord extends BusinessAttachment {
  storageName: string;
  draftKey: string;
}

export interface BusinessAttachmentRepository {
  create(record: BusinessAttachmentRecord): Promise<void>;
  find(id: string): Promise<BusinessAttachmentRecord | null>;
  remove(id: string): Promise<void>;
  listExpiredAcademyTaskEvidence(before: Date): Promise<BusinessAttachmentRecord[]>;
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
  if (category === 'academy-course-asset') {
    return {
      read: [PERMISSION_KEYS.ACADEMY_COURSE_MANAGE],
      write: [PERMISSION_KEYS.ACADEMY_COURSE_MANAGE],
    };
  }
  if (category.startsWith('order-')) {
    return {
      read: [PERMISSION_KEYS.ORDER_MANAGE, PERMISSION_KEYS.ORDER_REVIEW_LIST, PERMISSION_KEYS.ORDER_CREATE],
      write: [PERMISSION_KEYS.ORDER_EDIT, PERMISSION_KEYS.ORDER_CORRECT, PERMISSION_KEYS.ORDER_REVIEW, PERMISSION_KEYS.ORDER_CREATE, PERMISSION_KEYS.ORDER_IMPORT],
    };
  }
  if (category.startsWith('recovery-')) {
    return {
      read: [
        PERMISSION_KEYS.AFTER_SALES_RECOVERY,
        PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST,
        PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE,
        PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT,
      ],
      write: [
        PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT,
        PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW,
        PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE,
        PERMISSION_KEYS.AFTER_SALES_RECOVERY_IMPORT,
      ],
    };
  }
  return {
    read: [PERMISSION_KEYS.DELIVERY_CENTER, PERMISSION_KEYS.DELIVERY_MOVE_CARD],
    write: [PERMISSION_KEYS.DELIVERY_MOVE_CARD, PERMISSION_KEYS.DELIVERY_STAGE_CONFIG],
  };
}

function academyTaskIdFromDraftKey(draftKey: string): string | null {
  if (!draftKey.startsWith(ACADEMY_TASK_DRAFT_PREFIX)) return null;
  const taskId = draftKey.slice(ACADEMY_TASK_DRAFT_PREFIX.length);
  return /^[A-Za-z0-9_-]{1,80}$/.test(taskId) ? taskId : null;
}

function academyCourseIdFromDraftKey(draftKey: string): string | null {
  return draftKey.match(ACADEMY_COURSE_DRAFT_PATTERN)?.[1] || null;
}

function resolveStoragePath(rootDir: string, storageName: string): string | null {
  if (!storageName || storageName !== path.basename(storageName) || storageName.includes('\0')) return null;
  const root = path.resolve(rootDir);
  const candidate = path.resolve(root, storageName);
  return candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

function imageContentMatchesMime(mimeType: string, buffer: Buffer): boolean {
  if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.length >= 8 && Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).equals(buffer.subarray(0, 8));
  if (mimeType === 'image/webp') return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mimeType === 'image/gif') return buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'));
  return false;
}

function allowed(actor: AuthenticatedUser, keys: string[], action: 'read' | 'write'): boolean {
  return keys.some((key) => hasPermission(actor, key, action));
}

function validateUpload(upload: BusinessAttachmentUpload): string | null {
  if (!upload.draftKey.trim()) return '附件草稿标识不能为空';
  if (!CATEGORIES.has(upload.category)) return '附件分类无效';
  if (!upload.file.buffer.length || upload.file.size <= 0) return '附件内容不能为空';
  const delivery = upload.category === 'delivery-task-file';
  const academy = upload.category === 'academy-course-asset';
  const academyTask = upload.category === 'academy-task-evidence';
  const types = academy ? ACADEMY_MIME_TYPES : academyTask ? ACADEMY_TASK_MIME_TYPES : delivery ? DELIVERY_MIME_TYPES : IMAGE_MIME_TYPES;
  if (!types.has(upload.file.mimeType)) return delivery || academy || academyTask ? '文件类型不支持' : '凭证只支持图片';
  if (IMAGE_MIME_TYPES.has(upload.file.mimeType) && !imageContentMatchesMime(upload.file.mimeType, upload.file.buffer)) {
    return '图片内容与文件类型不匹配';
  }
  const maxBytes = academy ? ACADEMY_MAX_BYTES : delivery || academyTask ? DELIVERY_MAX_BYTES : IMAGE_MAX_BYTES;
  if (upload.file.size > maxBytes) return `文件不能超过 ${academy ? 200 : delivery || academyTask ? 20 : 10} MB`;
  return null;
}

export function createPrismaBusinessAttachmentRepository(
  prisma: Pick<PrismaClient, 'businessRecord'>,
): BusinessAttachmentRepository {
  return {
    async create(record) {
      await prisma.businessRecord.create({
        data: {
          id: `${BUSINESS_ATTACHMENT_DOMAIN}:${record.id}`,
          domain: BUSINESS_ATTACHMENT_DOMAIN,
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
        where: { domain_recordId: { domain: BUSINESS_ATTACHMENT_DOMAIN, recordId: id } },
      });
      return row?.data ? row.data as unknown as BusinessAttachmentRecord : null;
    },
    async remove(id) {
      await prisma.businessRecord.delete({
        where: { domain_recordId: { domain: BUSINESS_ATTACHMENT_DOMAIN, recordId: id } },
      });
    },
    async listExpiredAcademyTaskEvidence(before) {
      const rows = await prisma.businessRecord.findMany({
        where: {
          domain: BUSINESS_ATTACHMENT_DOMAIN,
          eventAt: { lt: before },
          data: { path: '$.category', equals: 'academy-task-evidence' },
        },
        orderBy: { eventAt: 'asc' },
        take: 500,
      });
      return rows
        .map((row) => row.data as unknown as BusinessAttachmentRecord)
        .filter((record) => record?.category === 'academy-task-evidence');
    },
  };
}

export function createBusinessAttachmentService(options: {
  repository: BusinessAttachmentRepository;
  rootDir: string;
  now?: () => Date;
  id?: () => string;
  authorizeAcademyTaskEvidence?: (input: {
    taskId: string;
    actor: AuthenticatedUser;
    action: 'read' | 'write';
    attachment?: BusinessAttachmentRecord;
  }) => Promise<boolean>;
  authorizeAcademyCourseAsset?: (input: {
    courseId: string;
    actor: AuthenticatedUser;
    action: 'read' | 'write';
    attachment?: BusinessAttachmentRecord;
  }) => Promise<boolean>;
  onAcademyTaskEvidenceRemoved?: (taskId: string, attachmentId: string) => Promise<void>;
  isAcademyTaskEvidenceLinked?: (taskId: string, attachmentId: string) => Promise<boolean>;
  listLinkedAcademyTaskEvidenceIds?: (taskIds: string[]) => Promise<Set<string>>;
}) {
  const now = options.now || (() => new Date());
  const nextId = options.id || randomUUID;

  return {
    async upload(upload: BusinessAttachmentUpload, actor: AuthenticatedUser) {
      const error = validateUpload(upload);
      if (error) return failure<BusinessAttachment>(error, 400);
      if (upload.category === 'academy-task-evidence') {
        const taskId = academyTaskIdFromDraftKey(upload.draftKey.trim());
        if (!taskId || !options.authorizeAcademyTaskEvidence || !await options.authorizeAcademyTaskEvidence({ taskId, actor, action: 'write' })) {
          return failure<BusinessAttachment>('无权上传该任务附件', 403);
        }
      } else if (upload.category === 'academy-course-asset') {
        const courseId = academyCourseIdFromDraftKey(upload.draftKey.trim());
        if (!courseId || !options.authorizeAcademyCourseAsset || !await options.authorizeAcademyCourseAsset({ courseId, actor, action: 'write' })) {
          return failure<BusinessAttachment>('无权上传该课程资产', 403);
        }
      } else {
        const access = permissionsFor(upload.category);
        if (!allowed(actor, access.write, 'write')) return failure<BusinessAttachment>('无权上传该业务附件', 403);
      }

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
      if (record.category === 'academy-task-evidence') {
        const taskId = academyTaskIdFromDraftKey(record.draftKey);
        if (!taskId || !options.authorizeAcademyTaskEvidence || !await options.authorizeAcademyTaskEvidence({ taskId, actor, action: 'read', attachment: record })) {
          return failure<BusinessAttachmentOpen>('无权查看该附件', 403);
        }
      } else if (record.category === 'academy-course-asset') {
        const courseId = academyCourseIdFromDraftKey(record.draftKey);
        if (!courseId || !options.authorizeAcademyCourseAsset || !await options.authorizeAcademyCourseAsset({ courseId, actor, action: 'read', attachment: record })) {
          return failure<BusinessAttachmentOpen>('无权查看该附件', 403);
        }
      } else {
        const access = permissionsFor(record.category);
        const uploaderMayRead = record.uploadedById === actor.id;
        if (!uploaderMayRead && !allowed(actor, access.read, 'read')) {
          return failure<BusinessAttachmentOpen>('无权查看该附件', 403);
        }
      }
      const absolutePath = resolveStoragePath(options.rootDir, record.storageName);
      if (!absolutePath) return failure<BusinessAttachmentOpen>('附件存储记录无效', 400);
      return success({ attachment: publicAttachment(record), absolutePath });
    },

    async remove(id: string, actor: AuthenticatedUser) {
      const record = await options.repository.find(id);
      if (!record) return failure<boolean>('附件不存在', 404);
      let taskId: string | null = null;
      if (record.category === 'academy-task-evidence') {
        taskId = academyTaskIdFromDraftKey(record.draftKey);
        if (!taskId || !options.authorizeAcademyTaskEvidence || !await options.authorizeAcademyTaskEvidence({ taskId, actor, action: 'write', attachment: record })) {
          return failure<boolean>('无权删除该附件', 403);
        }
      } else if (record.category === 'academy-course-asset') {
        const courseId = academyCourseIdFromDraftKey(record.draftKey);
        if (!courseId || !options.authorizeAcademyCourseAsset || !await options.authorizeAcademyCourseAsset({ courseId, actor, action: 'write', attachment: record })) {
          return failure<boolean>('无权删除该附件', 403);
        }
      } else {
        const access = permissionsFor(record.category);
        const uploaderMayRemove = record.uploadedById === actor.id;
        if (!uploaderMayRemove && !allowed(actor, access.write, 'write')) {
          return failure<boolean>('无权删除该附件', 403);
        }
      }
      const absolutePath = resolveStoragePath(options.rootDir, record.storageName);
      if (!absolutePath) return failure<boolean>('附件存储记录无效', 400);
      await rm(absolutePath, { force: true });
      await options.repository.remove(id);
      if (taskId) await options.onAcademyTaskEvidenceRemoved?.(taskId, id);
      return success(true);
    },
    async inspect(id: string) {
      return options.repository.find(id);
    },
    async purge(id: string) {
      const record = await options.repository.find(id);
      if (!record) return false;
      const absolutePath = resolveStoragePath(options.rootDir, record.storageName);
      if (!absolutePath) return false;
      await rm(absolutePath, { force: true });
      await options.repository.remove(id);
      return true;
    },
    async cleanupExpiredAcademyTaskEvidence(maxAgeMs = 24 * 60 * 60 * 1000) {
      const cutoff = new Date(now().getTime() - maxAgeMs);
      const expired = await options.repository.listExpiredAcademyTaskEvidence(cutoff);
      const candidates = expired.flatMap((record) => {
        const taskId = academyTaskIdFromDraftKey(record.draftKey);
        return taskId ? [{ record, taskId }] : [];
      });
      const linkedIds = options.listLinkedAcademyTaskEvidenceIds
        ? await options.listLinkedAcademyTaskEvidenceIds([...new Set(candidates.map(({ taskId }) => taskId))])
        : null;
      let removed = 0;
      for (const { record, taskId } of candidates) {
        const isLinked = linkedIds
          ? linkedIds.has(record.id)
          : await options.isAcademyTaskEvidenceLinked?.(taskId, record.id);
        if (isLinked) continue;
        const absolutePath = resolveStoragePath(options.rootDir, record.storageName);
        if (!absolutePath) continue;
        await rm(absolutePath, { force: true });
        await options.repository.remove(record.id);
        removed += 1;
      }
      return removed;
    },
  };
}
