import assert from 'node:assert/strict';
import { commissionRuleApi } from './commissionRuleApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { CommissionRule } from '../types/commission';
import type { Order } from '../types/order';

const storage = (() => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

const now = '2026-06-19T08:00:00.000Z';

function seedRules(rules: CommissionRule[]) {
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.COMMISSION_RULES, JSON.stringify(rules));
}

function storedRules(): CommissionRule[] {
  return JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSION_RULES) || '[]') as CommissionRule[];
}

function seedOrders(orders: Order[]) {
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
}

function buildOrder(input: Partial<Order> & Pick<Order, 'id' | 'orderNo' | 'actualAmount' | 'salesId' | 'salesName'>): Order {
  return {
    id: input.id,
    orderNo: input.orderNo,
    customerId: input.customerId || `cust-${input.id}`,
    customerName: input.customerName || `客户-${input.id}`,
    productLevel: input.productLevel || '代理',
    orderType: input.orderType || '新代理',
    amount: input.amount ?? input.actualAmount,
    actualAmount: input.actualAmount,
    paymentMethod: input.paymentMethod || '对公转账',
    officialPaymentChannel: input.officialPaymentChannel || '对公银行转账',
    status: input.status || '已确认',
    refundStatus: input.refundStatus || '无',
    owner: input.owner || input.salesName || '',
    salesId: input.salesId,
    salesName: input.salesName,
    resourceOwnership: input.resourceOwnership || '公司资源',
    sourceType: input.sourceType || '',
    payments: input.payments || [{
      id: `pay-${input.id}`,
      amount: input.actualAmount,
      paymentMethod: input.paymentMethod || '对公转账',
      paidAt: input.createdAt || now,
    }],
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || input.createdAt || now,
  } as Order;
}

const legacyRule: CommissionRule = {
  id: 'legacy-rule',
  name: '旧复杂规则',
  productLevel: '899',
  orderType: '899成交',
  sourceType: '官网',
  resourceOwnership: '公司资源',
  role: '销售',
  commissionType: 'fixed',
  commissionValue: 120,
  isActive: true,
  priority: 1,
};

seedRules([legacyRule]);
assert.equal(typeof (commissionRuleApi as any).getSimpleCommissionRuleGroups, 'function');
assert.equal(typeof (commissionRuleApi as any).createSimpleCommissionRuleGroup, 'function');
assert.equal(typeof (commissionRuleApi as any).updateSimpleCommissionRuleGroup, 'function');
assert.equal(typeof (commissionRuleApi as any).deleteSimpleCommissionRuleGroup, 'function');
assert.equal(typeof (commissionRuleApi as any).getCommissionPayoutPlans, 'function');

async function createPlan(name: string, commissionType: 'fixed' | 'percentage' | 'tiered_percentage', commissionValue: number) {
  const res = await (commissionRuleApi as any).createCommissionPayoutPlan({
    name,
    commissionType,
    commissionValue,
    isActive: true,
    description: '',
  });
  assert.equal(res.code, 0);
  return res.data;
}

const percent8Plan = await createPlan('测试固定比例 8%', 'percentage', 8);
const percent3Plan = await createPlan('测试固定比例 3%', 'percentage', 3);
const fixed50Plan = await createPlan('测试固定金额 50', 'fixed', 50);
const fixed100Plan = await createPlan('测试固定金额 100', 'fixed', 100);
const defaultPlansRes = await (commissionRuleApi as any).getCommissionPayoutPlans();
assert.equal(defaultPlansRes.code, 0);
const tieredPlan = defaultPlansRes.data.find((plan: any) => plan.commissionType === 'tiered_percentage');
assert.ok(tieredPlan);

const initialGroups = await (commissionRuleApi as any).getSimpleCommissionRuleGroups();
assert.equal(initialGroups.code, 0);
assert.deepEqual(initialGroups.data, []);
assert.deepEqual(storedRules(), []);

const createRes = await (commissionRuleApi as any).createSimpleCommissionRuleGroup({
  name: '新代理-公司资源',
  orderType: '新代理',
  resourceOwnership: '公司资源',
  isActive: true,
  payouts: [
    { role: '销售', payoutPlanId: percent8Plan.id, commissionType: 'percentage', commissionValue: 8 },
    { role: '线索', payoutPlanId: percent3Plan.id, commissionType: 'percentage', commissionValue: 3 },
    { role: '客户成功', payoutPlanId: fixed50Plan.id, commissionType: 'fixed', commissionValue: 50 },
  ],
});
assert.equal(createRes.code, 0);
assert.equal(createRes.data.payouts.length, 3);
assert.ok(createRes.data.id);

const rulesAfterCreate = storedRules();
assert.equal(rulesAfterCreate.length, 3);
assert.equal(new Set(rulesAfterCreate.map((rule) => rule.ruleGroupId)).size, 1);
assert.equal(rulesAfterCreate.every((rule) => rule.ruleGroupName === '新代理-公司资源'), true);
assert.equal(rulesAfterCreate.every((rule) => rule.orderType === '新代理'), true);
assert.equal(rulesAfterCreate.every((rule) => rule.resourceOwnership === '公司资源'), true);
assert.equal(rulesAfterCreate.every((rule) => rule.productLevel === ''), true);
assert.equal(rulesAfterCreate.every((rule) => rule.sourceType === ''), true);
assert.equal(rulesAfterCreate.every((rule) => rule.paymentChannels?.length === 0), true);
assert.equal(rulesAfterCreate.every((rule) => rule.excludeExternalTalent === false), true);

