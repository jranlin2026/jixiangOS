import type {
  Opportunity,
  OpportunityFilters,
  OpportunityFollowUp,
  OpportunityStage,
} from '../types/opportunity';
import type { Lead } from '../types/lead';
import type { Order } from '../types/order';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { DEFAULT_PAGE_SIZE, LIFECYCLE_STATUS_CODES, PRODUCT_LIST, STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { syncLeadLifecycleByLeadId } from './lifecycleSync';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentOperatorName, SYSTEM_OPERATOR } from '../shared/utils/currentOperator';

function ensureInit(): void {
  initializeMockData();
  const existing = getStorageData<Opportunity[]>(STORAGE_KEYS.OPPORTUNITIES);
  if (existing && existing.length > 0) return;
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const now = new Date();
  const opportunities = leads
    .filter((lead) => ['已验证', '方案中', '谈判中', '已成交'].includes(lead.status))
    .slice(0, 14)
    .map((lead, index): Opportunity => {
      const stage: OpportunityStage = lead.status === '谈判中' ? '谈判签约' : lead.status === '方案中' ? '方案报价' : lead.status === '已成交' ? '赢单' : '需求确认';
      return {
        id: `opp-${uuidv4().slice(0, 8)}`,
        leadId: lead.id,
        leadName: lead.name,
        customerName: lead.name,
        company: lead.company,
        stage,
        status: stage === '赢单' ? '已转订单' : '进行中',
        lifecycleStatus: stage === '赢单' ? '已转订单' : '跟进中',
        estimatedAmount: lead.estimatedAmount || 8990 + index * 3000,
        expectedCloseDate: addDays(now, 7 + index).slice(0, 10),
        ownerName: lead.owner,
        probability: Math.round((lead.aiAnalysis?.upgradeProbability || 0.45 + index * 0.03) * 100),
        nextAction: stage === '谈判签约' ? '确认合同与付款节点' : '补齐需求并推进演示',
        productInterest: lead.estimatedProductId,
        followUps: lead.followUpRecords.slice(0, 2).map((record) => ({
          id: record.id,
          content: record.content,
          createdBy: record.createdBy,
          createdAt: record.createdAt,
        })),
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
      };
    });
  setStorageData(STORAGE_KEYS.OPPORTUNITIES, opportunities);
}

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function normalizeOpportunity(opportunity: Opportunity): Opportunity {
  if ((opportunity.status as string) === '赢单') {
    return { ...opportunity, status: '已转订单', lifecycleStatus: '已转订单' };
  }
  if (!opportunity.lifecycleStatus) {
    return {
      ...opportunity,
      lifecycleStatus: opportunity.status === '已转订单' ? '已转订单' : opportunity.status === '已退款' ? '已退款' : opportunity.status === '输单' ? '流失公海' : '跟进中',
    };
  }
  return opportunity;
}

