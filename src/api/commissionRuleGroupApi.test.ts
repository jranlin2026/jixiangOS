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
    { role: '销售', commissionType: 'percentage', commissionValue: 8 },
    { role: '线索', commissionType: 'percentage', commissionValue: 3 },
    { role: '客户成功', commissionType: 'fixed', commissionValue: 50 },
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
  payouts: [{ role: '销售', commissionType: 'percentage', commissionValue: 10 }],
});
assert.notEqual(duplicateRes.code, 0);

const updateRes = await (commissionRuleApi as any).updateSimpleCommissionRuleGroup(createRes.data.id, {
  name: '新代理-公司资源-调整',
  orderType: '新代理',
  resourceOwnership: '公司资源',
  isActive: true,
  payouts: [{ role: '销售', commissionType: 'fixed', commissionValue: 100 }],
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
