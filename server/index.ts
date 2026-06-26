import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getAllowedCorsOrigins, getApiListenHost, validateRuntimeConfig } from './config/runtime';
import { prisma, checkDatabaseConnection } from './db/client';
import { createRequireAuth, bearerToken } from './middleware/auth';
import { createLoginRateLimiter } from './middleware/loginRateLimit';
import { createAuthService } from './services/authService';
import { createAiConfigService } from './services/aiConfigService';
import { createSettingsService } from './services/settingsService';
import { createStorageService } from './services/storageService';
import { PERMISSION_KEYS } from '../src/shared/utils/permissions';
import {
  buildCustomerIntelPrompt,
  searchPublicCustomerIntel,
  type PublicSearchResult,
} from './services/publicCustomerIntelService';

dotenv.config();
validateRuntimeConfig();

const app = express();
const port = Number(process.env.AI_PROXY_PORT || 3001);
const host = getApiListenHost();
const allowedCorsOrigins = getAllowedCorsOrigins();
const authService = createAuthService(prisma);
const aiConfigService = createAiConfigService(prisma as any);
const settingsService = createSettingsService(prisma);
const storageService = createStorageService(prisma);
const requireOrganizationAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS);
const requireRoleAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_ROLES);
const requireAiConfigAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_AI_CONFIG);
const requireDataMaintenanceAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE);
const requireAiChatAccess = createRequireAuth(authService, PERMISSION_KEYS.AI_CHAT);
const requireCustomerAiCardAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_AI_CARD);
const loginRateLimiter = createLoginRateLimiter();