async function getOpportunities(filters?: OpportunityFilters): Promise<ApiResponse<PaginatedResponse<Opportunity>>> {
  ensureInit();
  await delay(150);
  const raw = getStorageData<Opportunity[]>(STORAGE_KEYS.OPPORTUNITIES) || [];
  const normalized = raw.map(normalizeOpportunity);
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) setStorageData(STORAGE_KEYS.OPPORTUNITIES, normalized);
  let items = normalized;
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    items = items.filter((item) => item.customerName.toLowerCase().includes(q) || (item.company || '').toLowerCase().includes(q));
  }
  if (filters?.stage) items = items.filter((item) => item.stage === filters.stage);
  if (filters?.status) items = items.filter((item) => item.status === filters.status);
  if (filters?.ownerName) items = items.filter((item) => item.ownerName === filters.ownerName);
  items = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = items.length;
  return createSuccessResponse({ items: items.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
}

async function createFromLead(lead: Lead): Promise<ApiResponse<Opportunity>> {
  ensureInit();
  await delay(150);
  const opportunities = getStorageData<Opportunity[]>(STORAGE_KEYS.OPPORTUNITIES) || [];
  const now = new Date().toISOString();
  const opportunity: Opportunity = {
    id: `opp-${uuidv4().slice(0, 8)}`,
    leadId: lead.id,
    leadName: lead.name,
    customerName: lead.name,
    company: lead.company,
    stage: '初步沟通',
    status: '进行中',
    lifecycleStatus: '跟进中',
    estimatedAmount: lead.estimatedAmount || 8990,
    expectedCloseDate: addDays(new Date(), 14).slice(0, 10),
    ownerName: lead.owner,
    probability: Math.round((lead.aiAnalysis?.upgradeProbability || 0.45) * 100),
    nextAction: '确认需求、预算和决策人',
    productInterest: lead.estimatedProductId,
    followUps: [],
    createdAt: now,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.OPPORTUNITIES, [opportunity, ...opportunities]);
  syncLeadLifecycleByLeadId(lead.id, LIFECYCLE_STATUS_CODES.FOLLOWING, { opportunityId: opportunity.id });
  return createSuccessResponse(opportunity);
}

function createOrderFromOpportunity(opportunity: Opportunity, operator: string): { orderId: string; orderNo: string } {
  if (opportunity.orderId && opportunity.orderNo) return { orderId: opportunity.orderId, orderNo: opportunity.orderNo };
  const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
  const now = new Date().toISOString();
  const orderNo = `ORD-${now.slice(0, 7).replace('-', '')}-${String(orders.length + 1).padStart(4, '0')}`;
  const product = PRODUCT_LIST.find((item) => item.id === opportunity.productInterest || item.level === opportunity.productInterest)
    || PRODUCT_LIST.find((item) => item.price === opportunity.estimatedAmount);
  const order: Order = {
    id: `order-${uuidv4().slice(0, 8)}`,
    orderNo,
    customerId: opportunity.customerId || opportunity.leadId || `cust-${opportunity.id}`,
    customerName: opportunity.customerName,
    productLevel: product?.level || opportunity.productInterest || '899',
    productId: product?.id,
    orderType: '新购',
    amount: opportunity.estimatedAmount,
    actualAmount: opportunity.estimatedAmount,
    paymentMethod: '银行转账',
    status: '已确认',
    refundStatus: '无',
    owner: opportunity.ownerName,
    salesName: opportunity.ownerName,
    payments: [{
      id: `pay-${uuidv4().slice(0, 8)}`,
      amount: opportunity.estimatedAmount,
      paymentMethod: '银行转账',
      paidAt: now,
      remark: '由商机赢单自动生成',
    }],
    notes: `由商机 ${opportunity.id} 赢单自动生成`,
    createdAt: now,
    updatedAt: now,
    changeHistory: [{
      id: `hist-${uuidv4().slice(0, 8)}`,
      action: 'create',
      operator,
      changedAt: now,
      summary: '商机赢单自动生成订单',
    }],
  };
  setStorageData(STORAGE_KEYS.ORDERS, [order, ...orders]);
  return { orderId: order.id, orderNo: order.orderNo };
}

async function updateStage(id: string, stage: OpportunityStage, lostReason?: string): Promise<ApiResponse<Opportunity | null>> {
  ensureInit();
  await delay(100);
  const opportunities = getStorageData<Opportunity[]>(STORAGE_KEYS.OPPORTUNITIES) || [];
  const opportunity = opportunities.find((item) => item.id === id);
  if (!opportunity) return createSuccessResponse(null);
  const operator = getCurrentOperatorName(opportunity.ownerName);
  const orderLink = stage === '赢单' ? createOrderFromOpportunity(opportunity, operator) : undefined;
  if (stage === '赢单' || stage === '输单') {
    opportunity.archivedFromStage = opportunity.stage === '赢单' || opportunity.stage === '输单' ? '谈判签约' : opportunity.stage;
  } else {
    opportunity.archivedFromStage = undefined;
    opportunity.autoGeneratedOrderId = undefined;
  }
  opportunity.stage = stage;
  opportunity.status = stage === '赢单' ? '已转订单' : stage === '输单' ? '输单' : '进行中';
  opportunity.lostReason = stage === '输单' ? lostReason || opportunity.lostReason || '客户暂缓决策' : undefined;
  opportunity.orderId = orderLink?.orderId || opportunity.orderId;
  opportunity.orderNo = orderLink?.orderNo || opportunity.orderNo;
  opportunity.autoGeneratedOrderId = orderLink?.orderId || opportunity.autoGeneratedOrderId;
  opportunity.lifecycleStatus = stage === '赢单' ? '已转订单' : stage === '输单' ? '流失公海' : '跟进中';
  opportunity.updatedAt = new Date().toISOString();
  setStorageData(STORAGE_KEYS.OPPORTUNITIES, opportunities);
  syncLeadLifecycleByLeadId(opportunity.leadId, opportunity.lifecycleStatus, { opportunityId: opportunity.id, orderId: opportunity.orderId });
  return createSuccessResponse(opportunity);
}

async function reopenOpportunity(id: string): Promise<ApiResponse<Opportunity | null>> {
  ensureInit();
  await delay(100);
  const opportunities = getStorageData<Opportunity[]>(STORAGE_KEYS.OPPORTUNITIES) || [];
  const opportunity = opportunities.find((item) => item.id === id);
  if (!opportunity) return createSuccessResponse(null);

  const now = new Date().toISOString();
  const generatedOrderId = opportunity.autoGeneratedOrderId || opportunity.orderId;
  if (generatedOrderId) {
    const orders = getStorageData<Order[]>(STORAGE_KEYS.ORDERS) || [];
    const order = orders.find((item) => item.id === generatedOrderId);
    if (order && order.notes?.includes(opportunity.id)) {
      order.status = '已取消';
      order.updatedAt = now;
      order.changeHistory = [
        ...(order.changeHistory || []),
        {
          id: `hist-${uuidv4().slice(0, 8)}`,
          action: 'update',
          operator: getCurrentOperatorName(opportunity.ownerName),
          changedAt: now,
          summary: '商机状态撤回，自动生成订单已取消',
        },
      ];
      setStorageData(STORAGE_KEYS.ORDERS, orders);
    }
  }

  opportunity.stage = opportunity.archivedFromStage || '谈判签约';
  opportunity.status = '进行中';
  opportunity.lifecycleStatus = '跟进中';
  opportunity.lostReason = undefined;
  opportunity.orderId = undefined;
  opportunity.orderNo = undefined;
  opportunity.autoGeneratedOrderId = undefined;
  opportunity.archivedFromStage = undefined;
  opportunity.updatedAt = now;
  opportunity.followUps = [
    {
      id: uuidv4(),
      content: '撤回归档状态，恢复为进行中商机',
      createdBy: getCurrentOperatorName(SYSTEM_OPERATOR),
      createdAt: now,
    },
    ...opportunity.followUps,
  ];
  setStorageData(STORAGE_KEYS.OPPORTUNITIES, opportunities);
  syncLeadLifecycleByLeadId(opportunity.leadId, opportunity.lifecycleStatus, { opportunityId: opportunity.id });
  return createSuccessResponse(opportunity);
}

async function addFollowUp(id: string, content: string, createdBy = getCurrentOperatorName()): Promise<ApiResponse<Opportunity | null>> {
  ensureInit();
  await delay(100);
  const opportunities = getStorageData<Opportunity[]>(STORAGE_KEYS.OPPORTUNITIES) || [];
  const opportunity = opportunities.find((item) => item.id === id);
  if (!opportunity) return createSuccessResponse(null);
  const record: OpportunityFollowUp = { id: uuidv4(), content, createdBy, createdAt: new Date().toISOString() };
  opportunity.followUps.unshift(record);
  opportunity.updatedAt = record.createdAt;
  setStorageData(STORAGE_KEYS.OPPORTUNITIES, opportunities);
  return createSuccessResponse(opportunity);
}

export const opportunityApi = {
  getOpportunities,
  createFromLead,
  updateStage,
  reopenOpportunity,
  addFollowUp,
};
