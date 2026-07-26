import assert from 'node:assert/strict';
import { businessImportAttachmentDraftId, uploadBusinessImportPackageImages } from './businessImportPackageUpload';
import type { BusinessImportPackageImage } from './businessImportWorkbook';

const images: BusinessImportPackageImage[] = [
  { rowNumber: 2, category: 'order-payment-proof', name: '付款.jpg', mimeType: 'image/jpeg', bytes: Uint8Array.from([1]) },
  { rowNumber: 2, category: 'order-deal-evidence', name: '聊天1.png', mimeType: 'image/png', bytes: Uint8Array.from([2]) },
  { rowNumber: 2, category: 'order-deal-evidence', name: '聊天2.png', mimeType: 'image/png', bytes: Uint8Array.from([3]) },
];
const rows = [{
  rowNumber: 2, customerName: '客户甲', customerPhone: '13800000000', customerWechat: '', productName: '产品',
  orderType: '新购', paymentChannel: '对公银行转账', paymentAmount: '100', paidAt: '2026-07-25', salesUserName: '销售甲',
  thirdPartyOrderNo: '', remark: '', paymentProofFileName: '付款.jpg', dealEvidenceFileNames: '聊天1.png;聊天2.png',
}];
const uploadedDraftKeys: string[] = [];
assert.equal(
  await businessImportAttachmentDraftId('precheck-token'),
  '2428bf568068c7dd79e5f10495bf1e0b8b66228823dbf203d1aced95865f2b59',
  '附件草稿必须稳定绑定本次预检令牌',
);
const result = await uploadBusinessImportPackageImages({
  type: 'orders', rows, images, draftId: 'draft-1',
  upload: async (image, draftKey) => {
    uploadedDraftKeys.push(draftKey);
    return {
      id: `attachment-${image.bytes[0]}`, name: image.name, mimeType: image.mimeType, size: image.bytes.length,
      category: image.category, uploadedById: 'u1', uploadedByName: '导入人', uploadedAt: '2026-07-25',
    };
  },
  remove: async () => undefined,
});
assert.deepEqual((result.rows[0] as any).paymentProofAttachmentIds, ['attachment-1']);
assert.deepEqual((result.rows[0] as any).dealEvidenceAttachmentIds, ['attachment-2', 'attachment-3']);
assert.deepEqual(uploadedDraftKeys, Array(3).fill('business-import:orders:draft-1:2'));

const subsetUploads: number[] = [];
const subsetRows = [rows[0], {
  ...rows[0], rowNumber: 3, paymentProofFileName: '被阻止付款.jpg', dealEvidenceFileNames: '',
}];
const subset = await uploadBusinessImportPackageImages({
  type: 'orders', rows: subsetRows, images: [images[0]], draftId: 'draft-subset',
  upload: async (image) => {
    subsetUploads.push(image.rowNumber);
    return {
      id: 'attachment-eligible', name: image.name, mimeType: image.mimeType, size: 1,
      category: image.category, uploadedById: 'u1', uploadedByName: '导入人', uploadedAt: '2026-07-25',
    };
  },
  remove: async () => undefined,
});
assert.equal(subset.rows.length, 2, 'eligible image filtering must preserve the complete workbook rows');
assert.deepEqual((subset.rows[0] as any).paymentProofAttachmentIds, ['attachment-eligible']);
assert.deepEqual((subset.rows[1] as any).paymentProofAttachmentIds, []);
assert.deepEqual(subsetUploads, [2], 'only the eligible row image is uploaded');

const removed: string[] = [];
await assert.rejects(
  () => uploadBusinessImportPackageImages({
    type: 'orders', rows, images, draftId: 'draft-failure',
    upload: async (image) => {
      if (image.bytes[0] === 2) throw new Error('网络中断');
      return {
        id: `attachment-${image.bytes[0]}`, name: image.name, mimeType: image.mimeType, size: 1,
        category: image.category, uploadedById: 'u1', uploadedByName: '导入人', uploadedAt: '2026-07-25',
      };
    },
    remove: async (id) => { removed.push(id); },
  }),
  /网络中断/,
);
assert.deepEqual(removed.sort(), ['attachment-1', 'attachment-3'], '任一图片上传失败时清理同次已上传的草稿附件');

console.log('business import package upload: ok');
