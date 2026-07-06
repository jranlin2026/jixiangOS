import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllowedCorsOrigins, getApiJsonBodyLimit, getApiListenHost, validateRuntimeConfig } from './config/runtime';
import { prisma, checkDatabaseConnection } from './db/client';
import { createRequireAuth, bearerToken, type AuthenticatedRequest } from './middleware/auth';
import { createLoginRateLimiter } from './middleware/loginRateLimit';
import { createAuthService } from './services/authService';
import { createAiConfigService } from './services/aiConfigService';
import { createCustomerListService } from './services/customerListService';
import { createLeadListService } from './services/leadListService';
import { createSettingsService } from './services/settingsService';
import { createStorageService } from './services/storageService';
import {
  canReadStorageKey,
  canWriteStorageKey,
  filterAssetStorageData,
  filterSingleStorageKey,
  isAssetStorageKey,
} from './services/assetStorageAccess';
import { migrateDefaultRoleAccess } from './services/roleMigrationService';
import { mapPrismaRole, mapPrismaUser } from './db/prismaMappers';
import { mergeRoleWithDefaultAccess } from '../src/shared/utils/organizationConfig';
import { PERMISSION_KEYS, hasPermission } from '../src/shared/utils/permissions';
import { STORAGE_KEYS } from '../src/shared/utils/constants';
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
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(serverDir, '../uploads');
const allowedCorsOrigins = getAllowedCorsOrigins();
const authService = createAuthService(prisma);
const aiConfigService = createAiConfigService(prisma as any);
const customerListService = createCustomerListService(prisma);
const leadListService = createLeadListService(prisma);
const settingsService = createSettingsService(prisma);
const storageService = createStorageService(prisma);
const requireOrganizationAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS);
const requireRoleAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_ROLES);
const requireAiConfigAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_AI_CONFIG);
const requireDataMaintenanceAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE);
const requireStorageAccess = createRequireAuth(authService);
const requireMatrixPublishUploadAccess = createRequireAuth(authService, PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH, 'write');
const requireAiChatAccess = createRequireAuth(authService, PERMISSION_KEYS.AI_CHAT);
const requireCustomerAiCardAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_AI_CARD);
const assignableUsersPermissions = [
  PERMISSION_KEYS.LEADS_FLOW_CONFIG,
  PERMISSION_KEYS.CUSTOMER_ASSIGN,
  PERMISSION_KEYS.FINANCE_SETTLEMENT,
  PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT,
  PERMISSION_KEYS.FINANCE_PAYOUT,
  PERMISSION_KEYS.FINANCE_RULES,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW,
];
const runtimeStorageKeys = [
  STORAGE_KEYS.LEADS,
  STORAGE_KEYS.ORDERS,
  STORAGE_KEYS.ORDER_APPLICATIONS,
  STORAGE_KEYS.DELIVERIES,
  STORAGE_KEYS.COMMISSIONS,
  STORAGE_KEYS.COMMISSION_OPERATION_LOGS,
  STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES,
  STORAGE_KEYS.REFUNDS,
  STORAGE_KEYS.RECOVERY_ORDERS,
  STORAGE_KEYS.OPPORTUNITIES,
  STORAGE_KEYS.SERVICE_TICKETS,
  STORAGE_KEYS.AI_CARDS,
  STORAGE_KEYS.AI_SESSIONS,
  STORAGE_KEYS.PRODUCTS,
  STORAGE_KEYS.TAGS,
  STORAGE_KEYS.FINANCE,
  STORAGE_KEYS.USERS,
  STORAGE_KEYS.DEPARTMENTS,
  STORAGE_KEYS.POSITIONS,
  STORAGE_KEYS.ROLES,
  STORAGE_KEYS.ORGANIZATION_SCHEMA_VERSION,
  STORAGE_KEYS.ORGANIZATION_PROFILE,
  STORAGE_KEYS.PRODUCT_LEVELS,
  STORAGE_KEYS.CUSTOMER_LEVEL_CONFIGS,
  STORAGE_KEYS.ORDER_TYPE_CONFIGS,
  STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS,
  STORAGE_KEYS.LEAD_FLOW_CONFIG,
  STORAGE_KEYS.LEAD_INTAKE_RECORDS,
  STORAGE_KEYS.LEAD_SOURCE_CONFIGS,
  STORAGE_KEYS.COMMISSION_RULES,
  STORAGE_KEYS.COMMISSION_ROLE_CONFIGS,
  STORAGE_KEYS.MONTHLY_COMMISSION_TIER_CONFIGS,
  STORAGE_KEYS.ECOMMERCE_SETTLEMENT_RECORDS,
  STORAGE_KEYS.ECOMMERCE_SETTLEMENT_CONFIG,
  STORAGE_KEYS.INITIALIZED,
];
const requireAssignableUsersAccess = [
  createRequireAuth(authService),
  (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    const user = req.currentUser;
    if (!user || !assignableUsersPermissions.some((permission) => hasPermission(user, permission))) {
      res.status(403).json({ code: 403, data: null, message: 'Forbidden' });
      return;
    }
    next();
  },
];
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
app.use(express.json({ limit: getApiJsonBodyLimit() }));
app.use('/uploads', express.static(uploadRoot, { index: false }));

type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function queryParam(value: unknown): string {
  if (Array.isArray(value)) return queryParam(value[0]);
  return typeof value === 'string' ? value : '';
}

function safeUploadFileName(value: unknown): string {
  const fallback = 'matrix-video';
  const raw = decodeURIComponent(String(value || fallback)).split(/[\\/]/).pop() || fallback;
  const sanitized = raw.replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_').slice(0, 100);
  return sanitized || fallback;
}

