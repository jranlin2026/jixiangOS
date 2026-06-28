import assert from 'node:assert/strict';
import { recoveryOrderApi } from './recoveryOrderApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { Commission } from '../types/commission';
import type { Customer } from '../types/customer';
import type { RecoveryOrder } from '../types/recoveryOrder';

const storage = (() => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) || null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => Array.from(data.keys())[index] || null,
    get length() {
      return data.size;
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

const now = '2026-06-28T10:00:00.000Z';
const existingCustomer = {
  id: 'cust-existing',
  name: '热帖',
  company: '热帖',
  phone: '13800000000',
  wechat: 'retie',
  customerLevel: 'L2',
  owner: '系统管理员',
  totalSpent: 899,
  orderCount: 1,
  growthPath: [],
  growthRecords: [],
  createdAt: now,
  updatedAt: now,
} as Customer;

storage.clear();
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([existingCustomer]));
storage.setItem(STORAGE_KEYS.RECOVERY_ORDERS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify([]));

const matched = await recoveryOrderApi.createRecoveryOrder({
  customerName: '热帖',
  customerPhone: '13800000000',
  customerWechat: '',
  thirdPartyOrderNo: 'TP-001',
  sourcePlatform: '第三方小店',
  originalProduct: 'AI课程',
  originalAmount: 899,
  refundStatus: '退款中',
  recoveryAmount: 699,
  recoveryUserId: 'user-service',
  recoveryUserName: '售后小陈',
  createdBy: 'user-service',
  createdByName: '售后小陈',
});

assert.equal(matched.code, 0);
assert.equal(matched.data.customerId, 'cust-existing');
assert.equal(matched.data.customerMatchStatus, '已绑定客户');
assert.equal((JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]') as Customer[]).length, 1);

const temporary = await recoveryOrderApi.createRecoveryOrder({
  customerName: '第三方客户',
  customerPhone: '13900000000',
  customerWechat: 'third-party',
  thirdPartyOrderNo: 'TP-002',
  sourcePlatform: '抖音',
  originalProduct: '代理服务',
  originalAmount: 2980,
  refundStatus: '退款中',
  recoveryAmount: 1980,
  paymentVoucher: 'pay.png',
  chatEvidence: 'chat.png',
  recoveryUserId: 'user-service',
  recoveryUserName: '售后小陈',
  assistUserId: 'user-cs',
  assistUserName: '客户成功小吴',
  createdBy: 'user-service',
  createdByName: '售后小陈',
});

assert.equal(temporary.code, 0);
assert.equal(temporary.data.customerMatchStatus, '售后临时客户');
assert.equal((JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]') as Customer[]).length, 2);

const rejectWithoutReason = await recoveryOrderApi.rejectRecoveryOrder(temporary.data.id, 'admin', '系统管理员', '');
assert.notEqual(rejectWithoutReason.code, 0);

const approved = await recoveryOrderApi.approveRecoveryOrder(temporary.data.id, 'finance', '财务专员');
assert.equal(approved.code, 0);
assert.equal(approved.data?.status, '已生成提成');
assert.equal(approved.data?.commissionIds?.length, 2);

const commissions = JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as Commission[];
assert.equal(commissions.length, 2);
assert.equal(commissions[0].sourceRecoveryOrderId, temporary.data.id);
assert.equal(commissions[0].sourceBusinessType, 'refund_recovery');
assert.equal(commissions[0].orderNo, approved.data?.recoveryNo);
assert.ok(commissions.every((commission) => commission.isRecoveryBonus));

const list = await recoveryOrderApi.fetchRecoveryOrders({ ownerId: 'user-service', pageSize: 20 });
assert.equal(list.data.pagination.total, 2);
assert.ok(list.data.items.every((item: RecoveryOrder) => item.createdBy === 'user-service' || item.recoveryUserId === 'user-service'));
