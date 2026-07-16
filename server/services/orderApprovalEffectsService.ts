import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { COMMISSION_RULES as DEFAULT_COMMISSION_RULES, LIFECYCLE_STATUS_CODES, STORAGE_KEYS } from '../../src/shared/utils/constants';
import type {
  Commission,
  CommissionEvidenceType,
  CommissionRoleConfig,
  CommissionRule,
  OfficialPaymentChannel,
} from '../../src/types/commission';
import type { Customer } from '../../src/types/customer';
import type { Delivery } from '../../src/types/delivery';
import type { Order } from '../../src/types/order';
import type { Product } from '../../src/types/product';
import { resolveProductDeliveryStages } from '../../src/shared/utils/deliveryStages';
import type { ApplyOrderApprovalDownstreamEffects } from './orderApplicationService';

type JsonRow = { id: string; recordId: string; data: unknown; status?: string | null };
type DirectoryUser = { id: string; name: string; departmentId?: string | null; isActive?: boolean; employmentStatus?: string };
type DirectoryDepartment = { id: string; name: string; managerId?: string | null };

const DEFAULT_ROLE_DEPARTMENTS: Record<string, string> = {
  '销售': '销售部',
  '线索': '市场部',
  '客户成功': '客户成功部',
  '售后': '售后服务部',
  '招商主管': '招商部',
  '销售主管': '销售部',
};

