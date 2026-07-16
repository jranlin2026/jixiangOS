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
    { id: 'payment-1', voucherPreview: inline },
    { id: 'payment-2', voucherPreview: remote },
  ],
} as any;
const compactOrder = compactOrderListItem(order);
assert.equal(compactOrder.dealEvidencePreview, undefined);
assert.equal(compactOrder.payments[0].voucherPreview, undefined);
assert.equal(compactOrder.payments[1].voucherPreview, remote);
assert.equal(order.dealEvidencePreview, inline, 'list projection must not mutate detail data');
assert.ok(JSON.stringify(compactOrder).length < JSON.stringify(order).length / 10);

const application = { id: 'application-1', orderData: order } as any;
const compactApplication = compactOrderApplicationListItem(application);
assert.equal(compactApplication.orderData.dealEvidencePreview, undefined);
assert.equal(application.orderData.dealEvidencePreview, inline);

const recovery = {
  id: 'recovery-1',
  customerPhone: '13800000000',
  customerWechat: 'private-wechat',
  remark: 'private remark',
  paymentVoucherPreview: inline,
  chatEvidencePreview: inline,
} as any;
const compactRecovery = compactRecoveryOrderListItem(recovery);
assert.equal(compactRecovery.paymentVoucherPreview, undefined);
assert.equal(compactRecovery.chatEvidencePreview, undefined);
assert.equal(recovery.paymentVoucherPreview, inline);
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
