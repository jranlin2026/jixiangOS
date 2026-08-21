import type {
  Customer,
  CustomerActivityRecord,
  CustomerOpportunityStageCode,
} from '../../types/customer';
import type { CustomerTodo } from '../../types/customerTodo';

export type CustomerBattleRiskLevel = 'low' | 'medium' | 'high';

export const CUSTOMER_OPPORTUNITY_STAGES: ReadonlyArray<{
  code: CustomerOpportunityStageCode;
  label: string;
}> = [
  { code: 'not_set', label: '待判断' },
  { code: 'needs_discovery', label: '需求确认' },
  { code: 'solution_demo', label: '方案演示' },
  { code: 'proposal', label: '方案报价' },
  { code: 'objection', label: '异议处理' },
  { code: 'payment_pending', label: '待付款' },
  { code: 'won', label: '已成交' },
  { code: 'lost', label: '已流失' },
];

export function getOpportunityStage(code: unknown) {
  return CUSTOMER_OPPORTUNITY_STAGES.find((item) => item.code === code)
    || CUSTOMER_OPPORTUNITY_STAGES[0];
}

const validTime = (value: unknown) => {
  const time = new Date(String(value || '')).getTime();
  return Number.isFinite(time) ? time : null;
};

export function getLastEffectiveCustomerContact(customer: Customer): CustomerActivityRecord | null {
  return (customer.activityRecords || [])
    .filter((record) => record.type === 'follow' && validTime(record.createdAt) !== null)
    .sort((left, right) => validTime(right.createdAt)! - validTime(left.createdAt)!)[0] || null;
}

export function getNextCustomerAction(todos: ReadonlyArray<CustomerTodo>): CustomerTodo | null {
  return todos
    .filter((todo) => todo.status === 'pending' && validTime(todo.dueAt) !== null)
    .sort((left, right) => validTime(left.dueAt)! - validTime(right.dueAt)!)[0] || null;
}

export function buildCustomerBattleSnapshot(
  customer: Customer,
  todos: ReadonlyArray<CustomerTodo> = [],
  now = new Date(),
) {
  const nowTime = now.getTime();
  const lastEffectiveContact = getLastEffectiveCustomerContact(customer);
  const contactTime = lastEffectiveContact ? validTime(lastEffectiveContact.createdAt) : null;
  const contactGapDays = contactTime === null
    ? null
    : Math.max(0, Math.floor((nowTime - contactTime) / 86_400_000));
  const nextAction = getNextCustomerAction(todos) || (
    customer.nextActionTitle && customer.nextActionDueAt
      ? {
        id: `snapshot:${customer.id}`,
        customerId: customer.id,
        customerName: customer.name,
        title: customer.nextActionTitle,
        status: 'pending',
        dueAt: customer.nextActionDueAt,
        assigneeName: customer.nextActionAssigneeName || '',
      } as CustomerTodo
      : null
  );
  const nextActionTime = nextAction ? validTime(nextAction.dueAt) : null;
  const nextActionOverdue = nextActionTime !== null && nextActionTime < nowTime;

  let risk: { level: CustomerBattleRiskLevel; reason: string } = { level: 'low', reason: '推进正常' };
  if (nextActionOverdue) {
    risk = { level: 'high', reason: '下一步动作已逾期' };
  } else if (snapshotStageIsClosed(customer.opportunityStageCode)) {
    risk = { level: 'low', reason: customer.opportunityStageCode === 'won' ? '本轮机会已成交' : '本轮机会已结束' };
  } else if (!nextAction) {
    risk = { level: 'medium', reason: '尚未设置下一步动作' };
  } else if (!lastEffectiveContact) {
    risk = { level: 'medium', reason: '尚无有效联系记录' };
  }

  return {
    stage: getOpportunityStage(customer.opportunityStageCode),
    opportunityAmount: customer.opportunityAmount ?? null,
    lastEffectiveContact,
    contactGapDays,
    nextAction,
    nextActionOverdue,
    risk,
  };
}

function snapshotStageIsClosed(code: unknown): boolean {
  return code === 'won' || code === 'lost';
}