function parseJson<T>(value: unknown, label: string): T {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (parsed === null || parsed === undefined) throw new Error('empty');
    return parsed as T;
  } catch {
    throw new Error(`${label}数据损坏`);
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function shortHash(value: string, length = 16): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function amount(value: unknown): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function paymentDate(order: Order): string {
  return order.payments?.[0]?.paidAt || order.createdAt;
}

function paymentChannel(order: Order): OfficialPaymentChannel {
  if (order.officialPaymentChannel) return order.officialPaymentChannel;
  if (order.paymentMethod === '微信支付') return '企业微信转账';
  if (order.paymentMethod === '支付宝') return '企业支付宝转账';
  if (order.paymentMethod === '银行转账' || order.paymentMethod === '对公转账') return '对公银行转账';
  return '非官方渠道';
}

function normalizeRule(rule: CommissionRule): CommissionRule {
  const requiresLeaderConfirm = rule.requiresLeaderConfirm ?? rule.orderType === '成交线索转代理';
  const evidenceTypes: CommissionEvidenceType[] = rule.evidenceTypes !== undefined
    ? rule.evidenceTypes
    : rule.settlementMode === '仅计业绩'
      ? []
      : ['付款截图', '成交路径截图'];
  return {
    scene: '',
    resourceOwnership: '',
    paymentChannels: [],
    excludeExternalTalent: true,
    performanceRate: 100,
    splitRatio: 100,
    collaboratorRole: '',
    requiresProof: evidenceTypes.length > 0,
    clawbackBaseCommission: false,
    settlementMode: '自动结算',
    description: '',
    ...rule,
    commissionValue: rule.commissionType === 'tiered_percentage' ? 0 : amount(rule.commissionValue),
    requiresLeaderConfirm,
    evidenceTypes,
  };
}

function ruleMatches(ruleInput: CommissionRule, order: Order): boolean {
  const rule = normalizeRule(ruleInput);
  const paid = amount(order.actualAmount ?? order.amount);
  const channel = paymentChannel(order);
  if (!rule.isActive) return false;
  if (rule.role === '线索' && !order.leadContributorId && !order.leadContributorName) return false;
  if (rule.excludeExternalTalent && order.isExternalTalentOrder) return false;
  if (channel === '非官方渠道') return false;
  if (rule.paymentChannels?.length && !rule.paymentChannels.includes(channel)) return false;
  if (rule.minAmount !== undefined && paid < rule.minAmount) return false;
  if (rule.maxAmount !== undefined && paid > rule.maxAmount) return false;
  const matches = (expected: string | undefined, actual: string | undefined) => !expected || expected === actual;
  return matches(rule.productLevel, order.productLevel)
    && matches(rule.orderType, order.orderType)
    && matches(rule.sourceType, order.sourceType)
    && matches(rule.scene || undefined, order.dealScene || order.orderType)
    && matches(rule.resourceOwnership || undefined, order.resourceOwnership);
}

function evidenceState(rule: CommissionRule, order: Order): Pick<Commission, 'evidenceRequired' | 'evidenceStatus' | 'proofStatus'> {
  const types = rule.evidenceTypes || [];
  const required = Boolean(rule.requiresProof || types.length || rule.requiresLeaderConfirm);
  const hasPayment = Boolean(order.payments?.some((item) => item.attachments?.length || item.voucherName || item.voucherPreview));
  const hasDeal = Boolean(order.dealEvidenceAttachments?.length || order.dealEvidenceName || order.dealEvidencePreview);
  let evidenceStatus: Commission['evidenceStatus'] = '无需凭证';
  if (types.includes('付款截图') && !hasPayment) evidenceStatus = '缺付款截图';
  else if (types.includes('成交路径截图') && !hasDeal) evidenceStatus = '缺成交路径截图';
  else if (types.includes('聊天记录截图') && !hasDeal) evidenceStatus = '缺聊天记录截图';
  else if (rule.requiresLeaderConfirm || types.includes('组长确认')) evidenceStatus = '需组长确认';
  else if (required) evidenceStatus = '已齐全';
  return {
    evidenceRequired: required,
    evidenceStatus,
    proofStatus: evidenceStatus === '已齐全' ? '已上传' : evidenceStatus === '无需凭证' ? '无需凭证' : '待补充',
  };
}

async function readStorageArray<T>(transaction: Prisma.TransactionClient, key: string): Promise<T[]> {
  const row = await transaction.appStorage.findUnique({ where: { key } });
  if (!row) return [];
  const value = parseJson<unknown>(row.value, key);
  return Array.isArray(value) ? value as T[] : [];
}

function activeUsers(rows: DirectoryUser[]): DirectoryUser[] {
  return rows.filter((user) => user.isActive !== false && (user.employmentStatus || 'active') === 'active');
}

function findUser(users: DirectoryUser[], id?: string, name?: string): DirectoryUser | undefined {
  if (id) return users.find((user) => user.id === id);
  if (!name) return undefined;
  const matchingUsers = users.filter((user) => user.name === name);
  return matchingUsers.length === 1 ? matchingUsers[0] : undefined;
}

function roleSource(configs: CommissionRoleConfig[], role: string): CommissionRoleConfig['personSource'] | undefined {
  return configs.find((config) => config.name === role && config.isActive)?.personSource;
}

function assigneeForRole(
  order: Order,
  role: string,
  configs: CommissionRoleConfig[],
  users: DirectoryUser[],
  departments: DirectoryDepartment[],
) {
  const source = roleSource(configs, role);
  let user: DirectoryUser | undefined;
  let fallbackName = '';
  if (source === 'sales_owner' || (!source && role === '销售')) {
    fallbackName = order.salesName || order.owner;
    user = findUser(users, order.salesId, fallbackName);
  } else if (source === 'lead_contributor' || (!source && role === '线索')) {
    fallbackName = order.leadContributorName || '';
    user = findUser(users, order.leadContributorId, fallbackName);
  } else if (source === 'customer_success' || (!source && role === '客户成功')) {
    fallbackName = order.successName || '';
    user = findUser(users, order.successId, fallbackName);
  } else if (source === 'after_sales' || (!source && role === '售后')) {
    fallbackName = order.serviceName || '';
    user = findUser(users, order.serviceId, fallbackName);
  } else if (!source && (role === '销售主管' || role === '招商主管')) {
    const sales = findUser(users, order.salesId, order.salesName || order.owner);
    const department = departments.find((item) => item.id === sales?.departmentId);
    user = findUser(users, department?.managerId || undefined);
  }
  const department = departments.find((item) => item.id === user?.departmentId);
  return {
    owner: user?.name || '待分配',
    ownerId: user?.id,
    department: department?.name || DEFAULT_ROLE_DEPARTMENTS[role] || '',
    departmentId: department?.id,
  };
}

async function applyCustomerProjection(transaction: Prisma.TransactionClient, order: Order, approvedAt: string): Promise<void> {
  await transaction.$queryRaw(Prisma.sql`
    SELECT id
    FROM business_records
    WHERE domain = ${STORAGE_KEYS.CUSTOMERS}
      AND recordId = ${order.customerId}
    LIMIT 1
    FOR UPDATE
  `);
  const row = await transaction.businessRecord.findUnique({
    where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: order.customerId } },
  });
  if (!row) throw new Error(`客户 ${order.customerId} 不存在，不能完成订单审核`);
  const customer = parseJson<Customer>(row.data, '客户');
  const orderRows = await transaction.businessRecord.findMany({
    where: { domain: STORAGE_KEYS.ORDERS, customerId: customer.id },
  });
  const orders = orderRows
    .map((item) => parseJson<Order>(item.data, '订单'))
    .filter((item) => !item.deletedAt && item.customerId === customer.id);
  const ordered = orders.some((item) => item.id === order.id) ? orders : [order, ...orders];
  const sorted = [...ordered].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const latest = sorted[0] || order;
  const growthPath = [...(customer.growthPath || [])];
  if (!growthPath.some((item) => item.orderId === order.id || item.orderNo === order.orderNo)) {
    growthPath.push({
      id: `milestone-${shortHash(order.id, 12)}`,
      date: paymentDate(order).slice(0, 10),
      title: `签约${order.productName || order.productLevel}`,
      description: `订单${order.orderNo}，实付${amount(order.actualAmount ?? order.amount)}元`,
      productLevel: order.productLevel,
      orderId: order.id,
      orderNo: order.orderNo,
    });
  }
  const activityRecords = [...(customer.activityRecords || [])];
  if (!activityRecords.some((item) => item.type === 'order' && item.relatedId === order.id)) {
    activityRecords.unshift({
      id: `act-${shortHash(order.id, 12)}`,
      type: 'order',
      title: `创建了订单 ${order.orderNo}`,
      content: `签约${order.productName || order.productLevel}，实付${amount(order.actualAmount ?? order.amount)}元`,
      operator: order.salesName || order.owner,
      relatedId: order.id,
      relatedType: 'order',
      createdAt: approvedAt,
    });
  }
  const updated: Customer = {
    ...customer,
    productLevel: latest.productLevel,
    orderCount: ordered.length,
    totalSpent: roundMoney(ordered.reduce((sum, item) => sum + amount(item.actualAmount ?? item.amount), 0)),
    lifecycleStatusCode: LIFECYCLE_STATUS_CODES.ORDERED,
    lifecycleStatusUpdatedAt: approvedAt,
    growthPath,
    activityRecords,
    updatedAt: approvedAt,
  };
  await transaction.businessRecord.update({
    where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: order.customerId } },
    data: {
      title: updated.name || updated.company || updated.id,
      status: updated.lifecycleStatusCode,
      owner: updated.owner || null,
      customerId: updated.id,
      amount: updated.totalSpent,
      eventAt: new Date(approvedAt),
      data: jsonValue(updated),
    },
  });
}

