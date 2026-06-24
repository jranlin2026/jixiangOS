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
  const product = input.industry?.includes('教育') ? '29800贴牌方案' : input.company ? '9800代理方案' : '899智能体体验课';
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
    externalSummary: `暂未获得 DeepSeek 联网情报，已基于系统内资料生成 ${summaryTarget} 的客户情报码片。建议销售先确认客户业务规模、当前获客渠道、AI应用预算和决策链路。`,
    publicFacts: [
      input.company ? `系统内记录公司：${input.company}` : '系统内暂未记录公司名称',
      input.city ? `系统内记录城市：${input.city}` : '系统内暂未记录城市',
      input.industry ? `系统内记录行业：${input.industry}` : '系统内暂未记录行业',
    ],
    demandInsights: [
      input.industry ? `${input.industry}客户通常会关注获客效率、交付稳定性和案例背书。` : '行业信息不足，首轮沟通应先补齐业务场景。',
      input.company ? '客户具备组织型采购可能，建议确认决策人、预算周期和当前替代方案。' : '缺少企业主体信息，建议先确认公司/门店/个人IP定位。',
    ],
    matchedProducts: [product, 'AI运营实战课'],
    talkTracks: [
      '微信开场：我看您这边可能在关注AI获客或企业运营效率，想先了解下您现在主要卡在获客、转化还是交付？',
      '电话开场：您好，我是极享OS这边，想快速确认一下您现在做AI工具/运营系统，是想自己用，还是做客户交付？',
      `产品切入：如果您现在需要快速验证，可以先从${product}切入，再根据业务规模升级。`,
      '下一步：建议约一次15分钟演示，把客户当前业务流程和可落地的AI场景对齐。',
    ],
    riskAlerts: [
      '当前为本地兜底判断，缺少公开网页证据。',
      input.phone ? '可电话触达，但仍建议补齐微信、公司和来源备注。' : '缺少电话，触达稳定性较弱。',
    ],
    sources: [
      { title: '系统内客户/线索资料', url: `local://${input.subjectType}/${input.subjectId}`, summary: '来自当前CRM本地数据' },
    ],
    searchQueries: [],
    confidence: 0.35,
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
  return createSuccessResponse(normalized, normalized.isFallback ? '已生成本地兜底AI名片' : '已生成AI联网情报名片');
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