function publicUploadUrl(req: express.Request, relativePath: string): string {
  return `${req.protocol}://${req.get('host')}${relativePath}`;
}

async function assetStorageContext() {
  const [roles, users] = await Promise.all([
    prisma.role.findMany({ where: { isActive: true } }),
    prisma.user.findMany(),
  ]);
  return {
    roles: roles.map(mapPrismaRole).map(mergeRoleWithDefaultAccess),
    users: users.map(mapPrismaUser),
  };
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

app.get('/api/customers', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerListService.list({
    search: queryParam(req.query.search),
    productLevel: queryParam(req.query.productLevel) as any,
    customerLevel: queryParam(req.query.customerLevel) as any,
    lifecycleStatusCode: queryParam(req.query.lifecycleStatusCode) as any,
    owner: queryParam(req.query.owner),
    followStatus: queryParam(req.query.followStatus) as any,
    sourceType: queryParam(req.query.sourceType),
    leadSource: queryParam(req.query.leadSource),
    industry: queryParam(req.query.industry),
    city: queryParam(req.query.city),
    tag: queryParam(req.query.tag),
    page: Number(queryParam(req.query.page)),
    pageSize: Number(queryParam(req.query.pageSize)),
  }, req.currentUser);
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.get('/api/leads', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const result = await leadListService.list({
    search: queryParam(req.query.search),
    source: queryParam(req.query.source) as any,
    status: queryParam(req.query.status) as any,
    lifecycleStatusCode: queryParam(req.query.lifecycleStatusCode) as any,
    owner: queryParam(req.query.owner),
    startDate: queryParam(req.query.startDate),
    endDate: queryParam(req.query.endDate),
    page: Number(queryParam(req.query.page)),
    pageSize: Number(queryParam(req.query.pageSize)),
  }, req.currentUser);
  res.status(result.code === 0 ? 200 : 400).json(result);
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

app.post(
  '/api/uploads/matrix-video',
  requireMatrixPublishUploadAccess,
  express.raw({ type: ['video/*', 'application/octet-stream'], limit: '200mb' }),
  async (req: AuthenticatedRequest, res) => {
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    if (!buffer.length) {
      res.status(400).json({ code: -1, data: null, message: '视频文件不能为空' });
      return;
    }
    const uploadDir = path.join(uploadRoot, 'matrix-videos');
    await mkdir(uploadDir, { recursive: true });
    const fileName = `${Date.now()}-${safeUploadFileName(req.headers['x-file-name'])}`;
    await writeFile(path.join(uploadDir, fileName), buffer);
    const url = publicUploadUrl(req, `/uploads/matrix-videos/${encodeURIComponent(fileName)}`);
    res.json({ code: 0, data: { url, fileName }, message: 'success' });
  },
);

app.get('/api/settings/users', requireOrganizationAccess, async (_req, res) => {
  res.json(await settingsService.listUsers());
});

app.get('/api/settings/assignable-users', requireAssignableUsersAccess, async (_req: express.Request, res: express.Response) => {
  res.json(await settingsService.listAssignableUsers());
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

app.get('/api/storage', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  if (queryParam(req.query.scope) === 'runtime') {
    const entries = await Promise.all(runtimeStorageKeys.map(async (key) => {
      if (req.currentUser && !canReadStorageKey(req.currentUser, key)) return [key, null] as const;
      const result = await storageService.get(key);
      return [key, result.code === 0 ? result.data : null] as const;
    }));
    res.json({ code: 0, data: Object.fromEntries(entries), message: 'success' });
    return;
  }

  const result = await storageService.list();
  if (result.code === 0 && result.data && req.currentUser) {
    const context = await assetStorageContext();
    res.json({ ...result, data: filterAssetStorageData(result.data as Record<string, unknown>, req.currentUser, context) });
    return;
  }
  res.json(result);
});

app.get('/api/storage/:key', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const key = routeParam(req.params.key);
  if (req.currentUser && !canReadStorageKey(req.currentUser, key)) {
    res.status(403).json({ code: 403, data: null, message: 'Forbidden' });
    return;
  }
  if (req.currentUser && isAssetStorageKey(key)) {
    const result = await storageService.list();
    const context = await assetStorageContext();
    const data = filterSingleStorageKey(key, result.data as Record<string, unknown>, req.currentUser, context);
    res.status(result.code === 0 ? 200 : 400).json({ ...result, data });
    return;
  }
  const result = await storageService.get(key);
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.put('/api/storage/:key', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const key = routeParam(req.params.key);
  if (req.currentUser && !canWriteStorageKey(req.currentUser, key)) {
    res.status(403).json({ code: 403, data: null, message: 'Forbidden' });
    return;
  }
  const result = await storageService.set(key, req.body?.value);
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.delete('/api/storage/:key', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const key = routeParam(req.params.key);
  if (req.currentUser && !canWriteStorageKey(req.currentUser, key)) {
    res.status(403).json({ code: 403, data: null, message: 'Forbidden' });
    return;
  }
  const result = await storageService.remove(key);
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

if (process.env.NODE_ENV === 'production') {
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.resolve(serverDir, '../dist');
  const indexHtml = path.join(distDir, 'index.html');
  if (existsSync(indexHtml)) {
    app.use(express.static(distDir, { index: false }));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(indexHtml);
    });
  } else {
    console.warn(`Production frontend dist not found at ${distDir}. Run npm.cmd run build first.`);
  }
}

async function startServer() {
  const migratedRoles = await migrateDefaultRoleAccess(prisma);
  if (migratedRoles > 0) {
    console.log(`Migrated default role access for ${migratedRoles} roles.`);
  }
  app.listen(port, host, () => {
    console.log(`AI proxy listening on http://${host}:${port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