async function commissionRules(transaction: Prisma.TransactionClient): Promise<CommissionRule[]> {
  const row = await transaction.appStorage.findUnique({ where: { key: STORAGE_KEYS.COMMISSION_RULES } });
  if (!row) return (DEFAULT_COMMISSION_RULES as unknown as CommissionRule[]).map(normalizeRule);
  const stored = parseJson<unknown>(row.value, '提成规则');
  return Array.isArray(stored) ? (stored as CommissionRule[]).map(normalizeRule) : [];
}

async function createCommissionRecords(transaction: Prisma.TransactionClient, order: Order, approvedAt: string): Promise<void> {
  const [rules, roleConfigs, userRows, departmentRows] = await Promise.all([
    commissionRules(transaction),
    readStorageArray<CommissionRoleConfig>(transaction, STORAGE_KEYS.COMMISSION_ROLE_CONFIGS),
    transaction.user.findMany(),
    transaction.department.findMany(),
  ]);
  const users = activeUsers(userRows as unknown as DirectoryUser[]);
  const departments = departmentRows as unknown as DirectoryDepartment[];
  const matched = rules.filter((rule) => ruleMatches(rule, order)).sort((left, right) => left.priority - right.priority);
  const sourceRules: Array<CommissionRule | null> = matched.length ? matched : [null];

  for (const rule of sourceRules) {
    const role = rule?.role || '销售';
    const recordId = `commission-${shortHash(`${order.id}:${rule?.id || 'unmatched'}:${role}`)}`;
    const existing = await transaction.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSIONS, recordId } },
    });
    if (existing) continue;

    const baseAmount = roundMoney(amount(order.performanceBaseAmount ?? order.actualAmount ?? order.amount) * ((rule?.performanceRate ?? 100) / 100));
    const commissionAmount = !rule || rule.commissionType === 'tiered_percentage'
      ? 0
      : rule.commissionType === 'fixed'
        ? roundMoney(rule.commissionValue)
        : roundMoney(baseAmount * (rule.commissionValue / 100));
    const assignee = assigneeForRole(order, role, roleConfigs, users, departments);
    const evidence = rule ? evidenceState(rule, order) : {
      evidenceRequired: true,
      evidenceStatus: '已齐全' as const,
      proofStatus: '已上传' as const,
    };
    const commission: Commission = {
      id: recordId,
      orderId: order.id,
      orderNo: order.orderNo,
      customerName: order.customerName,
      productLevel: order.productLevel,
      orderAmount: amount(order.actualAmount ?? order.amount),
      commissionRate: rule?.commissionType === 'percentage' ? rule.commissionValue / 100 : 0,
      commissionAmount,
      performanceAmount: baseAmount,
      scene: order.dealScene,
      resourceOwnership: order.resourceOwnership,
      ...evidence,
      calculationNote: rule?.description || (rule ? '服务端按订单快照与提成规则计算' : '订单已入库，但当前规则未命中，需财务检查规则配置'),
      auditReason: rule ? (evidence.evidenceStatus === '已齐全' || evidence.evidenceStatus === '无需凭证' ? '新订单提成待财务审核' : evidence.evidenceStatus) : '规则未命中',
      formulaText: !rule
        ? '未匹配规则，暂不计算金额'
        : rule.commissionType === 'fixed'
          ? `固定提成 ${rule.commissionValue} 元`
          : rule.commissionType === 'tiered_percentage'
            ? '销售月累计阶梯提成，在员工提成月报按月度总实付计算'
            : `业绩金额 ${baseAmount} × ${rule.commissionValue}% = ${commissionAmount} 元`,
      payoutPlanId: rule?.payoutPlanId,
      payoutPlanName: rule?.payoutPlanName,
      ruleCalculationType: rule?.commissionType,
      tierSnapshot: rule?.commissionType === 'tiered_percentage' && rule.tiers?.length ? {
        tiers: rule.tiers,
        baseAmount,
        nextTier: rule.tiers[0],
        gapToNext: 0,
      } : undefined,
      role,
      ...assignee,
      paymentDate: paymentDate(order),
      status: '待确认',
      commissionRuleId: rule?.id,
      sourceType: '自动规则',
      sourceBusinessType: 'formal_order',
      createdAt: approvedAt,
      updatedAt: approvedAt,
    };
    await transaction.businessRecord.create({
      data: {
        id: `${STORAGE_KEYS.COMMISSIONS}:${recordId}`,
        domain: STORAGE_KEYS.COMMISSIONS,
        recordId,
        title: `${order.orderNo}-${role}`,
        status: commission.status,
        owner: commission.owner,
        customerId: order.customerId,
        orderId: order.id,
        amount: commission.commissionAmount,
        eventAt: new Date(approvedAt),
        data: jsonValue(commission),
      },
    });
  }

  if (order.originalOrderId && matched.some((rule) => rule.clawbackBaseCommission)) {
    const previous = await transaction.businessRecord.findMany({
      where: { domain: STORAGE_KEYS.COMMISSIONS, orderId: order.originalOrderId },
    });
    for (const row of previous) {
      const commission = parseJson<Commission>(row.data, '历史提成');
      if (commission.status === '已发放' || !['销售', '线索'].includes(commission.role)) continue;
      const updated: Commission = {
        ...commission,
        status: '已取消',
        auditReason: '成交线索转代理冲销原 899 基础提成',
        frozenReason: '成交线索转代理冲销原 899 基础提成',
        updatedAt: approvedAt,
      };
      await transaction.businessRecord.update({
        where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSIONS, recordId: row.recordId } },
        data: { status: updated.status, data: jsonValue(updated), eventAt: new Date(approvedAt) },
      });
    }
  }
}

