import type { Customer } from '../../types/customer';
import type { CustomerTodo } from '../../types/customerTodo';
import { buildCustomerBattleSnapshot } from './customerBattleState';

export type CustomerManagementCategory = 'normal' | 'data_incomplete' | 'execution_exception' | 'business_risk';

const completenessFields: Array<{ label: string; present: (customer: Customer) => boolean }> = [
  { label: '客户名称', present: (customer) => Boolean(customer.name?.trim()) },
  { label: '公司', present: (customer) => Boolean(customer.company?.trim()) },
  { label: '手机', present: (customer) => Boolean(customer.phone?.trim()) },
  { label: '客户等级', present: (customer) => Boolean(customer.customerLevel) },
  { label: '意向产品', present: (customer) => Boolean(customer.intendedProduct?.trim() || customer.productLevel) },
  { label: '销售负责人', present: (customer) => Boolean(customer.ownerId || customer.owner?.trim()) },
  { label: '线索来源', present: (customer) => Boolean(customer.leadSource?.trim() || customer.sourceName?.trim()) },
];

export function getCustomerProfileCompleteness(customer: Customer) {
  const missingFields = completenessFields.filter((field) => !field.present(customer)).map((field) => field.label);
  const completedCount = completenessFields.length - missingFields.length;
  return {
    percentage: Math.round(completedCount / completenessFields.length * 100),
    completedCount,
    totalCount: completenessFields.length,
    missingFields,
  };
}

export function getCustomerManagementCategory(customer: Customer, todos: ReadonlyArray<CustomerTodo> = [], now = new Date()): {
  code: CustomerManagementCategory;
  label: string;
  reason: string;
} {
  const completeness = getCustomerProfileCompleteness(customer);
  const snapshot = buildCustomerBattleSnapshot(customer, todos, now);
  const isClosed = customer.opportunityStageCode === 'won' || customer.opportunityStageCode === 'lost';
  const businessRisk = !isClosed && (
    (customer.opportunityStageCode === 'payment_pending' && (snapshot.contactGapDays === null || snapshot.contactGapDays >= 1))
    || (['L4', 'L5'].includes(customer.customerLevel || '') && (snapshot.contactGapDays === null || snapshot.contactGapDays >= 2))
  );
  if (businessRisk) return { code: 'business_risk', label: '业务风险', reason: snapshot.risk.reason };
  if (!isClosed && (snapshot.nextActionOverdue || !snapshot.nextAction)) {
    return { code: 'execution_exception', label: '执行异常', reason: snapshot.nextActionOverdue ? '下一步动作已逾期' : '尚未设置下一步动作' };
  }
  if (completeness.percentage < 70) {
    return { code: 'data_incomplete', label: '资料不完整', reason: `还缺${completeness.missingFields.slice(0, 3).join('、')}` };
  }
  return { code: 'normal', label: '推进正常', reason: '当前未发现需要管理者介入的异常' };
}
