import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getAllowedCorsOrigins,
  getApiJsonBodyLimit,
  getApiListenHost,
  getEnablementPrivateStorageDir,
  getCustomerDataExchangeSecret,
  validateRuntimeConfig,
} from './config/runtime';
import { getScopedStorageKeys } from './config/storageScopes';
import { prisma, checkDatabaseConnection } from './db/client';
import { createRequireAnyPermission, createRequireAuth, bearerToken, type AuthenticatedRequest } from './middleware/auth';
import { createLoginRateLimiter } from './middleware/loginRateLimit';
import { createSystemInstallationGate } from './middleware/systemInstallationGate';
import { createAuthService } from './services/authService';
import { success } from './api/response';
import { createAiConfigService } from './services/aiConfigService';
import { createAiChatClient, type AiChatMessage } from './services/aiChatClient';
import { createCustomerListService } from './services/customerListService';
import {
  createAuditedCustomerAtomicCommandService,
  createCustomerAtomicCommandService,
  createCustomerCommandService,
} from './services/customerCommandService';
import { createPrismaCustomerAuditAppender } from './services/customerAuditService';
import { createContactIdentityCryptoFromEnv } from './services/contactIdentityService';
import { createCustomerTodoService } from './services/customerTodoService';
import { createCustomerManageableUsersService } from './services/customerManageableUsersService';
import { createCustomerBatchService } from './services/customerBatchService';
import {
  createCustomerBatchWorker,
  createPrismaCustomerBatchWorkerStore,
} from './services/customerBatchWorker';
import {
  CustomerBatchJobHandlerRegistry,
  createCustomerMutationBatchJobHandler,
} from './services/customerBatchJobHandler';
import { createCustomerImportBatchJobHandler } from './services/customerDataExchangeAdapter';
import { loadCustomerAccessContext } from './services/customerAccessPolicy';
import {
  backfillCustomerContactIdentitiesResult,
  backfillCustomerOwnerIdentitiesResult,
} from './services/customerOwnerIdentityService';
import { createCustomerTagRouter, createCustomerTagService } from './services/customerTagService';
import { createCustomerTagMigrationRouter, createCustomerTagMigrationService } from './services/customerTagMigrationService';
import { createLeadListService } from './services/leadListService';
import { createBusinessRecycleBinService } from './services/businessRecycleBinService';
import { createPrismaBusinessRecycleBinRepository } from './services/businessRecycleBinRepository';
import { createBusinessRecycleBinRouter } from './routes/businessRecycleBinRoutes';
import { createSystemSetupRouter } from './routes/systemSetupRoutes';
import { createPrismaSystemSetupRepository } from './services/systemSetupRepository';
import { createSystemSetupService } from './services/systemSetupService';
import { ensureSystemLifecycleDefaults } from './services/systemConfigMigrationService';
import { createSettingsService } from './services/settingsService';
import { createStorageService } from './services/storageService';
import { createBusinessAttachmentService, createPrismaBusinessAttachmentRepository } from './services/businessAttachmentService';
import { createAssetListService, isAssetListKind } from './services/assetListService';
import { createOrderApplicationService } from './services/orderApplicationService';
import {
  createOrderApprovalDownstreamEffects,
  rebuildPendingOrderCommissions,
} from './services/orderApprovalEffectsService';
import { createOrderCommandService } from './services/orderCommandService';
import { createOrderQueryService } from './services/orderQueryService';
import { createDeliveryCommandService } from './services/deliveryCommandService';
import { createDeliveryQueryService } from './services/deliveryQueryService';
import { createDeliveryAssignmentService } from './services/deliveryAssignmentService';
import { createRecoveryOrderCommandService } from './services/recoveryOrderCommandService';
import { createKnowledgeService } from './services/enablement/knowledgeService';
import { createKnowledgeFileStore } from './services/enablement/knowledgeFileStore';
import { createPrismaKnowledgeRepository } from './services/enablement/prismaKnowledgeRepository';
import { createKeywordKnowledgeSearchProvider } from './services/enablement/knowledgeSearchProvider';
import { createEnablementKnowledgeRouter } from './routes/enablementKnowledgeRoutes';
import { createCoCreationRouter } from './routes/coCreationRoutes';
import { createRuntimeStorageGetHandler } from './routes/runtimeStorageRoutes';
import { createDisabledCrmCustomerImportHandler } from './routes/crmMigrationRoutes';
import { createCustomerFollowUpHandler } from './routes/customerFollowUpRoutes';
import {
  CUSTOMER_MANAGEABLE_USERS_PERMISSION_REQUIREMENTS,
  createCustomerManageableUsersHandler,
} from './routes/customerManageableUsersRoutes';
import { createCustomerBatchRouter } from './routes/customerBatchRoutes';
import { createCustomerMergeRouter } from './routes/customerMergeRoutes';
import { createCustomerMergeService } from './services/customerMergeService';
import { createPrismaCustomerDataExchangeService } from './services/customerDataExchangeAdapter';
import { createCustomerDataExchangeRouter } from './routes/customerDataExchangeRoutes';
import { resolveCanonicalCustomer } from './services/customerCanonicalService';
import { createCoCreationService } from './services/coCreation/coCreationService';
import {
  filterAssetStorageData,
  filterRecoveryOrderStorageData,
  filterSingleRecoveryOrderStorageKey,
  filterSingleStorageKey,
  isAssetStorageKey,
} from './services/assetStorageAccess';
import { canAccessLegacyStorageKey } from './services/legacyStorageAccess';
import {
  createCustomerPermissionMigrationManifestAuthenticatorFromEnv,
  migrateCustomerPermissionAndScopeBaseline,
  migrateDefaultRoleAccess,
  toSafeCustomerPermissionMigrationErrorCode,
} from './services/roleMigrationService';
import { mapPrismaRole, mapPrismaUser } from './db/prismaMappers';
import { mergeRoleWithDefaultAccess } from '../src/shared/utils/organizationConfig';
import { PERMISSION_KEYS, hasPermission } from '../src/shared/utils/permissions';
import { STORAGE_KEYS } from '../src/shared/utils/constants';
import type { OrderApplicationFilters } from '../src/types/order';
import type { RecoveryOrderFilters } from '../src/types/recoveryOrder';
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
const businessAttachmentRoot = path.resolve(
  process.env.BUSINESS_ATTACHMENT_STORAGE_DIR || path.join(serverDir, '../uploads-private/business-attachments'),
);
const allowedCorsOrigins = getAllowedCorsOrigins();
const contactIdentityEnvNames = [
  'CONTACT_IDENTITY_HMAC_KEY',
  'CONTACT_IDENTITY_HMAC_KEY_VERSION',
  'CONTACT_IDENTITY_ENCRYPTION_KEY',
  'CONTACT_IDENTITY_ENCRYPTION_KEY_VERSION',
] as const;
const contactIdentityCrypto = contactIdentityEnvNames.some((name) => String(process.env[name] || '').trim())
  ? createContactIdentityCryptoFromEnv(process.env)
  : undefined;
