import assert from 'node:assert/strict';
import { commissionRuleApi } from './commissionRuleApi';
import { orderApi } from './orderApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { Commission, CommissionRule } from '../types/commission';

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

function seedStorage() {
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.ORDERS, '[]');
  storage.setItem(STORAGE_KEYS.COMMISSIONS, '[]');
  storage.setItem(STORAGE_KEYS.DELIVERIES, '[]');
  storage.setItem(STORAGE_KEYS.CUSTOMERS, '[]');
  storage.setItem(STORAGE_KEYS.COMMISSION_RULES, '[]');
}

function storedCommissions(): Commission[] {
  return JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as Commission[];
}

seedStorage();

assert.equal(typeof (commissionRuleApi as any).getCommissionRoleConfigs, 'function');
assert.equal(typeof (commissionRuleApi as any).createCommissionRoleConfig, 'function');
assert.equal(typeof (commissionRuleApi as any).updateCommissionRoleConfig, 'function');
assert.equal(typeof (commissionRuleApi as any).deleteCommissionRoleConfig, 'function');

const defaultRolesRes = await (commissionRuleApi as any).getCommissionRoleConfigs();
assert.equal(defaultRolesRes.code, 0);
assert.equal(defaultRolesRes.data.length, 6);
assert.deepEqual(defaultRolesRes.data.map((item: any) => item.name), ['销售', '线索', '客户成功', '售后', '招商主管', '销售主管']);
assert.equal(defaultRolesRes.data.find((item: any) => item.code === 'sales')?.personSource, 'sales_owner');
assert.equal(defaultRolesRes.data.find((item: any) => item.code === 'lead')?.personSource, 'lead_contributor');

const customRoleRes = await (commissionRuleApi as any).createCommissionRoleConfig({
  name: '渠道伙伴',
  code: 'channel_partner',
  personSource: 'manual',
  isActive: true,
  sortOrder: 99,
  description: '手动指定渠道分润人员',
});
assert.equal(customRoleRes.code, 0);
assert.equal(customRoleRes.data.name, '渠道伙伴');

const ruleGroupRes = await (commissionRuleApi as any).createSimpleCommissionRuleGroup({
  name: '代理-公司资源',
  orderType: '新代理',
  resourceOwnership: '公司资源',
  isActive: true,
  payouts: [
    { role: '销售', commissionType: 'fixed', commissionValue: 100 },
    { role: '线索', commissionType: 'fixed', commissionValue: 30 },
    { role: '客户成功', commissionType: 'fixed', commissionValue: 10 },
    { role: '售后', commissionType: 'fixed', commissionValue: 5 },
    { role: '招商主管', commissionType: 'fixed', commissionValue: 2 },
  ],
});
assert.equal(ruleGroupRes.code, 0);

const deleteUsedRes = await (commissionRuleApi as any).deleteCommissionRoleConfig('sales');
assert.notEqual(deleteUsedRes.code, 0);

const storedRules = JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSION_RULES) || '[]') as CommissionRule[];
assert.equal(storedRules.some((rule) => rule.role === '销售'), true);

const inactiveLeadRes = await (commissionRuleApi as any).updateCommissionRoleConfig('lead', { isActive: false });
assert.equal(inactiveLeadRes.code, 0);
const activeRolesRes = await (commissionRuleApi as any).getCommissionRoleConfigs({ isActive: true });
assert.equal(activeRolesRes.data.some((item: any) => item.name === '线索'), false);

const createOrderRes = await orderApi.createOrder({
  customerId: 'cust-1',
  customerName: '测试客户',
  productLevel: '代理',
  orderType: '新代理',
  amount: 9800,
  actualAmount: 9800,
  paymentMethod: '对公转账',
  officialPaymentChannel: '对公银行转账',
  status: '已确认',
  refundStatus: '无',
  owner: '张伟',
  salesName: '张伟',
  leadContributorName: '李娜',
  successName: '王芳',
  serviceName: '赵售后',
  resourceOwnership: '公司资源',
  payments: [],
});
assert.equal(createOrderRes.code, 0);

const commissions = storedCommissions();
const byRole = new Map(commissions.map((item) => [item.role, item.owner]));
assert.equal(byRole.get('销售'), '张伟');
assert.equal(byRole.get('线索'), '李娜');
assert.equal(byRole.get('客户成功'), '王芳');
assert.equal(byRole.get('售后'), '赵售后');
assert.equal(byRole.get('招商主管'), '待分配');

