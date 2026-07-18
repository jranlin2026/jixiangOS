import assert from 'node:assert/strict';
import { rewriteCustomerAssociationValue } from './customerAssociationMergeService';

const rewritten = rewriteCustomerAssociationValue({
  customerId: 'secondary',
  customerName: '旧名称',
  orderData: { customerId: 'secondary', customerName: '旧名称' },
  subjectType: 'customer',
  subjectId: 'secondary',
  untouched: { customerId: 'secondary' },
}, new Set(['secondary']), 'main', '主客户');

assert.deepEqual(rewritten.value, {
  customerId: 'main',
  customerName: '主客户',
  orderData: { customerId: 'main', customerName: '主客户' },
  subjectType: 'customer',
  subjectId: 'main',
  untouched: { customerId: 'secondary' },
});
assert.equal(rewritten.changed, true);
assert.deepEqual(
  rewriteCustomerAssociationValue({ subjectType: 'lead', subjectId: 'secondary' }, new Set(['secondary']), 'main', '主客户'),
  { value: { subjectType: 'lead', subjectId: 'secondary' }, changed: false },
);

console.log('customer association merge: ok');