const authService = createAuthService(prisma);
const systemSetupService = createSystemSetupService({
  repository: createPrismaSystemSetupRepository(prisma),
  setupToken: process.env.JIXIANG_SETUP_TOKEN,
  onError: (error) => console.error('System setup operation failed:', error),
});
const aiConfigService = createAiConfigService(prisma as any);
const aiChatClient = createAiChatClient({ configReader: aiConfigService });
const coCreationService = createCoCreationService({ prisma, aiClient: aiChatClient });
const customerListService = createCustomerListService(prisma, { contactIdentityCrypto });
const customerCommandService = createCustomerCommandService(prisma, { contactIdentityCrypto });
// Transfer/release/delete use the shared atomic command engine. Profile,
// todo, claim, creation, and follow-up services retain their dedicated
// request contracts, but each appends its audit event in the same transaction.
const customerAtomicCommandEngine = createCustomerAtomicCommandService({
  auditAppender: createPrismaCustomerAuditAppender(),
});
const customerAtomicCommandService = createAuditedCustomerAtomicCommandService(prisma, {
  auditAppender: createPrismaCustomerAuditAppender(),
});
const customerTodoService = createCustomerTodoService(prisma);
const customerManageableUsersService = createCustomerManageableUsersService(prisma);
const customerBatchService = createCustomerBatchService(prisma);
const customerMergeService = createCustomerMergeService(prisma);
const customerDataExchangeService = createPrismaCustomerDataExchangeService({
  prisma,
  customerReader: customerListService,
  secret: getCustomerDataExchangeSecret(),
});
const customerBatchWorker = createCustomerBatchWorker({
  store: createPrismaCustomerBatchWorkerStore(prisma),
  handlers: new CustomerBatchJobHandlerRegistry([
    createCustomerMutationBatchJobHandler({ atomicService: customerAtomicCommandEngine }),
    createCustomerImportBatchJobHandler(customerListService),
  ]),
  workerId: `${process.pid}-${randomUUID()}`,
  onError: (error) => console.error(
    'Customer batch worker failed:',
    String((error as { code?: unknown } | null)?.code || 'WORKER_ERROR'),
  ),
});
const customerTagService = createCustomerTagService(prisma);
const customerTagMigrationService = createCustomerTagMigrationService(prisma as any);
const leadListService = createLeadListService(prisma);
const businessRecycleBinService = createBusinessRecycleBinService(createPrismaBusinessRecycleBinRepository(prisma));
const settingsService = createSettingsService(prisma);
const storageService = createStorageService(prisma);
const businessAttachmentService = createBusinessAttachmentService({
  repository: createPrismaBusinessAttachmentRepository(prisma),
  rootDir: businessAttachmentRoot,
});
const assetListService = createAssetListService(storageService, assetStorageContext);
const deliveryAssignmentService = createDeliveryAssignmentService(prisma);
const orderApplicationService = createOrderApplicationService(prisma, {
  applyDownstreamEffects: createOrderApprovalDownstreamEffects(deliveryAssignmentService),
});
const orderCommandService = createOrderCommandService(prisma, {
  rebuildPendingCommissions: rebuildPendingOrderCommissions,
});
const orderQueryService = createOrderQueryService(prisma);
const deliveryCommandService = createDeliveryCommandService(prisma, { assigner: deliveryAssignmentService });
const deliveryQueryService = createDeliveryQueryService(prisma);
const recoveryOrderCommandService = createRecoveryOrderCommandService(prisma);
const knowledgeRepository = createPrismaKnowledgeRepository(prisma as any);
const knowledgeFileStore = createKnowledgeFileStore(getEnablementPrivateStorageDir(process.env, uploadRoot));
const knowledgeService = createKnowledgeService({
  repository: knowledgeRepository,
  fileStore: knowledgeFileStore,
  searchProvider: createKeywordKnowledgeSearchProvider(),
});
const requireOrganizationReadAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS);
const requireOrganizationWriteAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS, 'write');
const requireOrganizationDeleteAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS, 'delete');
const requireRoleReadAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_ROLES);
const requireRoleWriteAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_ROLES, 'write');
const requireRoleDeleteAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_ROLES, 'delete');
const requireAiConfigReadAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_AI_CONFIG);
const requireAiConfigWriteAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_AI_CONFIG, 'write');
const requireDataMaintenanceDeleteAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE, 'delete');
const requireDataMaintenanceWriteAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE, 'write');
const requireDataMaintenanceReadAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE, 'read');
const requireDeliveryAssignmentReadAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_DELIVERY_ASSIGNMENT);
const requireDeliveryAssignmentWriteAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_DELIVERY_ASSIGNMENT, 'write');
const requireStorageAccess = createRequireAuth(authService);
const requireCoCreationAccess = createRequireAuth(authService);
const requireCustomerListAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_LIST);
const requireCustomerReadAccess = createRequireAnyPermission(authService, [
  PERMISSION_KEYS.CUSTOMER_LIST,
  PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_VIEW,
]);
const requireCustomerTagLeadReadAccess = createRequireAuth(authService, PERMISSION_KEYS.LEADS_DETAIL);
const requireCustomerTagSettingsReadAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS);
const requireCustomerTagManageAccess = createRequireAuth(authService, PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS, 'write');
const requireCustomerCreateAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_CREATE, 'write');
const requireCustomerUpdateAccess = createRequireAnyPermission(authService, [
  PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE,
  PERMISSION_KEYS.CUSTOMER_SET_PROGRESS,
  PERMISSION_KEYS.CUSTOMER_SET_TAGS,
  PERMISSION_KEYS.CUSTOMER_EDIT_ATTRIBUTION,
], 'write');
const requireCustomerProfileEditAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, 'write');
const requireCustomerTodoWriteAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_SET_TODOS, 'write');
const requireCustomerTransferAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_TRANSFER, 'write');
const requireCustomerReleaseAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL, 'write');
const requireCustomerPublicPoolClaimAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM, 'write');
const requireCustomerDeleteAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_DELETE, 'delete');
const requireCustomerManageableUsersAccess = createRequireAnyPermission(
  authService,
  CUSTOMER_MANAGEABLE_USERS_PERMISSION_REQUIREMENTS,
);
const requireCustomerBatchManageAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE, 'write');
const requireCustomerBatchReadAccess = createRequireAnyPermission(authService, [
  { permissionKey: PERMISSION_KEYS.CUSTOMER_BATCH_AUDIT_READ, action: 'read' },
  { permissionKey: PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE, action: 'write' },
]);
const requireCustomerMergeAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_MERGE, 'write');
const requireCustomerMergeUndoAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_MERGE_UNDO, 'write');
const requireCustomerImportAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_IMPORT, 'write');
const requireCustomerExportAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_EXPORT, 'write');
const requireLeadListAccess = createRequireAuth(authService, PERMISSION_KEYS.LEADS_LIST);
const requireLeadCreateAccess = createRequireAuth(authService, PERMISSION_KEYS.LEADS_CREATE, 'write');
const requireLeadConvertAccess = createRequireAuth(authService, PERMISSION_KEYS.LEADS_CONVERT, 'write');
const requireLeadEditAccess = createRequireAnyPermission(authService, [PERMISSION_KEYS.LEADS_CREATE, PERMISSION_KEYS.LEADS_DETAIL], 'write');
const requireLeadFollowAccess = createRequireAuth(authService, PERMISSION_KEYS.LEADS_FOLLOW, 'write');
const requireLeadAssignAccess = createRequireAuth(authService, PERMISSION_KEYS.LEADS_FLOW_CONFIG, 'write');
const requireLeadDeleteAccess = createRequireAuth(authService, '全部', 'delete');
const requireOrderCreateWriteAccess = createRequireAuth(authService, PERMISSION_KEYS.ORDER_CREATE, 'write');
const requireOrderReadAccess = createRequireAuth(authService, PERMISSION_KEYS.ORDER_MANAGE);
const requireOrderApplicationReadAccess = createRequireAuth(authService, PERMISSION_KEYS.ORDER_REVIEW_LIST);
const requireOrderEditWriteAccess = createRequireAuth(authService, PERMISSION_KEYS.ORDER_EDIT, 'write');
const requireOrderDeleteAccess = createRequireAuth(authService, PERMISSION_KEYS.ORDER_DELETE, 'delete');
const requireOrderReviewWriteAccess = createRequireAuth(authService, PERMISSION_KEYS.ORDER_REVIEW, 'write');
const requireDeliveryReadAccess = createRequireAuth(authService, PERMISSION_KEYS.DELIVERY_CENTER);
const requireDeliveryWriteAccess = createRequireAnyPermission(authService, [PERMISSION_KEYS.DELIVERY_MOVE_CARD, PERMISSION_KEYS.DELIVERY_STAGE_CONFIG], 'write');
const requireRecoveryCreateAccess = createRequireAuth(authService, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, 'write');
const requireMatrixPublishUploadAccess = createRequireAuth(authService, PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH, 'write');
const requireAssetReadAccess = createRequireAuth(authService, PERMISSION_KEYS.ASSETS);
const requireAiChatAccess = createRequireAuth(authService, PERMISSION_KEYS.AI_CHAT);
const requireCustomerAiCardAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_AI_CARD);
const requireEnablementRead = createRequireAuth(authService, PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE);
const requireEnablementReview = createRequireAuth(authService, PERMISSION_KEYS.ENABLEMENT_REVIEW, 'write');
const requireEnablementPublish = createRequireAuth(authService, PERMISSION_KEYS.ENABLEMENT_PUBLISH, 'write');
const assignableUsersPermissions = [
  PERMISSION_KEYS.SETTINGS_DELIVERY_ASSIGNMENT,
  PERMISSION_KEYS.LEADS_FLOW_CONFIG,
  PERMISSION_KEYS.CUSTOMER_TRANSFER,
  PERMISSION_KEYS.CUSTOMER_SET_TODOS,
  PERMISSION_KEYS.FINANCE_SETTLEMENT,
  PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT,
  PERMISSION_KEYS.FINANCE_PAYOUT,
  PERMISSION_KEYS.FINANCE_RULES,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST,
  PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW,
];
const runtimeStorageKeys = [
  STORAGE_KEYS.DELIVERY_ASSIGNMENT_CONFIG,
  STORAGE_KEYS.OPPORTUNITIES,
  STORAGE_KEYS.SERVICE_TICKETS,
  STORAGE_KEYS.AI_CARDS,
  STORAGE_KEYS.AI_SESSIONS,
  STORAGE_KEYS.PRODUCTS,
  STORAGE_KEYS.TAGS,
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
  STORAGE_KEYS.AFTER_SALES_SOURCE_CONFIGS,
  STORAGE_KEYS.COMMISSION_RULES,
  STORAGE_KEYS.COMMISSION_ROLE_CONFIGS,
  STORAGE_KEYS.COMMISSION_PAYOUT_PLANS,
  STORAGE_KEYS.MONTHLY_COMMISSION_TIER_CONFIGS,
  STORAGE_KEYS.ECOMMERCE_SETTLEMENT_RECORDS,
  STORAGE_KEYS.ECOMMERCE_SETTLEMENT_CONFIG,
  STORAGE_KEYS.INITIALIZED,
];
const requireAssignableUsersAccess = createRequireAnyPermission(authService, assignableUsersPermissions);
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
app.use('/api/system/setup', createSystemSetupRouter({ service: systemSetupService }));
app.use(createSystemInstallationGate(systemSetupService));
app.use('/uploads', express.static(uploadRoot, { index: false }));
app.use('/api/enablement/knowledge', createEnablementKnowledgeRouter({
  knowledgeService,
  requireRead: requireEnablementRead,
  requireReview: requireEnablementReview,
  requirePublish: requireEnablementPublish,
}));
app.use('/api/co-creation', createCoCreationRouter({ service: coCreationService, requireAuth: requireCoCreationAccess }));

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function queryParam(value: unknown): string {
  if (Array.isArray(value)) return queryParam(value[0]);
  return typeof value === 'string' ? value : '';
}

