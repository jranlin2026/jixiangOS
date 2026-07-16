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

class MemoryRepository {
  records = new Map<string, BusinessAttachmentRecord>();
  async create(record: BusinessAttachmentRecord) { this.records.set(record.id, structuredClone(record)); }
  async find(id: string) { return structuredClone(this.records.get(id) || null); }
  async remove(id: string) { this.records.delete(id); }
}

const rootDir = await mkdtemp(path.join(os.tmpdir(), 'jixiang-attachment-'));
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
      size: 3,
      buffer: Buffer.from('png'),
    },
  }, uploader);
  assert.equal(uploaded.code, 0);
  assert.equal(uploaded.data?.name, '聊天截图.png');
  assert.equal(uploaded.data?.uploadedById, uploader.id);
  assert.equal('storageName' in uploaded.data!, false, '响应不得泄露磁盘文件名');
  assert.equal((await readFile(path.join(rootDir, repository.records.get('attachment-1')!.storageName))).toString(), 'png');

  assert.equal((await service.open('attachment-1', uploader)).code, 0);
  assert.equal((await service.open('attachment-1', reviewer)).code, 0);
  assert.equal((await service.open('attachment-1', outsider)).code, 403);
  assert.equal((await service.remove('attachment-1', outsider)).code, 403);
  assert.equal((await service.remove('attachment-1', uploader)).code, 0);
  assert.equal(await repository.find('attachment-1'), null);

  const invalid = await service.upload({
    draftKey: 'draft-order-2',
    category: 'order-payment-proof',
    file: { originalName: '合同.pdf', mimeType: 'application/pdf', size: 3, buffer: Buffer.from('pdf') },
  }, uploader);
  assert.equal(invalid.code, 400);
  assert.match(invalid.message, /图片/);
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