const duplicateRes = await (commissionRuleApi as any).createSimpleCommissionRuleGroup({
  name: '重复规则',
  orderType: '新代理',
  resourceOwnership: '公司资源',
  isActive: true,
  payouts: [{ role: '销售', payoutPlanId: percent8Plan.id, commissionType: 'percentage', commissionValue: 10 }],
});
assert.notEqual(duplicateRes.code, 0);

const updateRes = await (commissionRuleApi as any).updateSimpleCommissionRuleGroup(createRes.data.id, {
  name: '新代理-公司资源-调整',
  orderType: '新代理',
  resourceOwnership: '公司资源',
  isActive: true,
  payouts: [{ role: '销售', payoutPlanId: fixed100Plan.id, commissionType: 'fixed', commissionValue: 100 }],
});
assert.equal(updateRes.code, 0);
assert.deepEqual(updateRes.data.payouts.map((p: any) => p.role), ['销售']);
assert.equal(storedRules().length, 1);
assert.equal(storedRules()[0].commissionType, 'fixed');
assert.equal(storedRules()[0].commissionValue, 100);

const calcRes = await commissionRuleApi.calculateCommissionsForOrder({
  id: 'order-1',
  orderNo: 'ORD-1',
  customerId: 'cust-1',
  customerName: '客户A',
  productLevel: '代理',
  orderType: '新代理',
  amount: 9800,
  actualAmount: 9800,
  paymentMethod: '对公转账',
  status: '已确认',
  refundStatus: '无',
  owner: 'Sales A',
  resourceOwnership: '公司资源',
  payments: [],
  createdAt: now,
  updatedAt: now,
} as Order);
assert.equal(calcRes.code, 0);
assert.equal(calcRes.data.length, 1);
assert.equal(calcRes.data[0].role, '销售');
assert.equal(calcRes.data[0].commissionAmount, 100);

const deleteRes = await (commissionRuleApi as any).deleteSimpleCommissionRuleGroup(createRes.data.id);
assert.equal(deleteRes.code, 0);
assert.deepEqual(storedRules(), []);

const tieredGroupRes = await (commissionRuleApi as any).createSimpleCommissionRuleGroup({
  name: '新代理公司资源-销售阶梯',
  orderType: '新代理',
  resourceOwnership: '公司资源',
  isActive: true,
  payouts: [{
    role: '销售',
    payoutPlanId: tieredPlan.id,
    commissionType: 'tiered_percentage',
    commissionValue: 0,
  }],
});
assert.equal(tieredGroupRes.code, 0);
assert.equal(tieredGroupRes.data.payouts[0].commissionType, 'tiered_percentage');
assert.equal(tieredGroupRes.data.payouts[0].tiers?.length, 3);

const tieredRule = storedRules()[0];
assert.equal(tieredRule.commissionType, 'tiered_percentage');
assert.equal(tieredRule.tiers?.length, 3);

seedOrders([
  buildOrder({
    id: 'order-existing-1',
    orderNo: 'ORD-EXISTING-1',
    actualAmount: 20000,
    salesId: 'sales-a',
    salesName: 'Sales A',
    createdAt: '2026-06-05T10:00:00.000Z',
  }),
  buildOrder({
    id: 'order-current',
    orderNo: 'ORD-CURRENT',
    actualAmount: 10000,
    salesId: 'sales-a',
    salesName: 'Sales A',
    createdAt: '2026-06-19T08:00:00.000Z',
  }),
  buildOrder({
    id: 'order-other-sales',
    orderNo: 'ORD-OTHER-SALES',
    actualAmount: 50000,
    salesId: 'sales-b',
    salesName: 'Sales B',
    createdAt: '2026-06-06T10:00:00.000Z',
  }),
  buildOrder({
    id: 'order-other-month',
    orderNo: 'ORD-OTHER-MONTH',
    actualAmount: 50000,
    salesId: 'sales-a',
    salesName: 'Sales A',
    createdAt: '2026-05-06T10:00:00.000Z',
  }),
]);

const tieredCalcRes = await commissionRuleApi.calculateCommissionsForOrder(buildOrder({
  id: 'order-current',
  orderNo: 'ORD-CURRENT',
  actualAmount: 10000,
  salesId: 'sales-a',
  salesName: 'Sales A',
  createdAt: '2026-06-19T08:00:00.000Z',
}));
assert.equal(tieredCalcRes.code, 0);
assert.equal(tieredCalcRes.data.length, 1);
assert.equal(tieredCalcRes.data[0].commissionType, 'tiered_percentage');
assert.equal(tieredCalcRes.data[0].commissionValue, 0);
assert.equal(tieredCalcRes.data[0].commissionRate, 0);
assert.equal(tieredCalcRes.data[0].commissionAmount, 0);
assert.match(tieredCalcRes.data[0].formulaText || '', /月度提成/);

seedOrders([
  buildOrder({
    id: 'order-existing-2',
    orderNo: 'ORD-EXISTING-2',
    actualAmount: 45000,
    salesId: 'sales-a',
    salesName: 'Sales A',
    createdAt: '2026-06-05T10:00:00.000Z',
  }),
]);

const highTierCalcRes = await commissionRuleApi.calculateCommissionsForOrder(buildOrder({
  id: 'order-high-tier',
  orderNo: 'ORD-HIGH-TIER',
  actualAmount: 5000,
  salesId: 'sales-a',
  salesName: 'Sales A',
  createdAt: '2026-06-20T08:00:00.000Z',
}));
assert.equal(highTierCalcRes.code, 0);
assert.equal(highTierCalcRes.data[0].commissionValue, 0);
assert.equal(highTierCalcRes.data[0].commissionAmount, 0);