function queryParams(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).flatMap((item) => typeof item === 'string' ? [item.trim()] : []).filter(Boolean);
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

async function callDeepSeek(messages: AiChatMessage[], options: { temperature?: number } = {}): Promise<string> {
  return aiChatClient.complete(messages, options);
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
app.use('/api/customer-tags', createCustomerTagMigrationRouter({
  service: customerTagMigrationService,
  requireAuth: requireDataMaintenanceWriteAccess,
}));
app.use('/api/customer-tags', createCustomerTagRouter({
  service: customerTagService,
  requireCustomerRead: requireCustomerReadAccess,
  requireLeadRead: requireCustomerTagLeadReadAccess,
  requireSettingsRead: requireCustomerTagSettingsReadAccess,
  requireManage: requireCustomerTagManageAccess,
}));
app.use('/api/customer-batch-jobs', createCustomerBatchRouter({
  service: customerBatchService,
  loadCurrentAccess: (currentUser) => loadCustomerAccessContext(prisma, currentUser),
  requireManage: requireCustomerBatchManageAccess,
  requireRead: requireCustomerBatchReadAccess,
  requireAuthenticated: requireStorageAccess,
}));
app.use('/api/customer-data-exchange', createCustomerDataExchangeRouter({
  service: customerDataExchangeService,
  requireImport: requireCustomerImportAccess,
  requireExport: requireCustomerExportAccess,
}));
app.use('/api', createCustomerMergeRouter({
  service: customerMergeService,
  loadCurrentAccess: (currentUser) => loadCustomerAccessContext(prisma, currentUser),
  requireMerge: requireCustomerMergeAccess,
  requireUndo: requireCustomerMergeUndoAccess,
}));

app.post('/api/crm-migration/import', requireStorageAccess, createDisabledCrmCustomerImportHandler());

app.get('/api/crm-migration/customer-owner-identities/preview', requireDataMaintenanceWriteAccess, async (_req, res) => {
  const result = await backfillCustomerOwnerIdentitiesResult(prisma, false);
  res.status(result.code === 0 ? 200 : result.code).json(result);
});

app.post('/api/crm-migration/customer-owner-identities/apply', requireDataMaintenanceWriteAccess, async (_req, res) => {
  const result = await backfillCustomerOwnerIdentitiesResult(prisma, true);
  res.status(result.code === 0 ? 200 : result.code).json(result);
});

app.get('/api/crm-migration/contact-identities/preview', requireDataMaintenanceWriteAccess, async (_req, res) => {
  const result = await backfillCustomerContactIdentitiesResult(prisma, {
    apply: false,
    crypto: contactIdentityCrypto,
  });
  res.status(result.code === 0 ? 200 : result.code).json(result);
});

app.post('/api/crm-migration/contact-identities/apply', requireDataMaintenanceWriteAccess, async (_req, res) => {
  const result = await backfillCustomerContactIdentitiesResult(prisma, {
    apply: true,
    crypto: contactIdentityCrypto,
  });
  res.status(result.code === 0 ? 200 : result.code).json(result);
});

app.post('/api/customers', requireCustomerCreateAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerListService.create(req.body || {}, req.currentUser!);
  res.status(result.code === 0 ? 201 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/customers', requireCustomerReadAccess, async (req: AuthenticatedRequest, res) => {
  const tagIds = queryParams(req.query.tagId);
  const rawTagMatch = queryParam(req.query.tagMatch) || 'grouped';
  const tagMatch = rawTagMatch === 'any' || rawTagMatch === 'all' || rawTagMatch === 'grouped' ? rawTagMatch : null;
  const withoutTagsRaw = queryParam(req.query.withoutTags);
  if (tagIds.length > 20) return res.status(400).json({ code: 400, message: '客户标签最多选择 20 个', data: null });
  if (!tagMatch) return res.status(400).json({ code: 400, message: '不支持的标签匹配方式', data: null });
  if (withoutTagsRaw && !['true', 'false'].includes(withoutTagsRaw)) return res.status(400).json({ code: 400, message: 'withoutTags 必须为布尔值', data: null });
  const result = await customerListService.list({
    search: queryParam(req.query.search),
    productLevel: queryParam(req.query.productLevel) as any,
    customerLevel: queryParam(req.query.customerLevel) as any,
    lifecycleStatusCode: queryParam(req.query.lifecycleStatusCode) as any,
    owner: queryParam(req.query.owner),
    followStatus: queryParam(req.query.followStatus) as any,
    sourceType: queryParam(req.query.sourceType),
    leadSource: queryParam(req.query.leadSource),
    sourceName: queryParam(req.query.sourceName),
    industry: queryParam(req.query.industry),
    city: queryParam(req.query.city),
    tag: queryParam(req.query.tag),
    tagIds,
    tagMatch,
    withoutTags: withoutTagsRaw === 'true',
    missingTagGroupId: queryParam(req.query.missingTagGroupId) || undefined,
    page: Number(queryParam(req.query.page)),
    pageSize: Number(queryParam(req.query.pageSize)),
  }, req.currentUser);
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.get('/api/customers/public-pool-follow-up-operators', requireCustomerReadAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerListService.listPublicPoolFollowUpOperators(req.currentUser);
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.use('/api/business-recycle-bin', createBusinessRecycleBinRouter({
  service: businessRecycleBinService,
  requireRead: requireDataMaintenanceReadAccess,
}));

app.get('/api/customers/manageable-users', requireCustomerManageableUsersAccess, createCustomerManageableUsersHandler(customerManageableUsersService));

app.put('/api/customers/:id', requireCustomerUpdateAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerCommandService.updateCustomer(
    routeParam(req.params.id),
    req.body || {},
    req.currentUser!,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.delete('/api/customers/:id', requireCustomerDeleteAccess, async (req: AuthenticatedRequest, res) => {
  const atomicResult = await customerAtomicCommandService.execute({
    action: 'soft_delete',
    customerId: routeParam(req.params.id),
    reason: String(req.body?.reason || '').trim(),
    confirmed: true,
  }, req.currentUser!);
  // Preserve the legacy DELETE contract: a missing/already-deleted customer is
  // an idempotent no-op. Successful mutations still use the audited atomic path.
  const result = atomicResult.code === 0 || atomicResult.code === 404 ? success(true) : atomicResult;
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/customers/:id/follow-ups', requireCustomerProfileEditAccess, createCustomerFollowUpHandler(customerListService));

app.get('/api/customers/:id', requireCustomerReadAccess, async (req: AuthenticatedRequest, res) => {
  const customerId = routeParam(req.params.id);
  const result = await customerListService.getById(customerId, req.currentUser);
  if (result.code !== 0) {
    res.status(result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
    return;
  }
  const redirect = await resolveCanonicalCustomer(prisma, customerId);
  if (redirect) {
    res.status(409).json({ code: 409, message: '客户已合并，请查看主客户', data: redirect, canonicalCustomerId: redirect.canonicalCustomerId });
    return;
  }
  res.status(200).json(result);
});

app.get('/api/customers/:id/todos', requireCustomerReadAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerTodoService.list(routeParam(req.params.id), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/customer-todos/my', requireCustomerListAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerTodoService.listMine(req.currentUser!);
  res.status(200).json(result);
});

app.post('/api/customers/:id/todos', requireCustomerTodoWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerTodoService.create(routeParam(req.params.id), req.body || {}, req.currentUser!);
  res.status(result.code === 0 ? 201 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.put('/api/customers/:id/todos/:todoId', requireCustomerTodoWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerTodoService.update(routeParam(req.params.id), routeParam(req.params.todoId), req.body || {}, req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/customers/:id/todos/:todoId/complete', requireCustomerListAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerTodoService.complete(routeParam(req.params.id), routeParam(req.params.todoId), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/customers/:id/todos/:todoId/reopen', requireCustomerTodoWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerTodoService.reopen(routeParam(req.params.id), routeParam(req.params.todoId), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/customers/:id/todos/:todoId/cancel', requireCustomerTodoWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerTodoService.cancel(routeParam(req.params.id), routeParam(req.params.todoId), String(req.body?.reason || ''), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/customers/:id/release', requireCustomerReleaseAccess, async (req: AuthenticatedRequest, res) => {
  const atomicResult = await customerAtomicCommandService.execute({
    action: 'release_to_pool',
    customerId: routeParam(req.params.id),
    reason: String(req.body?.reason || '').trim(),
  }, req.currentUser!);
  const result = atomicResult.code === 0 ? success(atomicResult.data!.customer) : atomicResult;
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/customers/:id/claim', requireCustomerPublicPoolClaimAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerCommandService.claimFromPublicPool(routeParam(req.params.id), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/customers/:id/assign', requireCustomerTransferAccess, async (req: AuthenticatedRequest, res) => {
  const atomicResult = await customerAtomicCommandService.execute({
    action: 'transfer',
    customerId: routeParam(req.params.id),
    targetOwnerId: String(req.body?.ownerId || ''),
    reason: String(req.body?.reason || '').trim(),
  }, req.currentUser!);
  const result = atomicResult.code === 0 ? success(atomicResult.data!.customer) : atomicResult;
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/leads', requireLeadListAccess, async (req: AuthenticatedRequest, res) => {
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

app.post('/api/leads', requireLeadCreateAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerCommandService.createLead(req.body || {}, req.currentUser!);
  res.status(result.code === 0 ? 201 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.put('/api/leads/:id', requireLeadEditAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerCommandService.updateLead(
    routeParam(req.params.id),
    req.body || {},
    req.currentUser!,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.delete('/api/leads/:id', requireLeadDeleteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerCommandService.deleteLead(
    routeParam(req.params.id),
    String(req.body?.reason || ''),
    req.currentUser!,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/leads/:id/follow-ups', requireLeadFollowAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerCommandService.addLeadFollowUp(
    routeParam(req.params.id),
    {
      type: req.body?.type,
      content: String(req.body?.content || ''),
      nextFollowUpDate: typeof req.body?.nextFollowUpDate === 'string' ? req.body.nextFollowUpDate : undefined,
      createdBy: typeof req.body?.createdBy === 'string' ? req.body.createdBy : undefined,
    },
    req.currentUser!,
  );
  res.status(result.code === 0 ? 201 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/leads/:id/assign', requireLeadAssignAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerCommandService.assignLead(
    routeParam(req.params.id),
    String(req.body?.owner || ''),
    req.currentUser!,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/leads/:id/convert', requireLeadConvertAccess, async (req: AuthenticatedRequest, res) => {
  const result = await customerCommandService.convertLeadToCustomer(routeParam(req.params.id), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/order-applications', requireOrderApplicationReadAccess, async (req: AuthenticatedRequest, res) => {
  const statuses = queryParam(req.query.statuses).split(',').filter(Boolean);
  const result = await orderQueryService.listApplications({
    search: queryParam(req.query.search),
    status: queryParam(req.query.status) as any,
    statuses: statuses as OrderApplicationFilters['statuses'],
    applicantName: queryParam(req.query.applicantName),
    reviewerName: queryParam(req.query.reviewerName),
    startDate: queryParam(req.query.startDate),
    endDate: queryParam(req.query.endDate),
    page: Number(queryParam(req.query.page)),
    pageSize: Number(queryParam(req.query.pageSize)),
  }, req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/order-applications/:id', requireOrderApplicationReadAccess, async (req: AuthenticatedRequest, res) => {
  const result = await orderQueryService.getApplication(routeParam(req.params.id), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/order-applications', requireOrderCreateWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await orderApplicationService.submit(req.body?.orderData, req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/order-applications/:id/resubmit', requireOrderCreateWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await orderApplicationService.resubmit(
    routeParam(req.params.id),
    req.body?.orderData,
    req.currentUser!,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/order-applications/:id/return', requireOrderReviewWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await orderApplicationService.returnApplication(
    routeParam(req.params.id),
    String(req.body?.reason || ''),
    req.currentUser!,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/order-applications/:id/reject', requireOrderReviewWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await orderApplicationService.reject(
    routeParam(req.params.id),
    String(req.body?.reason || ''),
    req.currentUser!,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/order-applications/:id/approve', requireOrderReviewWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await orderApplicationService.approve(routeParam(req.params.id), req.currentUser!);
  const status = result.code === 0
    ? 200
    : result.code >= 400 && result.code < 500
      ? result.code
      : 500;
  res.status(status).json(result);
});

app.delete('/api/order-applications/:id', requireOrderReviewWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await orderApplicationService.cleanupDeletedSource(
    routeParam(req.params.id),
    String(req.body?.reason || ''),
    req.currentUser!,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/orders', requireOrderReadAccess, async (req: AuthenticatedRequest, res) => {
  const result = await orderQueryService.listOrders({
    search: queryParam(req.query.search),
    customerId: queryParam(req.query.customerId),
    productLevel: queryParam(req.query.productLevel) as any,
    status: queryParam(req.query.status) as any,
    owner: queryParam(req.query.owner),
    orderType: queryParam(req.query.orderType) as any,
    paymentMethod: queryParam(req.query.paymentMethod) as any,
    startDate: queryParam(req.query.startDate),
    endDate: queryParam(req.query.endDate),
    sortBy: queryParam(req.query.sortBy) as any,
    sortDirection: queryParam(req.query.sortDirection) as any,
    page: Number(queryParam(req.query.page)),
    pageSize: Number(queryParam(req.query.pageSize)),
  }, req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/orders/owner-candidates', requireOrderReadAccess, async (req: AuthenticatedRequest, res) => {
  const result = await orderQueryService.listOwnerCandidates(req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/orders/stats', requireOrderReadAccess, async (req: AuthenticatedRequest, res) => {
  const result = await orderQueryService.getOrderStats(req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/orders/:id', requireOrderReadAccess, async (req: AuthenticatedRequest, res) => {
  const result = await orderQueryService.getOrder(routeParam(req.params.id), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.put('/api/orders/:id', requireOrderEditWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await orderCommandService.update(
    routeParam(req.params.id),
    req.body?.data || {},
    req.currentUser!,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.delete('/api/orders/:id', requireOrderDeleteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await orderCommandService.softDelete(
    routeParam(req.params.id),
    String(req.body?.reason || ''),
    req.currentUser!,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/deliveries', requireDeliveryReadAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryQueryService.list({
    productType: queryParam(req.query.productType) as any,
    stage: queryParam(req.query.stage),
    owner: queryParam(req.query.owner),
    ownerId: queryParam(req.query.ownerId),
    salesOwner: queryParam(req.query.salesOwner),
    status: queryParam(req.query.status) as any,
    priority: queryParam(req.query.priority) as any,
    paymentStart: queryParam(req.query.paymentStart),
    paymentEnd: queryParam(req.query.paymentEnd),
    plannedStart: queryParam(req.query.plannedStart),
    plannedEnd: queryParam(req.query.plannedEnd),
    search: queryParam(req.query.search),
    page: Number(queryParam(req.query.page)),
    pageSize: Number(queryParam(req.query.pageSize)),
  }, req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/deliveries/stats', requireDeliveryReadAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryQueryService.stats({
    productType: queryParam(req.query.productType) as any,
    stage: queryParam(req.query.stage),
    owner: queryParam(req.query.owner),
    ownerId: queryParam(req.query.ownerId),
    salesOwner: queryParam(req.query.salesOwner),
    priority: queryParam(req.query.priority) as any,
    paymentStart: queryParam(req.query.paymentStart),
    paymentEnd: queryParam(req.query.paymentEnd),
    plannedStart: queryParam(req.query.plannedStart),
    plannedEnd: queryParam(req.query.plannedEnd),
    search: queryParam(req.query.search),
  }, req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/deliveries/creatable-orders', requireDeliveryReadAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryQueryService.listCreatableOrders(queryParam(req.query.search), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/deliveries/:id', requireDeliveryReadAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryQueryService.get(routeParam(req.params.id), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/deliveries/from-order', requireDeliveryWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryCommandService.createFromOrder(String(req.body?.orderId || ''), req.currentUser!);
  res.status(result.code === 0 ? 201 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.patch('/api/deliveries/:id/card', requireDeliveryWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryCommandService.updateCard(
    routeParam(req.params.id),
    req.body?.data || {},
    req.currentUser!,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/deliveries/:id/advance', requireDeliveryWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryCommandService.advance(
    routeParam(req.params.id),
    String(req.body?.targetStage || ''),
    req.currentUser!,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/deliveries/:id/revert', requireDeliveryWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryCommandService.revert(routeParam(req.params.id), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.patch('/api/deliveries/:id/tasks/:taskId', requireDeliveryWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryCommandService.updateTask(
    routeParam(req.params.id),
    routeParam(req.params.taskId),
    req.body?.data || {},
    req.currentUser!,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/deliveries/:id/tasks/:taskId/attachments', requireDeliveryWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryCommandService.addAttachment(
    routeParam(req.params.id),
    routeParam(req.params.taskId),
    req.body?.attachment || {},
    req.currentUser!,
  );
  res.status(result.code === 0 ? 201 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.delete('/api/deliveries/:id/tasks/:taskId/attachments/:attachmentId', requireDeliveryWriteAccess, async (req: AuthenticatedRequest, res) => {
  const attachmentId = routeParam(req.params.attachmentId);
  const result = await deliveryCommandService.removeAttachment(
    routeParam(req.params.id), routeParam(req.params.taskId), attachmentId, req.currentUser!,
  );
  if (result.code === 0) {
    const fileResult = await businessAttachmentService.remove(attachmentId, req.currentUser!);
    if (fileResult.code !== 0 && fileResult.code !== 404) {
      res.status(fileResult.code).json(fileResult);
      return;
    }
  }
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/deliveries/:id/exceptions', requireDeliveryWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryCommandService.addException(
    routeParam(req.params.id),
    req.body?.data || {},
    req.currentUser!,
  );
  res.status(result.code === 0 ? 201 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/deliveries/:id/exceptions/:exceptionId/resolve', requireDeliveryWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryCommandService.resolveException(
    routeParam(req.params.id),
    routeParam(req.params.exceptionId),
    String(req.body?.resolution || ''),
    req.currentUser!,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/deliveries/:id/confirm', requireDeliveryWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryCommandService.confirmCompletion(
    routeParam(req.params.id),
    String(req.body?.notes || ''),
    req.currentUser!,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.delete('/api/deliveries/:id', requireDeliveryWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryCommandService.delete(routeParam(req.params.id), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/recovery-orders', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const statuses = queryParam(req.query.statuses).split(',').filter(Boolean);
  const result = await recoveryOrderCommandService.list({
    search: queryParam(req.query.search) || undefined,
    status: queryParam(req.query.status) as RecoveryOrderFilters['status'] || undefined,
    statuses: statuses as RecoveryOrderFilters['statuses'],
    settlementStatus: queryParam(req.query.settlementStatus) as RecoveryOrderFilters['settlementStatus'] || undefined,
    settlementStatuses: queryParam(req.query.settlementStatuses).split(',').filter(Boolean) as RecoveryOrderFilters['settlementStatuses'],
    ownerId: queryParam(req.query.ownerId) || undefined,
    includeDeleted: queryParam(req.query.includeDeleted) === 'true',
    scopeDomain: queryParam(req.query.scopeDomain) as RecoveryOrderFilters['scopeDomain'] || undefined,
    page: Number(queryParam(req.query.page)) || undefined,
    pageSize: Number(queryParam(req.query.pageSize)) || undefined,
  }, req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/recovery-orders/settlement-counts', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const result = await recoveryOrderCommandService.settlementCounts({
    search: queryParam(req.query.search) || undefined,
    includeDeleted: queryParam(req.query.includeDeleted) === 'true',
  }, req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.get('/api/recovery-orders/:id', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const result = await recoveryOrderCommandService.get(
    routeParam(req.params.id),
    req.currentUser!,
    queryParam(req.query.scopeDomain) as RecoveryOrderFilters['scopeDomain'] || undefined,
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/recovery-orders', requireRecoveryCreateAccess, async (req: AuthenticatedRequest, res) => {
  const result = await recoveryOrderCommandService.create(req.body?.data || req.body || {}, req.currentUser!);
  res.status(result.code === 0 ? 201 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.put('/api/recovery-orders/:id', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const result = await recoveryOrderCommandService.update(routeParam(req.params.id), req.body?.data || req.body || {}, req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/recovery-orders/:id/approve', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const result = await recoveryOrderCommandService.approve(routeParam(req.params.id), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/recovery-orders/:id/return', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const result = await recoveryOrderCommandService.returnForChanges(routeParam(req.params.id), String(req.body?.reason || ''), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.post('/api/recovery-orders/:id/reject', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const result = await recoveryOrderCommandService.reject(routeParam(req.params.id), String(req.body?.reason || ''), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
});

app.delete('/api/recovery-orders/:id', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const result = await recoveryOrderCommandService.softDelete(routeParam(req.params.id), String(req.body?.reason || ''), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
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

app.post('/api/auth/change-password', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const result = await authService.changePassword(
    req.currentUser!.id,
    String(req.body?.currentPassword || ''),
    String(req.body?.newPassword || ''),
  );
  res.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
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

app.post(
  '/api/business-attachments',
  requireStorageAccess,
  express.raw({ type: '*/*', limit: '20mb' }),
  async (req: AuthenticatedRequest, res) => {
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    const result = await businessAttachmentService.upload({
      draftKey: String(req.headers['x-draft-key'] || ''),
      category: String(req.headers['x-attachment-category'] || '') as any,
      file: {
        originalName: safeUploadFileName(req.headers['x-file-name']),
        mimeType: String(req.headers['content-type'] || 'application/octet-stream').split(';')[0],
        size: buffer.length,
        buffer,
      },
    }, req.currentUser!);
    res.status(result.code === 0 ? 201 : result.code).json(result);
  },
);

app.get('/api/business-attachments/:id', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const result = await businessAttachmentService.open(routeParam(req.params.id), req.currentUser!);
  if (result.code !== 0 || !result.data) {
    res.status(result.code).json(result);
    return;
  }
  const download = queryParam(req.query.download) === '1';
  const encodedName = encodeURIComponent(result.data.attachment.name);
  res.setHeader('Content-Type', result.data.attachment.mimeType);
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodedName}`);
  res.sendFile(result.data.absolutePath, { dotfiles: 'allow' });
});

app.delete('/api/business-attachments/:id', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const result = await businessAttachmentService.remove(routeParam(req.params.id), req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code).json(result);
});

app.get('/api/settings/users', requireOrganizationReadAccess, async (_req, res) => {
  res.json(await settingsService.listUsers());
});

app.get('/api/settings/assignable-users', requireAssignableUsersAccess, async (_req: express.Request, res: express.Response) => {
  res.json(await settingsService.listAssignableUsers());
});

app.get('/api/settings/assignable-directory', requireAssignableUsersAccess, async (_req: express.Request, res: express.Response) => {
  res.json(await settingsService.listAssignableDirectory());
});

app.get('/api/settings/delivery-assignment', requireDeliveryAssignmentReadAccess, async (_req, res) => {
  res.json(await deliveryAssignmentService.getConfig());
});

app.put('/api/settings/delivery-assignment', requireDeliveryAssignmentWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryAssignmentService.saveConfig(req.body || {}, req.currentUser!);
  res.status(result.code === 0 ? 200 : result.code || 400).json(result);
});

app.post('/api/settings/users/leave-customer-count', requireOrganizationReadAccess, async (req, res) => {
  const result = await settingsService.countLeaveOwnedCustomers(req.body?.userIds || []);
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.post('/api/settings/users', requireOrganizationWriteAccess, async (req, res) => {
  const result = await settingsService.createUser(req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.put('/api/settings/users/:id', requireOrganizationWriteAccess, async (req, res) => {
  const result = await settingsService.updateUser(routeParam(req.params.id), req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.post('/api/settings/users/:id/leave', requireOrganizationWriteAccess, async (req, res) => {
  const result = await settingsService.leaveUser(routeParam(req.params.id), req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.post('/api/settings/users/:id/restore', requireOrganizationWriteAccess, async (req, res) => {
  const result = await settingsService.restoreUser(routeParam(req.params.id));
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.delete('/api/settings/users/:id', requireOrganizationDeleteAccess, async (req, res) => {
  const result = await settingsService.deleteUser(routeParam(req.params.id));
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.post('/api/settings/users/:id/reset-password', requireOrganizationWriteAccess, async (req, res) => {
  const result = await settingsService.resetUserPassword(routeParam(req.params.id), String(req.body?.password || ''));
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.get('/api/settings/roles', requireRoleReadAccess, async (_req, res) => {
  res.json(await settingsService.listRoles());
});

app.post('/api/settings/roles', requireRoleWriteAccess, async (req, res) => {
  const result = await settingsService.createRole(req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.put('/api/settings/roles/:id', requireRoleWriteAccess, async (req, res) => {
  const result = await settingsService.updateRole(routeParam(req.params.id), req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.delete('/api/settings/roles/:id', requireRoleDeleteAccess, async (req, res) => {
  const result = await settingsService.deleteRole(routeParam(req.params.id));
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.get('/api/settings/departments', requireOrganizationReadAccess, async (_req, res) => {
  res.json(await settingsService.listDepartments());
});

app.post('/api/settings/departments', requireOrganizationWriteAccess, async (req, res) => {
  const result = await settingsService.createDepartment(req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.put('/api/settings/departments/:id', requireOrganizationWriteAccess, async (req, res) => {
  const result = await settingsService.updateDepartment(routeParam(req.params.id), req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.delete('/api/settings/departments/:id', requireOrganizationDeleteAccess, async (req, res) => {
  const result = await settingsService.deleteDepartment(routeParam(req.params.id));
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.get('/api/settings/positions', requireOrganizationReadAccess, async (_req, res) => {
  res.json(await settingsService.listPositions());
});

app.get('/api/ai/config', requireAiConfigReadAccess, async (_req, res) => {
  res.json(await aiConfigService.getPublicConfig());
});

app.put('/api/ai/config', requireAiConfigWriteAccess, async (req, res) => {
  const result = await aiConfigService.saveConfig(req.body || {});
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.post('/api/ai/config/test', requireAiConfigWriteAccess, async (_req, res) => {
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

app.get('/api/assets/dashboard', requireAssetReadAccess, async (req: AuthenticatedRequest, res) => {
  res.json(await assetListService.dashboard(req.currentUser!));
});

app.get('/api/assets/:kind', requireAssetReadAccess, async (req: AuthenticatedRequest, res) => {
  const kind = routeParam(req.params.kind);
  if (!isAssetListKind(kind)) {
    res.status(404).json({ code: 404, data: null, message: 'Unknown asset list' });
    return;
  }
  const result = await assetListService.list(kind, {
    search: queryParam(req.query.search),
    platform: queryParam(req.query.platform),
    permissionStatus: queryParam(req.query.permissionStatus),
    riskLevel: queryParam(req.query.riskLevel),
    status: queryParam(req.query.status),
    page: Number(queryParam(req.query.page) || 1),
    pageSize: Number(queryParam(req.query.pageSize) || 20),
  }, req.currentUser!);
  res.json(result);
});

const runtimeStorageGetHandler = createRuntimeStorageGetHandler({
  roleStore: prisma.role,
  runtimeStorageKeys,
  storageReader: storageService,
  filterData: async (data, currentUser) => {
    const context = await assetStorageContext();
    const assetFilteredData = filterAssetStorageData(data, currentUser, context);
    return filterRecoveryOrderStorageData(assetFilteredData, currentUser);
  },
});

app.get('/api/storage', requireStorageAccess, runtimeStorageGetHandler, async (req: AuthenticatedRequest, res) => {
  const requestedScope = queryParam(req.query.scope);
  const requestedKeys = getScopedStorageKeys(requestedScope);
  if (requestedKeys) {
    const entries = await Promise.all(requestedKeys
      .filter((key) => key === STORAGE_KEYS.ROLES || (req.currentUser && canAccessLegacyStorageKey(req.currentUser, key, 'runtime')))
      .map(async (key) => {
      if (key === STORAGE_KEYS.ROLES) {
        const canReadAllRoles = Boolean(
          req.currentUser
          && canAccessLegacyStorageKey(req.currentUser, key, 'runtime'),
        );
        const rows = canReadAllRoles
          ? await prisma.role.findMany({ orderBy: { createdAt: 'asc' } })
          : await prisma.role.findMany({
            where: { id: req.currentUser?.roleId || '__missing-role__' },
            orderBy: { createdAt: 'asc' },
          });
        return [key, rows.map(mapPrismaRole)] as const;
      }
      const result = await storageService.get(key);
      return [key, result.code === 0 ? result.data : null] as const;
      }));
    const data = Object.fromEntries(entries);
    const context = await assetStorageContext();
    const assetFilteredData = filterAssetStorageData(data, req.currentUser!, context);
    res.json({
      code: 0,
      data: filterRecoveryOrderStorageData(assetFilteredData, req.currentUser!),
      message: 'success',
    });
    return;
  }

  if (!req.currentUser || !hasPermission(req.currentUser, PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE)) {
    res.status(403).json({ code: 403, data: null, message: 'Forbidden' });
    return;
  }

  const result = await storageService.list();
  if (result.code === 0 && result.data && req.currentUser) {
    const context = await assetStorageContext();
    const assetFilteredData = filterAssetStorageData(result.data as Record<string, unknown>, req.currentUser, context);
    res.json({ ...result, data: filterRecoveryOrderStorageData(assetFilteredData, req.currentUser) });
    return;
  }
  res.json(result);
});

app.get('/api/storage/:key', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const key = routeParam(req.params.key);
  if (!req.currentUser || !canAccessLegacyStorageKey(req.currentUser, key, 'read')) {
    res.status(403).json({ code: 403, data: null, message: 'Forbidden' });
    return;
  }
  if (req.currentUser && isAssetStorageKey(key)) {
    const entries = await Promise.all((getScopedStorageKeys('assets') || []).map(async (assetKey) => {
      const result = await storageService.get(assetKey);
      return [assetKey, result.code === 0 ? result.data : []] as const;
    }));
    const context = await assetStorageContext();
    const data = filterSingleStorageKey(key, Object.fromEntries(entries), req.currentUser, context);
    res.json({ code: 0, data, message: 'success' });
    return;
  }
  if (key === STORAGE_KEYS.RECOVERY_ORDERS) {
    const result = await storageService.get(key);
    const data = filterSingleRecoveryOrderStorageKey(
      key,
      { [key]: result.data },
      req.currentUser,
    );
    res.status(result.code === 0 ? 200 : 400).json({ ...result, data });
    return;
  }
  const result = await storageService.get(key);
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.put('/api/storage/:key', requireStorageAccess, async (req: AuthenticatedRequest, res) => {
  const key = routeParam(req.params.key);
  if (!req.currentUser || !canAccessLegacyStorageKey(req.currentUser, key, 'write')) {
    res.status(403).json({ code: 403, data: null, message: 'Forbidden' });
    return;
  }
  const result = await storageService.set(key, req.body?.value);
  res.status(result.code === 0 ? 200 : 400).json(result);
});

app.delete('/api/storage/:key', requireStorageAccess, async (_req: AuthenticatedRequest, res) => {
  res.status(405).json({ code: 405, data: null, message: 'Legacy storage deletion is disabled' });
});

app.delete('/api/storage', requireDataMaintenanceDeleteAccess, async (_req, res) => {
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
  const setupStatus = await systemSetupService.status();
  if (setupStatus.code !== 0 || !setupStatus.data) {
    throw new Error('SYSTEM_SETUP_STATUS_UNAVAILABLE');
  }
  if (setupStatus.data?.initialized) {
    await ensureSystemLifecycleDefaults(prisma);
    const manifestAuthenticator = createCustomerPermissionMigrationManifestAuthenticatorFromEnv(process.env);
    const migratedRoles = await migrateDefaultRoleAccess(prisma);
    if (migratedRoles > 0) {
      console.log(`Migrated default role access for ${migratedRoles} roles.`);
    }
    const customerPermissionMigration = await migrateCustomerPermissionAndScopeBaseline(prisma, manifestAuthenticator);
    console.log(
      `Customer permission/scope baseline v${customerPermissionMigration.version}: ${customerPermissionMigration.migratedRoleIds.length} roles migrated.`,
    );
  } else {
    console.log('Awaiting first-time system setup. Legacy production migrations were skipped.');
  }
  const server = app.listen(port, host, () => {
    console.log(`AI proxy listening on http://${host}:${port}`);
  });
  customerBatchWorker.start();
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await customerBatchWorker.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  };
  process.once('SIGTERM', () => { void shutdown(); });
  process.once('SIGINT', () => { void shutdown(); });
}

startServer().catch((error) => {
  console.error('Failed to start server:', toSafeCustomerPermissionMigrationErrorCode(error));
  process.exit(1);
});