type DeliveryAssigner = {
  assignNext(transaction: Prisma.TransactionClient, assignedAt: string): Promise<{
    ownerId: string; owner: string; assignmentMode: 'auto'; assignedAt: string; assignedBy: 'system';
  } | null | undefined>;
};

async function createDeliveryProjection(
  transaction: Prisma.TransactionClient,
  order: Order,
  approvedAt: string,
  assigner?: DeliveryAssigner,
): Promise<void> {
  let productRow = order.productId
    ? await transaction.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.PRODUCTS, recordId: order.productId } },
    })
    : null;
  if (!productRow) {
    const products = await transaction.businessRecord.findMany({ where: { domain: STORAGE_KEYS.PRODUCTS } });
    productRow = products.find((row) => {
      const product = parseJson<Product>(row.data, '产品');
      return product.level === order.productLevel && product.isActive;
    }) || null;
  }
  if (!productRow) throw new Error(`订单产品 ${order.productName || order.productLevel} 不存在，不能创建交付单`);
  const product = parseJson<Product>(productRow.data, '产品');

  const recordId = `delivery-${shortHash(order.id)}`;
  const existing = await transaction.businessRecord.findUnique({
    where: { domain_recordId: { domain: STORAGE_KEYS.DELIVERIES, recordId } },
  });
  if (existing) {
    order.deliveryId = recordId;
    await transaction.businessRecord.update({
      where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: order.id } },
      data: { data: jsonValue(order), eventAt: new Date(approvedAt) },
    });
    return;
  }
  const stages = resolveProductDeliveryStages(product);
  if (!stages.length) return;
  const automaticAssignment = assigner ? await assigner.assignNext(transaction, approvedAt) : undefined;
  const fallbackAssignment = automaticAssignment === undefined
    ? { owner: order.successName || order.serviceName || '待分配', ownerId: order.successId || order.serviceId }
    : automaticAssignment || { owner: '待分配', ownerId: undefined };
  const delivery: Delivery = {
    id: recordId,
    orderId: order.id,
    orderNo: order.orderNo,
    customerId: order.customerId,
    customerName: order.customerName,
    productName: order.productName,
    productType: order.productLevel,
    currentStage: stages[0],
    stages,
    tasks: stages.map((stage, index) => ({
      id: `task-${shortHash(`${order.id}:${index}`, 12)}`,
      title: stage,
      description: `${stage}任务`,
      status: index === 0 ? '进行中' : '待开始',
      records: [],
    })),
    ...fallbackAssignment,
    salesOwner: order.salesName || order.owner,
    salesOwnerId: order.salesId,
    orderAmount: amount(order.actualAmount ?? order.amount),
    paymentDate: paymentDate(order),
    orderType: order.orderType || order.dealScene,
    status: '待开始',
    priority: 'normal',
    progressPercent: 0,
    createdAt: approvedAt,
    updatedAt: approvedAt,
  };
  await transaction.businessRecord.create({
    data: {
      id: `${STORAGE_KEYS.DELIVERIES}:${recordId}`,
      domain: STORAGE_KEYS.DELIVERIES,
      recordId,
      title: `${order.orderNo}-${order.customerName}`,
      status: delivery.status || null,
      owner: delivery.owner,
      customerId: order.customerId,
      orderId: order.id,
      amount: delivery.orderAmount || null,
      eventAt: new Date(approvedAt),
      data: jsonValue(delivery),
    },
  });
  order.deliveryId = recordId;
  await transaction.businessRecord.update({
    where: { domain_recordId: { domain: STORAGE_KEYS.ORDERS, recordId: order.id } },
    data: { data: jsonValue(order), eventAt: new Date(approvedAt) },
  });
}

export function createOrderApprovalDownstreamEffects(assigner?: DeliveryAssigner): ApplyOrderApprovalDownstreamEffects {
  return async ({ transaction, order, approvedAt }) => {
    await applyCustomerProjection(transaction, order, approvedAt);
    await createCommissionRecords(transaction, order, approvedAt);
    await createDeliveryProjection(transaction, order, approvedAt, assigner);
    return {
      customerOrderStats: 'applied',
      commissionGeneration: 'applied',
      deliveryCreation: 'applied',
      customerLifecycle: 'applied',
    };
  };
}
