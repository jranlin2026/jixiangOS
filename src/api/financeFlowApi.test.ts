import assert from 'node:assert/strict';
import type { Commission } from '../types/commission';
import type { FinanceExpense, FinanceIncome } from '../types/finance';
import type { Order } from '../types/order';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { financeApi } from './financeApi';

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

const paidOrder: Order = {
  id: 'order-paid',
  orderNo: 'ORD-20260627-0001',
  customerId: 'cust-a',
  customerName: '福建极享信息科技有限公司',
  productName: 'AI产品',
  productLevel: '旗舰版',
  orderType: '新购',
  amount: 199,
  actualAmount: 199,
  paymentMethod: '银行转账',
  status: '已完成',
  refundStatus: '无',
  owner: '朱发燃',
  salesId: 'user-sales',
  salesName: '朱发燃',
  payments: [{
    id: 'pay-a',
    amount: 199,
    paymentMethod: '银行转账',
    paidAt: '2026-06-27T10:20:30.000Z',
    paymentOrderNo: 'PAY-001',
  }],
  createdAt: '2026-06-27T10:19:00.000Z',
  updatedAt: '2026-06-27T10:20:30.000Z',
};

const deletedOrder: Order = {
  ...paidOrder,
  id: 'order-deleted',
  orderNo: 'ORD-20260627-0002',
  deletedAt: '2026-06-27T11:00:00.000Z',
};

const orphanIncome: FinanceIncome = {
  id: 'income-orphan',
  orderId: 'missing-order',
  orderNo: 'ORD-LEGACY-0001',
  amount: 88,
  paymentMethod: '支付宝',
  customerName: '历史客户',
  productName: '历史产品',
  productLevel: '标准版',
  receivedAt: '2026-06-26T08:00:00.000Z',
};

const expense: FinanceExpense = {
  id: 'expense-a',
  category: '业务支出',
  amount: 20,
  description: '购买办公耗材',
  approvedBy: '财务',
  paidAt: '2026-06-26T12:00:00.000Z',
};

const paidCommission: Commission = {
  id: 'comm-a',
  orderId: 'order-paid',
  orderNo: 'ORD-20260627-0001',
  customerName: '福建极享信息科技有限公司',
  productLevel: '旗舰版',
  orderAmount: 199,
  commissionRate: 0.1,
  commissionAmount: 19.9,
  role: '销售',
  owner: '朱发燃',
  department: '销售部',
  paymentDate: '2026-06-27T10:20:30.000Z',
  status: '已发放',
  paidAt: '2026-06-28T09:00:00.000Z',
  createdAt: '2026-06-27T10:20:30.000Z',
  updatedAt: '2026-06-28T09:00:00.000Z',
};

storage.clear();
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([paidOrder, deletedOrder]));
storage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify([paidCommission]));
storage.setItem(STORAGE_KEYS.FINANCE, JSON.stringify({
  dailyRecords: [],
  channelROI: [],
  incomes: [orphanIncome],
  expenses: [expense],
}));

const transactions = await financeApi.fetchFinanceTransactions({
  page: 1,
  pageSize: 20,
});

assert.equal(transactions.code, 0);
assert.equal(transactions.data.pagination.total, 4);
assert.equal(
  transactions.data.items.some((item) => item.relatedBusiness === 'ORD-20260627-0002'),
  false,
  'deleted source orders should not generate normal ledger rows',
);

const orderPayment = transactions.data.items.find((item) => item.relatedBusiness === 'ORD-20260627-0001' && item.type === '订单收款');
assert.ok(orderPayment, 'paid order should automatically generate an income ledger row');
assert.equal(orderPayment?.type, '订单收款');
assert.equal(orderPayment?.direction, 'income');
assert.equal(orderPayment?.amount, 199);
assert.equal(orderPayment?.productName, 'AI产品');

const searched = await financeApi.fetchFinanceTransactions({
  search: '办公耗材',
  direction: 'expense',
  page: 1,
  pageSize: 10,
});
assert.equal(searched.data.pagination.total, 1);
assert.equal(searched.data.items[0].type, '业务支出');

const commissionPayouts = await financeApi.fetchFinanceTransactions({
  type: '提成发放',
  direction: 'expense',
  page: 1,
  pageSize: 10,
});
assert.equal(commissionPayouts.data.pagination.total, 1);
assert.equal(commissionPayouts.data.items[0].amount, 19.9);
assert.equal(commissionPayouts.data.items[0].operatorName, '朱发燃');

const detail = await financeApi.fetchFinanceTransactionById(orderPayment!.id);
assert.equal(detail.data?.id, orderPayment!.id);
assert.equal(detail.data?.sourceModule, '订单');

const csv = await financeApi.exportFinanceTransactionsCsv({ search: 'ORD-20260627-0001' });
assert.match(csv.data, /流水编号,流水类型,方向,金额,关联业务,客户\/对象,产品名称,经办人,状态,发生时间,来源模块,原因/);
assert.match(csv.data, /ORD-20260627-0001/);
assert.doesNotMatch(csv.data, /ORD-LEGACY-0001/);
