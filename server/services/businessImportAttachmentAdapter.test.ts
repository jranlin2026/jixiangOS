import assert from 'node:assert/strict';
import {
  loadVerifiedBusinessImportAttachments,
  validateBusinessImportAttachments,
} from './businessImportAdapter';
import { BusinessImportError } from './businessImportService';

const actor = { id: 'importer-1', name: '导入人' } as any;
const records = [
  {
    recordId: 'payment-1',
    data: {
      id: 'payment-1', name: '付款.jpg', mimeType: 'image/jpeg', size: 20, category: 'order-payment-proof',
      uploadedById: actor.id, uploadedByName: actor.name, uploadedAt: '2026-07-25', storageName: 'payment-1.jpg',
      draftKey: 'business-import:orders:draft-1:2',
    },
  },
  {
    recordId: 'deal-1',
    data: {
      id: 'deal-1', name: '聊天.png', mimeType: 'image/png', size: 30, category: 'order-deal-evidence',
      uploadedById: actor.id, uploadedByName: actor.name, uploadedAt: '2026-07-25', storageName: 'deal-1.png',
      draftKey: 'business-import:orders:draft-1:2',
    },
  },
  {
    recordId: 'recovery-1',
    data: {
      id: 'recovery-1', name: '挽回凭证.webp', mimeType: 'image/webp', size: 40, category: 'recovery-payment-proof',
      uploadedById: actor.id, uploadedByName: actor.name, uploadedAt: '2026-07-25', storageName: 'recovery-1.webp',
      draftKey: 'business-import:recovery_orders:draft-2:3',
    },
  },
];
const prisma = {
  businessRecord: {
    findMany: async ({ where }: any) => records.filter((record) => where.recordId.in.includes(record.recordId)),
  },
} as any;
const row = {
  rowNumber: 2, customerName: '客户甲', customerPhone: '13800000000', customerWechat: '', productName: '产品',
  orderType: '新购', paymentChannel: '对公银行转账', paymentAmount: '100', paidAt: '2026-07-25',
  salesUserName: '销售甲', thirdPartyOrderNo: '', remark: '', paymentProofFileName: '付款.jpg',
  dealEvidenceFileNames: '聊天.png', paymentProofAttachmentIds: ['payment-1'], dealEvidenceAttachmentIds: ['deal-1'],
};

await validateBusinessImportAttachments(prisma, actor, 'orders', [row], 'draft-1');
const loaded = await loadVerifiedBusinessImportAttachments(prisma, actor, 'orders', row);
assert.deepEqual(loaded.paymentProof.map((item) => item.id), ['payment-1']);
assert.deepEqual(loaded.dealEvidence.map((item) => item.id), ['deal-1']);
assert.deepEqual(loaded.recoveryEvidence, []);
assert.equal('storageName' in loaded.paymentProof[0], false, '业务记录不得持久化私有磁盘文件名');

const recoveryRow = {
  rowNumber: 3, customerName: '临时客户', customerPhone: '', customerWechat: 'wx-temp', thirdPartyOrderNo: 'THIRD-1',
  originalProduct: '历史产品', sourcePlatform: '', sourceShop: '', paymentChannel: '', originalAmount: '',
  recoveryAmount: '88', recoveryAt: '2026-07-25', recoveryUserName: '售后甲',
  remark: '', recoveryEvidenceFileNames: '挽回凭证.webp', recoveryEvidenceAttachmentIds: ['recovery-1'],
};
await validateBusinessImportAttachments(prisma, actor, 'recovery_orders', [recoveryRow], 'draft-2');
const recoveryLoaded = await loadVerifiedBusinessImportAttachments(prisma, actor, 'recovery_orders', recoveryRow);
assert.deepEqual(recoveryLoaded.recoveryEvidence.map((item) => item.id), ['recovery-1']);
assert.deepEqual(recoveryLoaded.paymentProof, []);

await assert.rejects(
  () => validateBusinessImportAttachments(prisma, { ...actor, id: 'other' }, 'orders', [row], 'draft-1'),
  (error: unknown) => error instanceof BusinessImportError && error.status === 409 && /不属于当前导入人/.test(error.message),
);
await assert.rejects(
  () => validateBusinessImportAttachments(prisma, actor, 'orders', [{ ...row, paymentProofFileName: '其他.jpg' }], 'draft-1'),
  (error: unknown) => error instanceof BusinessImportError && error.status === 409 && /文件名不一致/.test(error.message),
);
await assert.rejects(
  () => validateBusinessImportAttachments(prisma, actor, 'orders', [row], 'another-draft'),
  (error: unknown) => error instanceof BusinessImportError && error.status === 409 && /本次预检文件/.test(error.message),
);
await assert.rejects(
  () => validateBusinessImportAttachments(prisma, actor, 'orders', [row, { ...row, rowNumber: 4 }], 'draft-1'),
  (error: unknown) => error instanceof BusinessImportError && error.status === 409 && /不能绑定到多条记录/.test(error.message),
);

console.log('business import attachment adapter: ok');
