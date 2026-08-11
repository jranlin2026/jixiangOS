import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import { createBusinessAttachmentService, type BusinessAttachmentRecord } from './businessAttachmentService';

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

class MemoryRepository {
  records = new Map<string, BusinessAttachmentRecord>();
  async create(record: BusinessAttachmentRecord) { this.records.set(record.id, structuredClone(record)); }
  async find(id: string) { return structuredClone(this.records.get(id) || null); }
  async remove(id: string) { this.records.delete(id); }
}

const rootDir = await mkdtemp(path.join(os.tmpdir(), 'jixiang-attachment-'));
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
try {
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

  const academyService = createBusinessAttachmentService({
    repository,
    rootDir,
    now: () => new Date(NOW),
    id: () => 'attachment-academy',
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
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
