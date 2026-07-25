import assert from 'node:assert/strict';
import {
  compactDeliveryListItem,
  compactOrderApplicationListItem,
  compactOrderListItem,
  compactRecoveryOrderListItem,
  compactRecoverySettlementListItem,
} from './listPayload';

const inline = `data:image/png;base64,${'A'.repeat(10_000)}`;
const remote = 'https://cdn.example.com/proof.png';

const order = {
  id: 'order-1',
  dealEvidencePreview: inline,
  payments: [
    { id: 'payment-1', voucherPreview: inline, attachments: [{ id: 'proof', name: 'proof.png', mimeType: 'image/png', size: 1, category: 'order-payment-proof', uploadedById: 'u1', uploadedByName: 'A', uploadedAt: '2026-01-01', storageName: 'secret.png', buffer: inline }] },
    { id: 'payment-2', voucherPreview: remote },
  ],
} as any;
const compactOrder = compactOrderListItem(order);
assert.equal(compactOrder.dealEvidencePreview, undefined);
assert.equal(compactOrder.payments[0].voucherPreview, undefined);
assert.equal(compactOrder.payments[1].voucherPreview, remote);
assert.equal((compactOrder.payments[0].attachments?.[0] as any).storageName, undefined);
assert.equal((compactOrder.payments[0].attachments?.[0] as any).buffer, undefined);
assert.equal(order.dealEvidencePreview, inline, 'list projection must not mutate detail data');
assert.ok(JSON.stringify(compactOrder).length < JSON.stringify(order).length / 10);

const application = {
  id: 'application-1',
  orderData: order,
  importBatchId: 'batch-1',
  importRowNumber: 2,
  importedById: 'importer-secret-id',
  importedByName: '导入人',
  importedAt: '2026-07-24T10:00:00.000Z',
  targetCreatorId: 'creator-secret-id',
  targetCreatorName: '目标创建人',
  importWarnings: ['内部预检详情'],
} as any;
const compactApplication = compactOrderApplicationListItem(application);
assert.equal(compactApplication.orderData.dealEvidencePreview, undefined);
assert.equal(application.orderData.dealEvidencePreview, inline);
assert.equal(compactApplication.importBatchId, 'batch-1');
assert.equal(compactApplication.importRowNumber, 2);
assert.equal(compactApplication.importedByName, '导入人');
assert.equal(compactApplication.importedAt, '2026-07-24T10:00:00.000Z');
assert.equal(compactApplication.importedById, undefined);
assert.equal(compactApplication.targetCreatorId, undefined);
assert.equal(compactApplication.targetCreatorName, undefined);
assert.equal(compactApplication.importWarnings, undefined);

const recovery = {
  id: 'recovery-1',
  customerId: 'internal-customer-id',
  linkedLeadId: 'internal-lead-id',
  customerPhone: '13800000000',
  customerWechat: 'private-wechat',
  remark: 'private remark',
  importBatchId: 'batch-recovery',
  importRowNumber: 3,
  importedById: 'importer-secret-id',
  importedByName: '导入人',
  importedAt: '2026-07-24T11:00:00.000Z',
  targetCreatorId: 'creator-secret-id',
  targetCreatorName: '目标创建人',
  importWarnings: ['内部预检详情'],
  paymentVoucherPreview: inline,
  chatEvidencePreview: inline,
  recoveryAttachments: [{ id: 'recovery-proof', name: 'recovery-proof.png', mimeType: 'image/png', size: 1, category: 'recovery-payment-proof', uploadedById: 'u1', uploadedByName: 'A', uploadedAt: '2026-01-01', storageName: 'secret.png' }],
  paymentAttachments: [{ id: 'proof', name: 'proof.png', mimeType: 'image/png', size: 1, category: 'recovery-payment-proof', uploadedById: 'u1', uploadedByName: 'A', uploadedAt: '2026-01-01', storageName: 'secret.png' }],
} as any;
const compactRecovery = compactRecoveryOrderListItem(recovery);
assert.equal(compactRecovery.paymentVoucherPreview, undefined);
assert.equal(compactRecovery.chatEvidencePreview, undefined);
assert.equal((compactRecovery.recoveryAttachments?.[0] as any).storageName, undefined);
assert.equal((compactRecovery.paymentAttachments?.[0] as any).storageName, undefined);
assert.equal(recovery.paymentVoucherPreview, inline);
assert.equal(compactRecovery.importBatchId, 'batch-recovery');
assert.equal(compactRecovery.importRowNumber, 3);
assert.equal(compactRecovery.importedByName, '导入人');
assert.equal(compactRecovery.importedAt, '2026-07-24T11:00:00.000Z');
assert.equal(compactRecovery.importedById, undefined);
assert.equal(compactRecovery.targetCreatorId, undefined);
assert.equal(compactRecovery.targetCreatorName, undefined);
assert.equal(compactRecovery.importWarnings, undefined);
assert.equal(compactRecovery.customerId, '');
assert.equal(compactRecovery.linkedLeadId, undefined);
assert.ok(JSON.stringify(compactRecovery).length < JSON.stringify(recovery).length / 10);
const compactSettlement = compactRecoverySettlementListItem(recovery);
assert.equal(compactSettlement.customerPhone, undefined);
assert.equal(compactSettlement.customerWechat, undefined);
assert.equal(compactSettlement.remark, undefined);

const delivery = {
  id: 'delivery-1',
  tasks: [{
    id: 'task-1',
    attachments: [{ id: 'attachment-1', url: inline }, { id: 'attachment-2', url: remote }],
    records: [{ id: 'record-1', attachments: [inline, remote] }],
  }],
  materialItems: [{
    key: 'material-1',
    attachments: [{ id: 'attachment-3', url: inline }],
  }],
} as any;
const compactDelivery = compactDeliveryListItem(delivery);
assert.equal(compactDelivery.tasks[0].attachments?.[0].url, undefined);
assert.equal(compactDelivery.tasks[0].attachments?.[1].url, remote);
assert.deepEqual(compactDelivery.tasks[0].records[0].attachments, [remote]);
assert.equal(compactDelivery.materialItems?.[0].attachments?.[0].url, undefined);
assert.equal(delivery.tasks[0].attachments[0].url, inline);
