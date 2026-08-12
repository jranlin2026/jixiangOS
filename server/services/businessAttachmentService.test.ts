import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import { createBusinessAttachmentService, createPrismaBusinessAttachmentRepository, type BusinessAttachmentRecord } from './businessAttachmentService';

const NOW = '2026-07-16T14:00:00.000Z';
const uploader: AuthenticatedUser = {
  id: 'sales-1', name: '销售一', account: 'sales1', email: '', phone: '', role: '销售', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.ORDER_CREATE, actions: ['read', 'write'] }],
};
const reviewer: AuthenticatedUser = {
  id: 'finance-1', name: '财务一', account: 'finance1', email: '', phone: '', role: '财务', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.ORDER_REVIEW_LIST, actions: ['read'] }],
};
const outsider: AuthenticatedUser = {
  id: 'other-1', name: '其他人', account: 'other1', email: '', phone: '', role: '员工', isActive: true,
  permissions: [],
};
const recoveryUploader: AuthenticatedUser = {
  ...uploader,
  permissions: [{ module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, actions: ['read', 'write'] }],
};
const recoveryFinance: AuthenticatedUser = {
  ...reviewer,
  permissions: [{ module: PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, actions: ['read', 'write'] }],
};
const orderImporter: AuthenticatedUser = {
  ...uploader,
  id: 'order-importer',
  permissions: [{ module: PERMISSION_KEYS.ORDER_IMPORT, actions: ['read', 'write'] }],
};
const orderCorrector: AuthenticatedUser = {
  ...uploader,
  id: 'order-corrector',
  permissions: [{ module: PERMISSION_KEYS.ORDER_CORRECT, actions: ['read', 'write'] }],
};
const academyManager: AuthenticatedUser = {
  ...uploader,
  id: 'academy-manager',
  name: '学院管理员',
  permissions: [{ module: PERMISSION_KEYS.ACADEMY_COURSE_MANAGE, actions: ['read', 'write'] }],
};
const academyViewer: AuthenticatedUser = {
  ...outsider,
  id: 'academy-viewer',
  permissions: [{ module: PERMISSION_KEYS.ACADEMY_VIEW, actions: ['read'] }],
};
const academyTaskAssignee: AuthenticatedUser = {
  ...outsider,
  id: 'academy-task-assignee',
  name: '课程内容负责人',
};
const academySessionManager: AuthenticatedUser = {
  ...outsider,
  id: 'academy-session-manager',
  name: '课程运营',
  permissions: [{ module: PERMISSION_KEYS.ACADEMY_SESSION_MANAGE, actions: ['read', 'write'] }],
};

class MemoryRepository {
  records = new Map<string, BusinessAttachmentRecord>();
  async create(record: BusinessAttachmentRecord) { this.records.set(record.id, structuredClone(record)); }
  async find(id: string) { return structuredClone(this.records.get(id) || null); }
  async remove(id: string) { this.records.delete(id); }
  async listExpiredAcademyTaskEvidence(before: Date) {
    return [...this.records.values()].filter((record) => record.category === 'academy-task-evidence' && new Date(record.uploadedAt) < before);
  }
}

