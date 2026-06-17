import type { AIQuerySession, AIQueryMessage, AIResultData, AIQueryScenario } from '../types/ai';
import type { ApiResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';

function ensureInit(): void {
  initializeMockData();
}

function getBaseUrl(): string {
  return (import.meta.env.VITE_AI_API_BASE || '/api').replace(/\/$/, '');
}

async function queryProxy(query: string): Promise<{ content: string; results?: AIResultData[] } | null> {
  try {
    const response = await fetch(`${getBaseUrl()}/ai/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.data || null;
  } catch {
    return null;
  }
}

/** 规则引擎 — 关键词匹配 */
function matchScenario(query: string): AIQueryScenario {
  const q = query.toLowerCase();
  if (/销售|营收|收入|营业额|成交额|金额/.test(q)) return 'sales_data';
  if (/退款|退单|退货|取消订单/.test(q)) return 'refund_reason';
  if (/排名|排行|top|销量|谁.*高|最好/.test(q)) return 'sales_ranking';
  if (/转化|转化率|成交率|签约率/.test(q)) return 'conversion_rate';
  if (/高潜力|潜力客户|升级|升单|推荐/.test(q)) return 'high_potential';
  return 'general';
}

/** 生成 AI 结果 */
function generateResults(query: string, scenario: AIQueryScenario): AIResultData[] {
  const results: AIResultData[] = [];

  switch (scenario) {
    case 'sales_data': {
      results.push({
        type: 'TEXT',
        title: '销售数据概览',
        content: '根据近期数据分析，本月销售总额为 ¥2,450,000，较上月增长 12.3%。其中899产品占比35%，代理产品占比28%，贴牌产品占比22%，合伙人产品占比15%。',
      });
      results.push({
        type: 'CHART',
        title: '月度销售趋势',
        content: '近6个月销售趋势',
        chartData: [
          { month: '1月', revenue: 1800000 },
          { month: '2月', revenue: 1950000 },
          { month: '3月', revenue: 2100000 },
          { month: '4月', revenue: 2200000 },
          { month: '5月', revenue: 2180000 },
          { month: '6月', revenue: 2450000 },
        ],
      });
      break;
    }
    case 'refund_reason': {
      results.push({
        type: 'TABLE',
        title: '退款原因分析',
        content: '近30天退款情况分析',
        tableHeaders: [
          { key: 'reason', label: '退款原因' },
          { key: 'count', label: '退款数量' },
          { key: 'amount', label: '退款金额' },
          { key: 'ratio', label: '占比' },
        ],
        tableRows: [
          { reason: '产品功能不满足需求', count: 3, amount: '¥269,700', ratio: '45%' },
          { reason: '预算调整', count: 2, amount: '¥179,800', ratio: '30%' },
          { reason: '服务响应不及时', count: 1, amount: '¥89,900', ratio: '15%' },
          { reason: '其他', count: 1, amount: '¥89,900', ratio: '10%' },
        ],
      });
      results.push({
        type: 'SUGGESTION',
        title: '改进建议',
        content: '基于退款原因分析',
        suggestions: [
          '加强售前需求确认环节，减少功能不匹配',
          '建立快速响应机制，提升服务时效',
          '推出分期付款方案，降低预算门槛',
          '定期客户回访，提前发现潜在问题',
        ],
      });
      break;
    }
    case 'sales_ranking': {
      results.push({
        type: 'TABLE',
        title: '销售排名',
        content: '本月销售人员业绩排名',
        tableHeaders: [
          { key: 'rank', label: '排名' },
          { key: 'name', label: '销售人员' },
          { key: 'orderCount', label: '订单数' },
          { key: 'amount', label: '销售金额' },
        ],
        tableRows: [
          { rank: 1, name: '张伟', orderCount: 12, amount: '¥1,250,000' },
          { rank: 2, name: '李娜', orderCount: 10, amount: '¥980,000' },
          { rank: 3, name: '王磊', orderCount: 8, amount: '¥850,000' },
          { rank: 4, name: '赵敏', orderCount: 7, amount: '¥720,000' },
        ],
      });
      break;
    }
    case 'conversion_rate': {
      results.push({
        type: 'CHART',
        title: '转化漏斗',
        content: '线索到成交的转化率分析',
        chartData: [
          { stage: '线索', count: 120 },
          { stage: '899客户', count: 45 },
          { stage: '代理客户', count: 18 },
          { stage: '贴牌客户', count: 8 },
          { stage: '合伙人', count: 3 },
        ],
      });
      results.push({
        type: 'TEXT',
        title: '转化率分析',
        content: '整体线索转化率为 37.5%，其中线索→899转化率37.5%，899→代理转化率40%，代理→贴牌转化率44.4%，贴牌→合伙人转化率37.5%。建议重点关注899到代理的升级转化。',
      });
      break;
    }
    case 'high_potential': {
      results.push({
        type: 'TABLE',
        title: '高潜力客户推荐',
        content: '基于AI分析的升级潜力客户',
        tableHeaders: [
          { key: 'name', label: '客户名称' },
          { key: 'currentLevel', label: '当前等级' },
          { key: 'potential', label: '升级潜力' },
          { key: 'satisfaction', label: '满意度' },
          { key: 'suggestion', label: '建议行动' },
        ],
        tableRows: [
          { name: '北京云端科技', currentLevel: '899', potential: '高', satisfaction: '85', suggestion: '推进代理升级' },
          { name: '福州博远信息', currentLevel: '899', potential: '高', satisfaction: '82', suggestion: '提供代理案例' },
          { name: '昆明春城软件', currentLevel: '贴牌', potential: '高', satisfaction: '85', suggestion: '合伙人方案' },
          { name: '海口椰城科技', currentLevel: '代理', potential: '高', satisfaction: '83', suggestion: '展示贴牌价值' },
        ],
      });
      results.push({
        type: 'SUGGESTION',
        title: '升级策略建议',
        content: '基于客户行为分析',
        suggestions: [
          '优先联系高满意度+高潜力的899客户，推进代理升级',
          '对贴牌客户展示合伙人模式的战略价值',
          '为代理客户准备贴牌案例和ROI分析',
          '建立升级激励计划，降低客户决策门槛',
        ],
      });
      break;
    }
    default: {
      results.push({
        type: 'TEXT',
        title: '分析结果',
        content: `基于您的问题"${query}"，我分析了当前系统数据。当前系统共有30条线索、25个客户、40个订单，本月营收约245万元。建议您可以使用更具体的问题获取详细分析，例如："本月销售数据"、"退款原因分析"、"销售排名"等。`,
      });
      results.push({
        type: 'SUGGESTION',
        title: '推荐查询',
        content: '您还可以尝试以下查询',
        suggestions: [
          '本月销售数据概览',
          '退款原因分析',
          '销售人员排名',
          '高潜力客户推荐',
          '线索转化率分析',
        ],
      });
      break;
    }
  }

  return results;
}

/** 发送 AI 查询 */
async function sendQuery(sessionId: string | null, query: string): Promise<ApiResponse<AIQueryMessage>> {
  ensureInit();
  await delay(600);

  const sessions = getStorageData<AIQuerySession[]>(STORAGE_KEYS.AI_SESSIONS) || [];
  const scenario = matchScenario(query);
  const proxyResult = await queryProxy(query);
  const results = proxyResult?.results?.length ? proxyResult.results : generateResults(query, scenario);

  const userMessage: AIQueryMessage = {
    id: uuidv4(),
    role: 'user',
    content: query,
    createdAt: new Date().toISOString(),
  };

  const assistantMessage: AIQueryMessage = {
    id: uuidv4(),
    role: 'assistant',
    content: proxyResult?.content || (scenario === 'general'
      ? `根据您的问题"${query}"，我为您分析了相关数据。`
      : `关于"${query}"的分析结果如下：`),
    results,
    createdAt: new Date().toISOString(),
  };

  if (sessionId) {
    const session = sessions.find((s) => s.id === sessionId);
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    sessions.unshift(newSession);
    setStorageData(STORAGE_KEYS.AI_SESSIONS, sessions);
    sessionId = newSession.id;
  }

  return createSuccessResponse(assistantMessage);
}

/** 获取会话列表 */
async function fetchSessions(): Promise<ApiResponse<AIQuerySession[]>> {
  ensureInit();
  await delay(150);
  const sessions = getStorageData<AIQuerySession[]>(STORAGE_KEYS.AI_SESSIONS) || [];
  return createSuccessResponse(sessions);
}

/** 获取会话详情 */
async function fetchSessionById(id: string): Promise<ApiResponse<AIQuerySession | null>> {
  ensureInit();
  await delay(150);
  const sessions = getStorageData<AIQuerySession[]>(STORAGE_KEYS.AI_SESSIONS) || [];
  return createSuccessResponse(sessions.find((s) => s.id === id) || null);
}

/** 删除会话 */
async function deleteSession(id: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(150);
  const sessions = getStorageData<AIQuerySession[]>(STORAGE_KEYS.AI_SESSIONS) || [];
  setStorageData(STORAGE_KEYS.AI_SESSIONS, sessions.filter((s) => s.id !== id));
  return createSuccessResponse(true);
}

export const aiApi = {
  sendQuery,
  fetchSessions,
  fetchSessionById,
  deleteSession,
};