app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedCorsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function jsonFromText<T>(text: string): T | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const raw = fenced?.[1] || trimmed;
  try {
    return JSON.parse(raw) as T;
  } catch {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(raw.slice(first, last + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callDeepSeek(messages: DeepSeekMessage[], options: { temperature?: number } = {}): Promise<string> {
  const config = await aiConfigService.getRuntimeConfig();
  if (!config.enabled) throw new Error('DeepSeek AI is disabled');
  if (!config.apiKey) throw new Error('DeepSeek API Key is not configured');

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options.temperature ?? 0.2,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `DeepSeek request failed with HTTP ${response.status}`);
  }
  return String(payload?.choices?.[0]?.message?.content || '');
}

async function healthPayload() {
  const database = await checkDatabaseConnection();
  const aiConfig = database
    ? await aiConfigService.getPublicConfig()
    : { data: null };
  return {
    ok: database,
    database,
    aiProvider: aiConfig.data?.provider,
    hasAIKey: Boolean(aiConfig.data?.hasApiKey),
    model: aiConfig.data?.model,
  };
}

app.get('/api/health', async (_req, res) => {
  const payload = await healthPayload();
  res.status(payload.database ? 200 : 503).json(payload);
});

app.get('/api/ready', async (_req, res) => {
  const payload = await healthPayload();
  res.status(payload.database ? 200 : 503).json(payload);
});

app.post('/api/auth/login', loginRateLimiter.guard, async (req, res) => {
  const result = await authService.login({
    account: String(req.body?.account || ''),
    password: String(req.body?.password || ''),
    remember: Boolean(req.body?.remember),
  });
  if (result.code === 0) {
    loginRateLimiter.reset(req);
  } else {
    loginRateLimiter.recordFailure(req);
  }
  res.status(result.code === 0 ? 200 : 401).json(result);
});

app.get('/api/auth/me', async (req, res) => {
  res.json(await authService.getCurrentUser(bearerToken(req)));
});

app.post('/api/auth/logout', async (req, res) => {
  res.json(await authService.logout(bearerToken(req)));
});

app.get('/api/settings/users', requireOrganizationAccess, async (_req, res) => {
  res.json(await settingsService.listUsers());
});

app.post('/api/settings/users/leave-customer-count', requireOrganizationAccess, async (req, res) => {
  const result = await settingsService.countLeaveOwnedCustomers(req.body?.userIds || []);
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.post('/api/settings/users', requireOrganizationAccess, async (req, res) => {
  const result = await settingsService.createUser(req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.put('/api/settings/users/:id', requireOrganizationAccess, async (req, res) => {
  const result = await settingsService.updateUser(routeParam(req.params.id), req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.post('/api/settings/users/:id/leave', requireOrganizationAccess, async (req, res) => {
  const result = await settingsService.leaveUser(routeParam(req.params.id), req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.post('/api/settings/users/:id/restore', requireOrganizationAccess, async (req, res) => {
  const result = await settingsService.restoreUser(routeParam(req.params.id));
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.delete('/api/settings/users/:id', requireOrganizationAccess, async (req, res) => {
  const result = await settingsService.deleteUser(routeParam(req.params.id));
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.post('/api/settings/users/:id/reset-password', requireOrganizationAccess, async (req, res) => {
  const result = await settingsService.resetUserPassword(routeParam(req.params.id), String(req.body?.password || ''));
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.get('/api/settings/roles', requireRoleAccess, async (_req, res) => {
  res.json(await settingsService.listRoles());
});

app.post('/api/settings/roles', requireRoleAccess, async (req, res) => {
  const result = await settingsService.createRole(req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.put('/api/settings/roles/:id', requireRoleAccess, async (req, res) => {
  const result = await settingsService.updateRole(routeParam(req.params.id), req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.delete('/api/settings/roles/:id', requireRoleAccess, async (req, res) => {
  const result = await settingsService.deleteRole(routeParam(req.params.id));
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.get('/api/settings/departments', requireOrganizationAccess, async (_req, res) => {
  res.json(await settingsService.listDepartments());
});

app.post('/api/settings/departments', requireOrganizationAccess, async (req, res) => {
  const result = await settingsService.createDepartment(req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.put('/api/settings/departments/:id', requireOrganizationAccess, async (req, res) => {
  const result = await settingsService.updateDepartment(routeParam(req.params.id), req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.delete('/api/settings/departments/:id', requireOrganizationAccess, async (req, res) => {
  const result = await settingsService.deleteDepartment(routeParam(req.params.id));
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.get('/api/settings/positions', requireOrganizationAccess, async (_req, res) => {
  res.json(await settingsService.listPositions());
});

app.get('/api/ai/config', requireAiConfigAccess, async (_req, res) => {
  res.json(await aiConfigService.getPublicConfig());
});

app.put('/api/ai/config', requireAiConfigAccess, async (req, res) => {
  const result = await aiConfigService.saveConfig(req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.post('/api/ai/config/test', requireAiConfigAccess, async (_req, res) => {
  try {
    const text = await callDeepSeek([
      { role: 'system', content: '你是极享OS的AI连接测试助手，只返回一句简短中文。' },
      { role: 'user', content: '请回复：DeepSeek连接正常' },
    ], { temperature: 0 });
    res.json({ code: 0, data: { ok: true, response: text || 'DeepSeek连接正常' }, message: 'success' });
  } catch (error) {
    res.status(500).json({ code: -1, data: null, message: error instanceof Error ? error.message : 'DeepSeek request failed' });
  }
});

app.get('/api/storage', requireDataMaintenanceAccess, async (_req, res) => {
  res.json(await storageService.list());
});

app.get('/api/storage/:key', requireDataMaintenanceAccess, async (req, res) => {
  const result = await storageService.get(routeParam(req.params.key));
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.put('/api/storage/:key', requireDataMaintenanceAccess, async (req, res) => {
  const result = await storageService.set(routeParam(req.params.key), req.body?.value);
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.delete('/api/storage/:key', requireDataMaintenanceAccess, async (req, res) => {
  const result = await storageService.remove(routeParam(req.params.key));
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.delete('/api/storage', requireDataMaintenanceAccess, async (_req, res) => {
  res.json(await storageService.clearPrefix());
});

app.post('/api/ai/query', requireAiChatAccess, async (req, res) => {
  const query = String(req.body?.query || '').trim();
  const context = req.body?.context || null;
  if (!query) {
    res.status(400).json({ code: -1, message: 'query is required' });
    return;
  }

  try {
    const text = await callDeepSeek([
      {
        role: 'system',
        content: '你是极享OS的AI企业运营助手。你必须基于用户传入的极享OS业务数据摘要回答，不要编造系统里没有的数据。请用中文给出简洁结论和可执行建议，只返回严格 JSON，不要 Markdown。',
      },
      {
        role: 'user',
        content: `问题：${query}
当前极享OS业务数据摘要：
${JSON.stringify(context || {}, null, 2)}

请返回 JSON：
{
  "content": "直接回答用户问题的一段话",
  "results": [
    {"type":"TEXT","title":"关键结论","content":"基于数据的判断"},
    {"type":"SUGGESTION","title":"下一步动作","content":"说明","suggestions":["建议1","建议2"]}
  ]
}`,
      },
    ]);
    const parsed = jsonFromText<{ content: string; results: unknown[] }>(text);
    res.json({ code: 0, data: parsed || { content: text, results: [{ type: 'TEXT', title: 'AI 分析', content: text }] }, message: 'success' });
  } catch (error) {
    res.status(500).json({ code: -1, message: error instanceof Error ? error.message : 'DeepSeek request failed' });
  }
});

app.post('/api/ai/business-card', requireCustomerAiCardAccess, async (req, res) => {
  const input = req.body || {};
  if (!input.name || !input.subjectId || !input.subjectType) {
    res.status(400).json({ code: -1, message: 'name, subjectId and subjectType are required' });
    return;
  }

  try {
    const { queries, results } = await searchPublicCustomerIntel(input);
    const prompt = buildCustomerIntelPrompt(input, queries, results);
    const text = await callDeepSeek([
      {
        role: 'system',
        content: '你是极享OS的销售情报助手。只返回严格 JSON，不要 Markdown。必须区分公开事实和AI推断，不得编造隐私身份信息。',
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    const parsed = jsonFromText<any>(text) || {};
    const sourceResults = Array.isArray(parsed.sources) && parsed.sources.length
      ? parsed.sources
      : results.map((item: PublicSearchResult) => ({ title: item.title, url: item.url, summary: item.snippet }));
    res.json({
      code: 0,
      data: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        subjectName: input.name,
        company: input.company,
        phone: input.phone,
        email: input.email,
        wechat: input.wechat,
        industry: input.industry,
        city: input.city,
        externalSummary: parsed.externalSummary || text || '未获得有效外部信息摘要',
        publicFacts: Array.isArray(parsed.publicFacts) ? parsed.publicFacts : [],
        demandInsights: Array.isArray(parsed.demandInsights) ? parsed.demandInsights : [],
        matchedProducts: Array.isArray(parsed.matchedProducts) ? parsed.matchedProducts : [],
        talkTracks: Array.isArray(parsed.talkTracks) ? parsed.talkTracks : [],
        riskAlerts: Array.isArray(parsed.riskAlerts) ? parsed.riskAlerts : [],
        sources: sourceResults,
        searchQueries: queries,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : (results.length ? 0.62 : 0.42),
        isFallback: false,
        generatedAt: new Date().toISOString(),
      },
      message: 'success',
    });
  } catch (error) {
    res.status(500).json({ code: -1, message: error instanceof Error ? error.message : 'DeepSeek request failed' });
  }
});

app.post('/api/ai/business-card-legacy', requireCustomerAiCardAccess, async (req, res) => {
  const input = req.body || {};
  if (!input.name || !input.subjectId || !input.subjectType) {
    res.status(400).json({ code: -1, message: 'name, subjectId and subjectType are required' });
    return;
  }

  try {
    const text = await callDeepSeek([
      {
        role: 'system',
        content: '你是销售情报助手。只返回严格 JSON，不要 Markdown。外部信息不足时明确说明，并给出销售可用推断。',
      },
      {
        role: 'user',
        content: `请为销售生成AI客户名片。客户资料：${JSON.stringify(input)}。
返回 JSON 字段：
{
  "externalSummary": "外部信息摘要",
  "demandInsights": ["需求推断"],
  "matchedProducts": ["匹配产品"],
  "talkTracks": ["沟通话术"],
  "riskAlerts": ["风险提醒"],
  "sources": [{"title":"来源标题","url":"local://crm","summary":"摘要"}]
}`,
      },
    ]);

    const parsed = jsonFromText<any>(text) || {};
    res.json({
      code: 0,
      data: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        subjectName: input.name,
        company: input.company,
        phone: input.phone,
        email: input.email,
        wechat: input.wechat,
        industry: input.industry,
        city: input.city,
        externalSummary: parsed.externalSummary || text || '未获得外部摘要',
        demandInsights: Array.isArray(parsed.demandInsights) ? parsed.demandInsights : [],
        matchedProducts: Array.isArray(parsed.matchedProducts) ? parsed.matchedProducts : [],
        talkTracks: Array.isArray(parsed.talkTracks) ? parsed.talkTracks : [],
        riskAlerts: Array.isArray(parsed.riskAlerts) ? parsed.riskAlerts : [],
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
        isFallback: false,
        generatedAt: new Date().toISOString(),
      },
      message: 'success',
    });
  } catch (error) {
    res.status(500).json({ code: -1, message: error instanceof Error ? error.message : 'DeepSeek request failed' });
  }
});

app.listen(port, host, () => {
  console.log(`AI proxy listening on http://${host}:${port}`);
});
