import type {
  AIAssistantInsight,
  AIAssistantMetric,
  AIAssistantTask,
  AIAssistantWorkbench,
  AIQueryMessage,
  AIQueryScenario,
  AIQuerySession,
  AIResultData,
} from '../types/ai';
import type { Lead } from '../types/lead';
import type { Customer } from '../types/customer';
import type { Order, OrderApplication } from '../types/order';
import type { Refund } from '../types/refund';
import type { Commission } from '../types/commission';
import type { UpgradeOpportunity } from '../types/upgrade';
import type { ApiResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { ROUTES, STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import {
  filterVisibleCustomers,
  filterVisibleLeads,
  filterVisibleOrders,
  getCurrentDataVisibilityScope,
} from '../shared/utils/dataVisibility';
import { formatCurrency } from '../shared/utils/formatters';
import { v4 as uuidv4 } from 'uuid';

interface AssistantData {
  leads: Lead[];
  customers: Customer[];
  orders: Order[];
  applications: OrderApplication[];
  refunds: Refund[];
  commissions: Commission[];
  opportunities: UpgradeOpportunity[];
}

function ensureInit(): void {
  initializeMockData();
}

function readArray<T>(key: string): T[] {
  return getStorageData<T[]>(key) || [];
}

function lower(value: string): string {
  return String(value || '').toLowerCase();
}

function includesAny(value: string | undefined, words: string[]): boolean {
  const text = String(value || '');
  return words.some((word) => text.includes(word));
}

function getPaymentDate(order: Order): string {
  return order.payments?.[0]?.paidAt || order.createdAt;
}

function currentMonth(value?: string): boolean {
  if (!value) return false;
  const now = new Date();
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function scopeLabel(): string {
  const scope = getCurrentDataVisibilityScope();
  if (scope.unrestricted) return '全公司数据';
  if (scope.visibleUserNames.length > 1) return '本部门数据';
  return scope.currentUser?.name ? `${scope.currentUser.name}的数据` : '我的数据';
}

function filterApplications(applications: OrderApplication[]): OrderApplication[] {
  const scope = getCurrentDataVisibilityScope();
  if (scope.unrestricted) return applications;
  return applications.filter((item) => (
    scope.visibleUserNames.includes(item.applicantName)
    || scope.visibleUserIds.includes(item.applicantId || '')
  ));
}

function filterRefunds(refunds: Refund[]): Refund[] {
  const scope = getCurrentDataVisibilityScope();
  if (scope.unrestricted) return refunds;
  return refunds.filter((item) => (
    scope.visibleUserNames.includes(item.applicantName)
    || scope.visibleUserNames.includes(item.recoveryTask?.assignedToName || '')
    || scope.visibleUserIds.includes(item.applicantId)
    || scope.visibleUserIds.includes(item.recoveryTask?.assignedToUserId || '')
  ));
}

function filterCommissions(commissions: Commission[]): Commission[] {
  const scope = getCurrentDataVisibilityScope();
  if (scope.unrestricted) return commissions;
  return commissions.filter((item) => (
    scope.visibleUserNames.includes(item.owner)
    || scope.visibleUserIds.includes(item.ownerId || '')
  ));
}

function filterOpportunities(opportunities: UpgradeOpportunity[]): UpgradeOpportunity[] {
  const scope = getCurrentDataVisibilityScope();
  if (scope.unrestricted) return opportunities;
  return opportunities.filter((item) => scope.visibleUserNames.includes(item.ownerName));
}

function getAssistantData(): AssistantData {
  return {
    leads: filterVisibleLeads(readArray<Lead>(STORAGE_KEYS.LEADS)),
    customers: filterVisibleCustomers(readArray<Customer>(STORAGE_KEYS.CUSTOMERS)),
    orders: filterVisibleOrders(readArray<Order>(STORAGE_KEYS.ORDERS)),
    applications: filterApplications(readArray<OrderApplication>(STORAGE_KEYS.ORDER_APPLICATIONS)),
    refunds: filterRefunds(readArray<Refund>(STORAGE_KEYS.REFUNDS)),
    commissions: filterCommissions(readArray<Commission>(STORAGE_KEYS.COMMISSIONS)),
    opportunities: filterOpportunities(readArray<UpgradeOpportunity>(STORAGE_KEYS.UPGRADE_POOL)),
  };
}

function sumOrders(orders: Order[]): number {
  return orders.reduce((sum, order) => sum + (order.actualAmount || order.amount || 0), 0);
}

function sumRefunds(refunds: Refund[]): number {
  return refunds.reduce((sum, refund) => sum + (refund.refundAmount || 0), 0);
}

function pendingLeads(leads: Lead[]): Lead[] {
  return leads.filter((lead) => (
    includesAny(lead.lifecycleStatusCode, ['pending', '待'])
    || includesAny(lead.lifecycleStatus, ['待跟进'])
    || includesAny(lead.status, ['新线索'])
  ));
}

function pendingApplications(applications: OrderApplication[]): OrderApplication[] {
  return applications.filter((item) => includesAny(item.status, ['待', '审核']));
}

function returnedApplications(applications: OrderApplication[]): OrderApplication[] {
  return applications.filter((item) => includesAny(item.status, ['退回']));
}

function activeRefunds(refunds: Refund[]): Refund[] {
  return refunds.filter((refund) => !includesAny(refund.status, ['已完成', '已拒绝', '无']));
}

function pendingCommissions(commissions: Commission[]): Commission[] {
  return commissions.filter((item) => (
    includesAny(item.status, ['待确认'])
    || item.owner === '待分配'
    || !item.ownerId
  ));
}

function pendingPayoutCommissions(commissions: Commission[]): Commission[] {
  return commissions.filter((item) => includesAny(item.status, ['待发放']));
}

function exceptionCommissions(commissions: Commission[]): Commission[] {
  return commissions.filter((item) => (
    Boolean(item.frozenReason)
    || includesAny(item.status, ['取消'])
    || includesAny(item.owner, ['待分配'])
  ));
}

function activeOpportunities(opportunities: UpgradeOpportunity[]): UpgradeOpportunity[] {
  return opportunities.filter((item) => !includesAny(item.status, ['已转化', '已流失']));
}

function rankByName<T>(items: T[], getName: (item: T) => string | undefined, getAmount: (item: T) => number): Array<{ name: string; count: number; amount: number }> {
  const map = new Map<string, { name: string; count: number; amount: number }>();
  items.forEach((item) => {
    const name = getName(item) || '未填写';
    const current = map.get(name) || { name, count: 0, amount: 0 };
    current.count += 1;
    current.amount += getAmount(item);
    map.set(name, current);
  });
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount || b.count - a.count);
}

function makeMetric(id: string, label: string, value: string, tone: AIAssistantMetric['tone'], subValue?: string): AIAssistantMetric {
  return { id, label, value, tone, subValue };
}

function makeTask(task: AIAssistantTask): AIAssistantTask {
  return task;
}

function buildWorkbench(data: AssistantData): AIAssistantWorkbench {
  const monthOrders = data.orders.filter((order) => currentMonth(getPaymentDate(order)));
  const monthAmount = sumOrders(monthOrders);
  const pendingLeadRows = pendingLeads(data.leads);
  const pendingReviewRows = pendingApplications(data.applications);
  const returnedRows = returnedApplications(data.applications);
  const activeRefundRows = activeRefunds(data.refunds);
  const pendingCommissionRows = pendingCommissions(data.commissions);
  const pendingPayoutRows = pendingPayoutCommissions(data.commissions);
  const opportunityRows = activeOpportunities(data.opportunities);
  const highOpportunityRows = opportunityRows.filter((item) => item.probability >= 80);
  const taskCount = pendingLeadRows.length
    + pendingReviewRows.length
    + returnedRows.length
    + activeRefundRows.length
    + pendingCommissionRows.length
    + highOpportunityRows.length;

  const insights: AIAssistantInsight[] = [];
  if (pendingReviewRows.length > 0) {
    insights.push({
      id: 'review-backlog',
      title: '订单审核需要优先清理',
      content: `当前有 ${pendingReviewRows.length} 个订单申请等待处理，审核通过后才会进入正式订单和分账链路。`,
      tone: 'warning',
      path: `${ROUTES.ORDERS}?tab=review`,
    });
  }
  if (pendingCommissionRows.length > 0) {
    insights.push({
      id: 'commission-backlog',
      title: '分账存在待确认或待分配',
      content: `当前有 ${pendingCommissionRows.length} 条分账需要财务确认，建议先处理待分配人员和异常分账。`,
      tone: 'error',
      path: ROUTES.COMMISSION,
    });
  }
  if (activeRefundRows.length > 0) {
    insights.push({
      id: 'refund-risk',
      title: '退款付款仍在流转',
      content: `当前有 ${activeRefundRows.length} 条退款或挽回任务未闭环，涉及金额 ${formatCurrency(sumRefunds(activeRefundRows))}。`,
      tone: 'error',
      path: `${ROUTES.FINANCE}?tab=refund`,
    });
  }
  if (highOpportunityRows.length > 0) {
    insights.push({
      id: 'upgrade-chance',
      title: '高概率升单机会值得推进',
      content: `AI 识别出 ${highOpportunityRows.length} 个 80% 以上概率的升单机会，适合今天安排客户成功跟进。`,
      tone: 'success',
      path: ROUTES.UPGRADE_CENTER,
    });
  }
  if (insights.length === 0) {
    insights.push({
      id: 'healthy',
      title: '当前运营链路较顺',
      content: '未发现明显堆积任务，可以重点看销售排行和升单机会，继续放大有效动作。',
      tone: 'success',
      path: ROUTES.DASHBOARD,
    });
  }

  return {
    scopeLabel: scopeLabel(),
    generatedAt: new Date().toISOString(),
    metrics: [
      makeMetric('month-amount', '本月成交金额', formatCurrency(monthAmount), 'primary', `${monthOrders.length} 个正式订单`),
      makeMetric('visible-customers', '可见客户', String(data.customers.length), 'success', `${data.leads.length} 条可见线索`),
      makeMetric('pending-tasks', '待处理任务', String(taskCount), taskCount > 0 ? 'warning' : 'success', '来自线索、订单、退款、分账、升单'),
      makeMetric('refund-risk', '退款风险金额', formatCurrency(sumRefunds(activeRefundRows)), activeRefundRows.length > 0 ? 'error' : 'neutral', `${activeRefundRows.length} 条未闭环`),
    ],
    tasks: [
      makeTask({
        id: 'pending-leads',
        title: '待跟进线索',
        description: '销售还没有领取或开始跟进的线索，容易变冷。',
        count: pendingLeadRows.length,
        priority: pendingLeadRows.length > 0 ? 'medium' : 'low',
        module: '线索',
        path: ROUTES.LEADS,
        actionLabel: '去看线索',
      }),
      makeTask({
        id: 'order-review',
        title: '订单审核入库',
        description: '销售提交后等待财务审核，未入库前不会生成正式订单和提成。',
        count: pendingReviewRows.length,
        priority: pendingReviewRows.length > 0 ? 'high' : 'low',
        module: '订单',
        path: `${ROUTES.ORDERS}?tab=review`,
        actionLabel: '处理审核',
      }),
      makeTask({
        id: 'returned-orders',
        title: '退回订单修改',
        description: '销售需要补充资料后重新提交，避免成交卡在申请阶段。',
        count: returnedRows.length,
        priority: returnedRows.length > 0 ? 'high' : 'low',
        module: '订单',
        path: `${ROUTES.ORDERS}?tab=review`,
        actionLabel: '查看退回',
      }),
      makeTask({
        id: 'commission',
        title: '分账确认',
        description: '财务需要确认分账人员、金额和异常，确认后才能进入月度发放。',
        count: pendingCommissionRows.length,
        priority: pendingCommissionRows.length > 0 ? 'high' : 'low',
        module: '财务结算',
        path: ROUTES.COMMISSION,
        actionLabel: '处理分账',
      }),
      makeTask({
        id: 'payout',
        title: '月度待发放',
        description: '已确认但还没发放的提成，需要按人员汇总处理。',
        count: pendingPayoutRows.length,
        priority: pendingPayoutRows.length > 0 ? 'medium' : 'low',
        module: '财务结算',
        path: `${ROUTES.FINANCE}?tab=payout`,
        actionLabel: '查看发放',
      }),
      makeTask({
        id: 'refund',
        title: '退款付款/挽回',
        description: '退款未闭环会影响收入、客户状态和提成异常。',
        count: activeRefundRows.length,
        priority: activeRefundRows.length > 0 ? 'high' : 'low',
        module: '财务中心',
        path: `${ROUTES.FINANCE}?tab=refund`,
        actionLabel: '处理退款',
      }),
      makeTask({
        id: 'upgrade',
        title: '高概率升单',
        description: '80% 以上概率机会适合安排客户成功或销售推进。',
        count: highOpportunityRows.length,
        priority: highOpportunityRows.length > 0 ? 'medium' : 'low',
        module: '升单中心',
        path: ROUTES.UPGRADE_CENTER,
        actionLabel: '推进升单',
      }),
    ].sort((a, b) => {
      const score = { high: 3, medium: 2, low: 1 };
      return score[b.priority] - score[a.priority] || b.count - a.count;
    }),
    insights,
    promptTemplates: [
      { id: 'daily', category: '运营', label: '今天优先处理什么？', prompt: '帮我看一下今天最应该优先处理的运营任务，并按影响程度排序' },
      { id: 'sales', category: '销售', label: '本月销售情况', prompt: '分析本月销售成交金额、订单数、销售排行和主要增长点' },
      { id: 'review', category: '订单', label: '订单审核风险', prompt: '帮我分析当前订单审核台有什么积压和风险' },
      { id: 'commission', category: '财务', label: '分账待处理', prompt: '检查财务结算台有哪些待确认、待分配和待发放问题' },
      { id: 'refund', category: '退款', label: '退款原因分析', prompt: '分析当前退款付款和退款挽回情况，告诉我主要原因和建议动作' },
      { id: 'upgrade', category: '升单', label: '升单机会推荐', prompt: '帮我找出最值得推进的高概率升单客户，并给出跟进建议' },
      { id: 'conversion', category: '经营', label: '转化漏斗', prompt: '分析线索到客户、订单、入库和分账确认的转化漏斗' },
    ],
  };
}

function matchScenario(query: string): AIQueryScenario {
  const q = lower(query);
  if (/今天|待办|优先|任务|处理/.test(q)) return 'daily_tasks';
  if (/审核|入库|订单申请|退回|驳回/.test(q)) return 'order_review';
  if (/分账|提成|结算|发放|待分配|财务结算/.test(q)) return 'finance_settlement';
  if (/退款|挽回|退款付款|退费/.test(q)) return 'refund_reason';
  if (/排行|排名|top|谁.*高|业绩/.test(q)) return 'sales_ranking';
  if (/转化|漏斗|转化率|链路/.test(q)) return 'conversion_rate';
  if (/升单|机会|潜力|客户成功|推荐/.test(q)) return 'high_potential';
  if (/销售|营收|收入|成交|订单|金额/.test(q)) return 'sales_data';
  return 'general';
}

function resultMetrics(data: AssistantData): AIResultData {
  const monthOrders = data.orders.filter((order) => currentMonth(getPaymentDate(order)));
  return {
    type: 'METRIC',
    title: '核心指标',
    content: '基于当前可见范围自动汇总。',
    metrics: [
      makeMetric('orders', '正式订单', String(data.orders.length), 'primary', `本月 ${monthOrders.length} 单`),
      makeMetric('amount', '本月成交', formatCurrency(sumOrders(monthOrders)), 'success'),
      makeMetric('refund', '退款金额', formatCurrency(sumRefunds(data.refunds)), sumRefunds(data.refunds) > 0 ? 'error' : 'neutral'),
      makeMetric('commission', '待处理分账', String(pendingCommissions(data.commissions).length), pendingCommissions(data.commissions).length > 0 ? 'warning' : 'success'),
    ],
  };
}

function buildDailyTaskResults(workbench: AIAssistantWorkbench): AIResultData[] {
  const importantTasks = workbench.tasks.filter((task) => task.count > 0).slice(0, 5);
  return [
    {
      type: 'TEXT',
      title: '今日处理顺序',
      content: importantTasks.length
        ? `建议先处理 ${importantTasks[0].title}，它当前数量最高或影响链路最靠前。`
        : '当前没有明显积压任务，可以优先看升单机会和销售排行。',
    },
    {
      type: 'TABLE',
      title: '待办任务清单',
      content: '按优先级和数量排序。',
      tableHeaders: [
        { key: 'module', label: '模块' },
        { key: 'title', label: '任务' },
        { key: 'count', label: '数量' },
        { key: 'priority', label: '优先级' },
      ],
      tableRows: workbench.tasks.map((task) => ({
        module: task.module,
        title: task.title,
        count: task.count,
        priority: task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低',
      })),
      actions: importantTasks.slice(0, 3).map((task) => ({ label: task.actionLabel, path: task.path, variant: 'outlined' })),
    },
  ];
}

function buildSalesResults(data: AssistantData): AIResultData[] {
  const monthOrders = data.orders.filter((order) => currentMonth(getPaymentDate(order)));
  const productRows = rankByName(monthOrders, (order) => order.productLevel, (order) => order.actualAmount || order.amount || 0).slice(0, 6);
  return [
    resultMetrics(data),
    {
      type: 'CHART',
      title: '本月产品成交分布',
      content: '按订单产品/业务类型聚合成交金额。',
      chartData: productRows.map((item) => ({ name: item.name, amount: item.amount, count: item.count })),
      actions: [{ label: '查看订单列表', path: ROUTES.ORDERS, variant: 'outlined' }],
    },
  ];
}

function buildRefundResults(data: AssistantData): AIResultData[] {
  const rows = rankByName(data.refunds, (refund) => refund.refundCategory || refund.refundReason || refund.status, (refund) => refund.refundAmount || 0).slice(0, 8);
  return [
    {
      type: 'TABLE',
      title: '退款原因和金额',
      content: `当前可见退款 ${data.refunds.length} 条，未闭环 ${activeRefunds(data.refunds).length} 条。`,
      tableHeaders: [
        { key: 'reason', label: '原因/分类' },
        { key: 'count', label: '数量' },
        { key: 'amount', label: '金额' },
      ],
      tableRows: rows.map((item) => ({ reason: item.name, count: item.count, amount: formatCurrency(item.amount) })),
      actions: [{ label: '进入退款付款', path: `${ROUTES.FINANCE}?tab=refund`, variant: 'contained' }],
    },
    {
      type: 'SUGGESTION',
      title: '处理建议',
      content: '退款任务建议按金额和状态优先处理。',
      suggestions: [
        '先处理已批准但未付款的退款，避免财务状态不一致。',
        '挽回中任务需要明确下一次跟进时间和责任人。',
        '已发放提成后发生退款的订单，要进入异常分账处理，不自动扣回。',
      ],
    },
  ];
}

function buildRankingResults(data: AssistantData): AIResultData[] {
  const rows = rankByName(data.orders, (order) => order.salesName || order.owner, (order) => order.actualAmount || order.amount || 0).slice(0, 8);
  return [{
    type: 'TABLE',
    title: '销售业绩排行',
    content: '按正式订单成交金额排序。',
    tableHeaders: [
      { key: 'rank', label: '排名' },
      { key: 'name', label: '销售负责人' },
      { key: 'count', label: '订单数' },
      { key: 'amount', label: '成交金额' },
    ],
    tableRows: rows.map((item, index) => ({
      rank: index + 1,
      name: item.name,
      count: item.count,
      amount: formatCurrency(item.amount),
    })),
    actions: [{ label: '查看驾驶舱', path: ROUTES.DASHBOARD, variant: 'outlined' }],
  }];
}

function buildConversionResults(data: AssistantData): AIResultData[] {
  const confirmedCommissions = data.commissions.filter((item) => includesAny(item.status, ['待发放', '已发放']));
  return [
    {
      type: 'CHART',
      title: '经营链路漏斗',
      content: '从线索到正式订单，再到分账确认的核心链路。',
      chartData: [
        { stage: '线索', count: data.leads.length },
        { stage: '客户', count: data.customers.length },
        { stage: '订单申请', count: data.applications.length },
        { stage: '正式订单', count: data.orders.length },
        { stage: '分账确认', count: confirmedCommissions.length },
      ],
      actions: [{ label: '查看驾驶舱', path: ROUTES.DASHBOARD, variant: 'outlined' }],
    },
    {
      type: 'TEXT',
      title: '漏斗判断',
      content: data.applications.length > data.orders.length
        ? '订单申请多于正式订单，说明财务审核入库是当前需要关注的节点。'
        : '正式订单链路相对顺畅，接下来更应该关注分账确认、退款和升单机会。',
    },
  ];
}

function buildUpgradeResults(data: AssistantData): AIResultData[] {
  const rows = activeOpportunities(data.opportunities)
    .sort((a, b) => b.probability - a.probability || b.estimatedAmount - a.estimatedAmount)
    .slice(0, 8);
  return [
    {
      type: 'TABLE',
      title: '高概率升单机会',
      content: '按 AI 概率和预计金额排序。',
      tableHeaders: [
        { key: 'customerName', label: '客户' },
        { key: 'targetProduct', label: '目标产品' },
        { key: 'probability', label: '概率' },
        { key: 'amount', label: '预计金额' },
        { key: 'owner', label: '负责人' },
      ],
      tableRows: rows.map((item) => ({
        customerName: item.customerName,
        targetProduct: item.targetProduct,
        probability: `${item.probability}%`,
        amount: formatCurrency(item.estimatedAmount),
        owner: item.ownerName,
      })),
      actions: [{ label: '进入升单中心', path: ROUTES.UPGRADE_CENTER, variant: 'contained' }],
    },
    {
      type: 'SUGGESTION',
      title: '推进建议',
      content: '高概率机会适合拆成具体行动。',
      suggestions: [
        '80% 以上机会今天安排销售或客户成功明确下一步。',
        '预计金额高但跟进次数少的客户，优先补一次价值沟通。',
        '已流失机会不要继续堆在池子里，转为复盘任务。',
      ],
    },
  ];
}

function buildCommissionResults(data: AssistantData): AIResultData[] {
  const statusRows = rankByName(data.commissions, (commission) => commission.status, (commission) => commission.commissionAmount || 0);
  const needAssign = data.commissions.filter((item) => item.owner === '待分配' || !item.ownerId);
  return [
    {
      type: 'TABLE',
      title: '分账状态分布',
      content: `当前待分配 ${needAssign.length} 条，待发放 ${pendingPayoutCommissions(data.commissions).length} 条。`,
      tableHeaders: [
        { key: 'status', label: '状态' },
        { key: 'count', label: '数量' },
        { key: 'amount', label: '提成金额' },
      ],
      tableRows: statusRows.map((item) => ({
        status: item.name,
        count: item.count,
        amount: formatCurrency(item.amount),
      })),
      actions: [
        { label: '处理订单分账', path: ROUTES.COMMISSION, variant: 'contained' },
        { label: '查看月度发放', path: `${ROUTES.FINANCE}?tab=payout`, variant: 'outlined' },
      ],
    },
  ];
}

function buildOrderReviewResults(data: AssistantData): AIResultData[] {
  const rows = data.applications.slice(0, 8);
  return [
    {
      type: 'TABLE',
      title: '订单审核台概况',
      content: `待审核 ${pendingApplications(data.applications).length} 条，退回修改 ${returnedApplications(data.applications).length} 条。`,
      tableHeaders: [
        { key: 'applicationNo', label: '申请编号' },
        { key: 'customerName', label: '客户' },
        { key: 'status', label: '状态' },
        { key: 'applicantName', label: '提交人' },
      ],
      tableRows: rows.map((item) => ({
        applicationNo: item.applicationNo,
        customerName: item.orderData.customerName,
        status: item.status,
        applicantName: item.applicantName,
      })),
      actions: [{ label: '进入订单审核台', path: `${ROUTES.ORDERS}?tab=review`, variant: 'contained' }],
    },
  ];
}

function buildGeneralResults(data: AssistantData, workbench: AIAssistantWorkbench, query: string): AIResultData[] {
  return [
    {
      type: 'TEXT',
      title: '我能帮你看什么',
      content: `我已经按${scopeLabel()}读取了当前系统数据。你刚才问的是“${query}”，可以继续让我分析销售、订单审核、分账、退款、升单或转化漏斗。`,
    },
    resultMetrics(data),
    {
      type: 'ACTION',
      title: '推荐入口',
      content: '从当前任务看，下面几个入口最常用。',
      actions: workbench.tasks.filter((task) => task.count > 0).slice(0, 3).map((task) => ({
        label: task.actionLabel,
        path: task.path,
        variant: 'outlined',
      })),
    },
  ];
}

function generateResults(query: string, data: AssistantData, workbench: AIAssistantWorkbench, scenario: AIQueryScenario): AIResultData[] {
  switch (scenario) {
    case 'daily_tasks':
      return buildDailyTaskResults(workbench);
    case 'sales_data':
      return buildSalesResults(data);
    case 'refund_reason':
      return buildRefundResults(data);
    case 'sales_ranking':
      return buildRankingResults(data);
    case 'conversion_rate':
      return buildConversionResults(data);
    case 'high_potential':
      return buildUpgradeResults(data);
    case 'finance_settlement':
      return buildCommissionResults(data);
    case 'order_review':
      return buildOrderReviewResults(data);
    default:
      return buildGeneralResults(data, workbench, query);
  }
}

function assistantContent(scenario: AIQueryScenario, query: string): string {
  if (scenario === 'general') return `我先按当前系统数据给你一个运营视角。`;
  return `关于“${query}”，我按当前系统数据做了结构化分析。`;
}

async function fetchAssistantWorkbench(): Promise<ApiResponse<AIAssistantWorkbench>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(buildWorkbench(getAssistantData()));
}

async function sendQuery(sessionId: string | null, query: string): Promise<ApiResponse<AIQueryMessage>> {
  ensureInit();
  await delay(350);

  const sessions = getStorageData<AIQuerySession[]>(STORAGE_KEYS.AI_SESSIONS) || [];
  const data = getAssistantData();
  const workbench = buildWorkbench(data);
  const scenario = matchScenario(query);
  const results = generateResults(query, data, workbench, scenario);
  const now = new Date().toISOString();

  const userMessage: AIQueryMessage = {
    id: uuidv4(),
    role: 'user',
    content: query,
    createdAt: now,
  };

  const assistantMessage: AIQueryMessage = {
    id: uuidv4(),
    role: 'assistant',
    content: assistantContent(scenario, query),
    results,
    createdAt: new Date().toISOString(),
  };

  if (sessionId) {
    const session = sessions.find((item) => item.id === sessionId);
    if (session) {
      session.messages.push(userMessage, assistantMessage);
      session.updatedAt = new Date().toISOString();
      setStorageData(STORAGE_KEYS.AI_SESSIONS, sessions);
    }
  } else {
    const newSession: AIQuerySession = {
      id: uuidv4(),
      title: query.slice(0, 20) + (query.length > 20 ? '...' : ''),
      messages: [userMessage, assistantMessage],
      createdAt: now,
      updatedAt: now,
    };
    sessions.unshift(newSession);
    setStorageData(STORAGE_KEYS.AI_SESSIONS, sessions);
  }

  return createSuccessResponse(assistantMessage);
}

async function fetchSessions(): Promise<ApiResponse<AIQuerySession[]>> {
  ensureInit();
  await delay(120);
  const sessions = getStorageData<AIQuerySession[]>(STORAGE_KEYS.AI_SESSIONS) || [];
  return createSuccessResponse(sessions);
}

async function fetchSessionById(id: string): Promise<ApiResponse<AIQuerySession | null>> {
  ensureInit();
  await delay(120);
  const sessions = getStorageData<AIQuerySession[]>(STORAGE_KEYS.AI_SESSIONS) || [];
  return createSuccessResponse(sessions.find((session) => session.id === id) || null);
}

async function deleteSession(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(120);
  const sessions = getStorageData<AIQuerySession[]>(STORAGE_KEYS.AI_SESSIONS) || [];
  setStorageData(STORAGE_KEYS.AI_SESSIONS, sessions.filter((session) => session.id !== id));
  return createSuccessResponse(true);
}

export const aiApi = {
  fetchAssistantWorkbench,
  sendQuery,
  fetchSessions,
  fetchSessionById,
  deleteSession,
};