const rootDir = await mkdtemp(path.join(os.tmpdir(), 'jixiang-attachment-'));
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
try {
  let cleanupQuery: any = null;
  const cleanupPrismaRepository = createPrismaBusinessAttachmentRepository({
    businessRecord: {
      findMany: async (args: any) => (cleanupQuery = args, []),
    },
  } as any);
  await cleanupPrismaRepository.listExpiredAcademyTaskEvidence(new Date(NOW));
  assert.deepEqual(cleanupQuery.where.data, { path: '$.category', equals: 'academy-task-evidence' });
  assert.equal(cleanupQuery.take, 500, '清理每批须设定上限，不得全量加载历史业务附件');

  const repository = new MemoryRepository();
  const service = createBusinessAttachmentService({
    repository,
    rootDir,
    now: () => new Date(NOW),
    id: () => 'attachment-1',
  });

  const uploaded = await service.upload({
    draftKey: 'draft-order-1',
    category: 'order-deal-evidence',
    file: {
      originalName: '../聊天截图.png',
      mimeType: 'image/png',
      size: pngBytes.length,
      buffer: pngBytes,
    },
  }, uploader);
  assert.equal(uploaded.code, 0);
  assert.equal(uploaded.data?.name, '聊天截图.png');
  assert.equal(uploaded.data?.uploadedById, uploader.id);
  assert.equal('storageName' in uploaded.data!, false, '响应不得泄露磁盘文件名');
  assert.deepEqual(await readFile(path.join(rootDir, repository.records.get('attachment-1')!.storageName)), pngBytes);

  assert.equal((await service.open('attachment-1', uploader)).code, 0);
  assert.equal((await service.open('attachment-1', reviewer)).code, 0);
  assert.equal((await service.open('attachment-1', outsider)).code, 403);
  assert.equal((await service.remove('attachment-1', outsider)).code, 403);
  assert.equal((await service.remove('attachment-1', uploader)).code, 0);
  assert.equal(await repository.find('attachment-1'), null);

  const recoveryProof = await service.upload({
    draftKey: 'draft-recovery-1',
    category: 'recovery-payment-proof',
    file: { originalName: '挽回凭证.png', mimeType: 'image/png', size: pngBytes.length, buffer: pngBytes },
  }, recoveryUploader);
  assert.equal(recoveryProof.code, 0);
  assert.equal((await service.open('attachment-1', recoveryFinance)).code, 0, '财务分账人员应能打开挽回凭证');

  const invalid = await service.upload({
    draftKey: 'draft-order-2',
    category: 'order-payment-proof',
    file: { originalName: '合同.pdf', mimeType: 'application/pdf', size: 3, buffer: Buffer.from('pdf') },
  }, uploader);
  assert.equal(invalid.code, 400);
  assert.match(invalid.message, /图片/);

  const disguised = await service.upload({
    draftKey: 'business-import:orders:draft-1:2',
    category: 'order-payment-proof',
    file: { originalName: '伪造.jpg', mimeType: 'image/jpeg', size: 4, buffer: Buffer.from('text') },
  }, orderImporter);
  assert.equal(disguised.code, 400);
  assert.match(disguised.message, /内容与文件类型不匹配/);

  const importProof = await service.upload({
    draftKey: 'business-import:orders:draft-1:2',
    category: 'order-payment-proof',
    file: { originalName: '导入付款.jpg', mimeType: 'image/jpeg', size: 4, buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
  }, orderImporter);
  assert.equal(importProof.code, 0, '独立订单导入权限应允许上传导入包图片');

  const correctionService = createBusinessAttachmentService({
    repository,
    rootDir,
    now: () => new Date(NOW),
    id: () => 'attachment-correction',
  });
  const correctionProof = await correctionService.upload({
    draftKey: 'draft-order-correction-1',
    category: 'order-payment-proof',
    file: { originalName: '更正付款.png', mimeType: 'image/png', size: pngBytes.length, buffer: pngBytes },
  }, orderCorrector);
  assert.equal(correctionProof.code, 0, '独立订单更正权限应允许补充订单凭证');

  const academyCourseIds = new Map<string, string>([
    ['academy-manager', 'course-1'],
    ['academy-session-manager', 'course-1'],
  ]);
  const academyService = createBusinessAttachmentService({
    repository,
    rootDir,
    now: () => new Date(NOW),
    id: () => 'attachment-academy',
    authorizeAcademyCourseAsset: async ({ courseId, actor }) => academyCourseIds.get(actor.id) === courseId,
  });
  const academyAsset = await academyService.upload({
    draftKey: 'academy-course-course-1-SCRIPT',
    category: 'academy-course-asset',
    file: {
      originalName: '课程逐字稿.txt',
      mimeType: 'text/plain',
      size: 12,
      buffer: Buffer.from('academy text'),
    },
  }, academyManager);
  assert.equal(academyAsset.code, 0, '学院课程管理员应可上传课程资产');
  assert.equal((await academyService.open('attachment-academy', academyManager)).code, 0);
  assert.equal((await academyService.open('attachment-academy', outsider)).code, 403);
  const otherCourseManager = { ...academyManager, id: 'other-course-manager', name: '其他课程管理员' };
  academyCourseIds.set(otherCourseManager.id, 'course-2');
  assert.equal(
    (await academyService.open('attachment-academy', otherCourseManager)).code,
    403,
    '拥有课程管理权但数据范围不包含该课程时，不得按附件ID下载',
  );
  assert.equal(
    (await academyService.upload({
      draftKey: 'academy-course-course-1-SCRIPT',
      category: 'academy-course-asset',
      file: { originalName: '越权课件.txt', mimeType: 'text/plain', size: 4, buffer: Buffer.from('test') },
    }, otherCourseManager)).code,
    403,
    '课程资产上传也必须通过draftKey所属课程的对象级范围校验',
  );
  assert.equal(
    (await academyService.open('attachment-academy', academyViewer)).code,
    403,
    '仅工作台查看权不得下载课程资产',
  );

  let currentTaskAssigneeId = academyTaskAssignee.id;
  let taskStatus = 'IN_PROGRESS';
  let linkedTaskAttachmentId = '';
  const taskEvidenceService = createBusinessAttachmentService({
    repository,
    rootDir,
    now: () => new Date(NOW),
    id: () => 'attachment-task-evidence',
    authorizeAcademyTaskEvidence: async ({ taskId, actor, action, attachment }) => {
      if (taskId !== 'task-1') return false;
      if (action === 'read') {
        return attachment?.id === linkedTaskAttachmentId && (
          actor.id === currentTaskAssigneeId
          || actor.id === academySessionManager.id
        );
      }
      return actor.id === currentTaskAssigneeId
        && !['SUBMITTED', 'DONE', 'SKIPPED'].includes(taskStatus)
        && (!attachment || attachment.uploadedById === actor.id);
    },
  });
  const taskEvidence = await taskEvidenceService.upload({
    draftKey: 'academy-task:task-1',
    category: 'academy-task-evidence',
    file: {
      originalName: '课程大纲.txt',
      mimeType: 'text/plain',
      size: 12,
      buffer: Buffer.from('task evidence'),
    },
  }, academyTaskAssignee);
  assert.equal(taskEvidence.code, 0, '当前负责人应可上传任务交付物');
  assert.equal((await taskEvidenceService.open('attachment-task-evidence', academyTaskAssignee)).code, 403, '尚未关联的草稿附件不得直接读取');
  assert.equal((await taskEvidenceService.remove('attachment-task-evidence', academyTaskAssignee)).code, 0, '关联失败后上传者必须能清理未关联草稿');
  const reuploadedTaskEvidenceService = createBusinessAttachmentService({
    repository,
    rootDir,
    now: () => new Date(NOW),
    id: () => 'attachment-task-evidence',
    authorizeAcademyTaskEvidence: async ({ taskId, actor, action, attachment }) => {
      if (taskId !== 'task-1') return false;
      const linked = attachment?.id === linkedTaskAttachmentId;
      if (action === 'read') return Boolean(linked && (actor.id === currentTaskAssigneeId || actor.id === academySessionManager.id));
      if (attachment && !linked) return attachment.uploadedById === actor.id;
      return actor.id === currentTaskAssigneeId
        && !['SUBMITTED', 'DONE', 'SKIPPED'].includes(taskStatus)
        && (!attachment || attachment.uploadedById === actor.id);
    },
  });
  assert.equal((await reuploadedTaskEvidenceService.upload({
    draftKey: 'academy-task:task-1', category: 'academy-task-evidence',
    file: { originalName: '课程大纲.txt', mimeType: 'text/plain', size: 12, buffer: Buffer.from('task evidence') },
  }, academyTaskAssignee)).code, 0);
  linkedTaskAttachmentId = 'attachment-task-evidence';
  assert.equal((await reuploadedTaskEvidenceService.open('attachment-task-evidence', academyTaskAssignee)).code, 0);
  assert.equal((await reuploadedTaskEvidenceService.open('attachment-task-evidence', academySessionManager)).code, 0, '课程运营可只读验收');
  assert.equal((await reuploadedTaskEvidenceService.remove('attachment-task-evidence', academySessionManager)).code, 403, '课程运营不得删除员工交付物');
  currentTaskAssigneeId = 'replacement-assignee';
  assert.equal((await reuploadedTaskEvidenceService.open('attachment-task-evidence', academyTaskAssignee)).code, 403, '任务重分配后旧负责人必须立即失去读取权');
  assert.equal((await reuploadedTaskEvidenceService.remove('attachment-task-evidence', academyTaskAssignee)).code, 403, '任务重分配后旧负责人必须立即失去删除权');
  currentTaskAssigneeId = academyTaskAssignee.id;
  taskStatus = 'SUBMITTED';
  assert.equal((await reuploadedTaskEvidenceService.remove('attachment-task-evidence', academyTaskAssignee)).code, 403, '提交验收后附件必须冻结');

  repository.records.set('malicious-storage-name', {
    id: 'malicious-storage-name',
    name: '恶意附件.txt',
    mimeType: 'text/plain',
    size: 1,
    category: 'academy-course-asset',
    uploadedById: academyManager.id,
    uploadedByName: academyManager.name,
    uploadedAt: NOW,
    storageName: '../outside-private-file.txt',
    draftKey: 'academy-course-course-1-SCRIPT',
  });
  assert.equal((await academyService.open('malicious-storage-name', academyManager)).code, 400, '存储文件名必须受私有根目录约束');
  assert.equal((await academyService.remove('malicious-storage-name', academyManager)).code, 400, '不得删除私有根目录之外的路径');
  assert.ok(await repository.find('malicious-storage-name'), '拒绝恶意路径时不得删除附件元数据');

  const cleanupRootDir = await mkdtemp(path.join(os.tmpdir(), 'jixiang-task-cleanup-'));
  try {
    const cleanupRepository = new MemoryRepository();
    let linkedBatchCalls = 0;
    const cleanupService = createBusinessAttachmentService({
      repository: cleanupRepository,
      rootDir: cleanupRootDir,
      now: () => new Date('2026-07-18T14:00:00.000Z'),
      id: () => 'expired-task-draft',
      authorizeAcademyTaskEvidence: async () => true,
      listLinkedAcademyTaskEvidenceIds: async (taskIds) => {
        linkedBatchCalls += 1;
        assert.deepEqual(taskIds, ['task-cleanup']);
        return new Set(['linked-task-evidence']);
      },
    });
    assert.equal((await cleanupService.upload({
      draftKey: 'academy-task:task-cleanup', category: 'academy-task-evidence',
      file: { originalName: '过期草稿.txt', mimeType: 'text/plain', size: 5, buffer: Buffer.from('draft') },
    }, academyTaskAssignee)).code, 0);
    cleanupRepository.records.get('expired-task-draft')!.uploadedAt = '2026-07-16T14:00:00.000Z';
    assert.equal(await cleanupService.cleanupExpiredAcademyTaskEvidence(), 1, '24小时未关联任务附件草稿必须被清理');
    assert.equal(await cleanupRepository.find('expired-task-draft'), null);

    cleanupRepository.records.set('linked-task-evidence', {
      id: 'linked-task-evidence', name: '已关联证据.txt', mimeType: 'text/plain', size: 5,
      category: 'academy-task-evidence', uploadedById: academyTaskAssignee.id, uploadedByName: academyTaskAssignee.name,
      uploadedAt: '2026-07-16T14:00:00.000Z', storageName: 'linked-task-evidence.txt', draftKey: 'academy-task:task-cleanup',
    });
    assert.equal(await cleanupService.cleanupExpiredAcademyTaskEvidence(), 0, '已关联的审计证据不得被过期清理');
    assert.equal(linkedBatchCalls, 2, '每轮清理必须单次批量读取关联，不得按附件N+1查询');
    assert.ok(await cleanupRepository.find('linked-task-evidence'));
  } finally {
    await rm(cleanupRootDir, { recursive: true, force: true });
  }
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
