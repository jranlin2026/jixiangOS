import type { AIBusinessCard, AIBusinessCardInput } from '../types/aiCard';
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

function buildFallbackCard(input: AIBusinessCardInput): AIBusinessCard {
  const product = input.industry === '教育' ? '29800贴牌' : input.company ? '9800代理' : '899智能体';
  const summaryTarget = input.company ? `${input.name} / ${input.company}` : input.name;
  return {
    id: `card-${uuidv4().slice(0, 8)}`,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    subjectName: input.name,
    company: input.company,
    phone: input.phone,
    email: input.email,
    wechat: input.wechat,
    industry: input.industry,
    city: input.city,
    externalSummary: `暂未连接到真实联网搜索，已基于系统内资料生成 ${summaryTarget} 的销售名片。建议销售先确认客户业务规模、当前获客渠道和AI应用预算。`,
    demandInsights: [
      input.industry ? `${input.industry}行业客户通常关注获客效率、交付稳定性和案例背书` : '客户行业信息不足，首轮沟通应优先补齐业务场景',
      input.company ? '客户具备组织型采购可能，可重点确认决策链和预算周期' : '当前缺少公司信息，建议先补充企业主体和岗位角色',
      ...(input.tags || []).slice(0, 1).map((tag) => `已有标签"${tag}"可作为破冰切入点`),
    ],
    matchedProducts: [product, 'AI运营实战课程'],
    talkTracks: [
      '先用客户当前业务场景开场，确认他们最想提升的是获客、转化还是交付效率',
      `结合${product}说明投入产出，并准备同类型客户案例`,
      '约定下一步动作：演示、方案、报价或内部决策人会议',
    ],
    riskAlerts: [
      input.phone ? '可直接电话触达，但仍需补齐微信/公司等二次触达信息' : '缺少电话，触达稳定性较弱',
      'AI推断结果需销售复核，不能替代客户真实需求确认',
    ],
    sources: [
      { title: '系统内客户/线索资料', url: `local://${input.subjectType}/${input.subjectId}`, summary: '来自当前CRM本地数据' },
    ],
    isFallback: true,
    generatedAt: new Date().toISOString(),
  };
}

async function callProxy(input: AIBusinessCardInput): Promise<AIBusinessCard | null> {
  try {
    const response = await fetch(`${getBaseUrl()}/ai/business-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.data || null;
  } catch {
    return null;
  }
}

async function generateCard(input: AIBusinessCardInput): Promise<ApiResponse<AIBusinessCard>> {
  ensureInit();
  await delay(200);
  const cards = getStorageData<AIBusinessCard[]>(STORAGE_KEYS.AI_CARDS) || [];
  const generated = await callProxy(input);
  const card = generated || buildFallbackCard(input);
  const normalized: AIBusinessCard = {
    ...card,
    id: card.id || `card-${uuidv4().slice(0, 8)}`,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    subjectName: input.name,
    generatedAt: card.generatedAt || new Date().toISOString(),
    isFallback: generated ? Boolean(card.isFallback) : true,
  };

  const nextCards = [normalized, ...cards.filter((item) => !(item.subjectType === input.subjectType && item.subjectId === input.subjectId))];
  setStorageData(STORAGE_KEYS.AI_CARDS, nextCards);
  return createSuccessResponse(normalized, normalized.isFallback ? '已生成本地兜底AI名片' : '已生成AI名片');
}

async function getCard(subjectType: AIBusinessCard['subjectType'], subjectId: string): Promise<ApiResponse<AIBusinessCard | null>> {
  ensureInit();
  await delay(100);
  const cards = getStorageData<AIBusinessCard[]>(STORAGE_KEYS.AI_CARDS) || [];
  return createSuccessResponse(cards.find((item) => item.subjectType === subjectType && item.subjectId === subjectId) || null);
}

export const aiCardApi = {
  generateCard,
  getCard,
};
