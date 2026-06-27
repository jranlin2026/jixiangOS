import type { Customer } from '../types/customer';
import type { Lead, LeadFlowConfig, LeadIntakeRecord } from '../types/lead';
import type { User } from '../types/settings';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { DEFAULT_LEAD_FLOW_CONFIG, DEFAULT_PAGE_SIZE, LIFECYCLE_STATUS_CODES, STORAGE_KEYS, normalizeResourceOwnership } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentOperatorName, getCurrentOperatorUser, SYSTEM_OPERATOR } from '../shared/utils/currentOperator';
import { isSuperAdminRoleName } from '../shared/utils/roles';
import { hydrateLeadLifecycle } from './lifecycleSync';
import { ensureOrganizationConfigData } from '../shared/utils/organizationConfig';
import { canReceiveLead } from '../shared/utils/permissions';
import { getPhoneNumberError, normalizePhoneForComparison, normalizePhoneForStorage } from '../shared/utils/phoneNumber';

function ensureInit(): void {
  initializeMockData();
  ensureLeadFlowConfig();
}

type StoredLeadFlowConfig = Partial<LeadFlowConfig> & Record<string, unknown>;

const OFFICIAL_UNIQUE_KEY_MODE: LeadFlowConfig['uniqueKeyMode'] = 'phone_or_wechat';

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toNumber(value: unknown, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeLeadFlowConfig(input?: StoredLeadFlowConfig | null): LeadFlowConfig {
  const merged = { ...DEFAULT_LEAD_FLOW_CONFIG, ...(input || {}) } as StoredLeadFlowConfig;
  return {
    id: typeof merged.id === 'string' && merged.id.trim() ? merged.id : DEFAULT_LEAD_FLOW_CONFIG.id,
    uniqueKeyMode: OFFICIAL_UNIQUE_KEY_MODE,
    interceptionEnabled: toBoolean(merged.interceptionEnabled, DEFAULT_LEAD_FLOW_CONFIG.interceptionEnabled),
    autoAssignEnabled: toBoolean(merged.autoAssignEnabled, DEFAULT_LEAD_FLOW_CONFIG.autoAssignEnabled),
    assignmentMode: 'round_robin',
    participantUserIds: Array.isArray(merged.participantUserIds)
      ? merged.participantUserIds.filter((id): id is string => typeof id === 'string')
      : [...DEFAULT_LEAD_FLOW_CONFIG.participantUserIds],
    dailyLimitEnabled: toBoolean(merged.dailyLimitEnabled, DEFAULT_LEAD_FLOW_CONFIG.dailyLimitEnabled),
    dailyLimit: Math.max(0, toNumber(merged.dailyLimit, DEFAULT_LEAD_FLOW_CONFIG.dailyLimit)),
    lastAssignedIndex: toNumber(merged.lastAssignedIndex, DEFAULT_LEAD_FLOW_CONFIG.lastAssignedIndex),
    updatedAt: typeof merged.updatedAt === 'string' && merged.updatedAt
      ? merged.updatedAt
      : DEFAULT_LEAD_FLOW_CONFIG.updatedAt,
  };
}

function ensureLeadFlowConfig(): LeadFlowConfig {
  const existing = getStorageData<StoredLeadFlowConfig>(STORAGE_KEYS.LEAD_FLOW_CONFIG);
  const config = normalizeLeadFlowConfig(existing);
  if (!existing || JSON.stringify(existing) !== JSON.stringify(config)) {
    setStorageData(STORAGE_KEYS.LEAD_FLOW_CONFIG, config);
  }
  return config;
}

function normalizeText(value?: string): string {
  return (value || '').trim().toLowerCase();
}

function isPersonalResource(value?: string): boolean {
  return normalizeResourceOwnership(value) === '个人资源';
}

function validateAttribution(data: Partial<Lead>): string | null {
  if (isPersonalResource(data.sourceType) && !data.leadContributorName && !data.leadContributorId) {
    return '个人资源必须填写线索贡献人';
  }
  return null;
}

function getActiveSalesUsers(): User[] {
  const users = getStorageData<User[]>(STORAGE_KEYS.USERS) || [];
  const { roles } = ensureOrganizationConfigData();
  return users.filter((user) => canReceiveLead(user, roles));
}

function getConfiguredParticipants(config: LeadFlowConfig): User[] {
  const activeSales = getActiveSalesUsers();
  if (!config.participantUserIds.length) return activeSales;
  const selected = activeSales.filter((user) => config.participantUserIds.includes(user.id));
  return selected.length ? selected : activeSales;
}

function findCollision(data: Partial<Lead>, excludeLeadId?: string) {
  const phone = normalizePhoneForComparison(data.phone);
  const wechat = normalizeText(data.wechat);
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const leads = (getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || []).filter((lead) => lead.id !== excludeLeadId);

  if (phone) {
    const customer = customers.find((item) => normalizePhoneForComparison(item.phone) === phone);
    if (customer) return { type: '客户' as const, id: customer.id, name: customer.name, field: '手机号' };
    const lead = leads.find((item) => item.intakeStatus !== '入库失败' && normalizePhoneForComparison(item.phone) === phone);
    if (lead) return { type: '线索' as const, id: lead.id, name: lead.name, field: '手机号' };
  }

  if (wechat) {
    const customer = customers.find((item) => normalizeText(item.wechat) === wechat);
    if (customer) return { type: '客户' as const, id: customer.id, name: customer.name, field: '微信' };
    const lead = leads.find((item) => item.intakeStatus !== '入库失败' && normalizeText(item.wechat) === wechat);
    if (lead) return { type: '线索' as const, id: lead.id, name: lead.name, field: '微信' };
  }

  return null;
}

function validateUniqueInput(data: Partial<Lead>): string | null {
  const hasPhone = Boolean(normalizeText(data.phone));
  const hasWechat = Boolean(normalizeText(data.wechat));
  if (!hasPhone && !hasWechat) return '手机号和微信至少填写一项';
  if (hasPhone) return getPhoneNumberError(data.phone) || null;
  return null;
}

function countAssignedToday(userName: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const records = getStorageData<LeadIntakeRecord[]>(STORAGE_KEYS.LEAD_INTAKE_RECORDS) || [];
  return records.filter((record) => record.createdAt.slice(0, 10) === today && record.assignedTo === userName).length;
}

function formatLeadSourceText(lead: Partial<Lead>): string | undefined {
  return [lead.source, lead.sourceName].filter(Boolean).join('-') || undefined;
}

function assignLeadOwner(config: LeadFlowConfig, fallbackOwner?: string): { owner: string; assignedTo?: string; assignedAt?: string; assignmentRuleId?: string; assignmentStatus: '待分配' | '已分配待领取'; reason: string; nextIndex: number } {
  if (!config.autoAssignEnabled) {
    if (fallbackOwner && fallbackOwner !== '待分配') {
      const now = new Date().toISOString();
      return { owner: fallbackOwner, assignedTo: fallbackOwner, assignedAt: now, assignmentStatus: '已分配待领取', reason: '手动指定销售', nextIndex: config.lastAssignedIndex };
    }
    return { owner: '待分配', assignmentStatus: '待分配', reason: '线索自动分配未开启', nextIndex: config.lastAssignedIndex };
  }

  const participants = getConfiguredParticipants(config);
  if (!participants.length) {
    return { owner: '待分配', assignmentStatus: '待分配', reason: '暂无可分配销售成员', nextIndex: config.lastAssignedIndex };
  }

  for (let step = 1; step <= participants.length; step += 1) {
    const index = (config.lastAssignedIndex + step) % participants.length;
    const user = participants[index];
    if (config.dailyLimitEnabled && countAssignedToday(user.name) >= config.dailyLimit) continue;
    const now = new Date().toISOString();
    return {
      owner: user.name,
      assignedTo: user.name,
      assignedAt: now,
      assignmentRuleId: config.id,
      assignmentStatus: '已分配待领取',
      reason: '顺序平均分配',
      nextIndex: index,
    };
  }

  return { owner: '待分配', assignmentStatus: '待分配', reason: '今日分配上限已达', nextIndex: config.lastAssignedIndex };
}

function upsertCustomerFromLead(lead: Lead): Customer {
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const now = new Date().toISOString();
  const customerId = lead.customerId || `cust-${uuidv4().slice(0, 8)}`;
  const idx = customers.findIndex((customer) => customer.id === customerId);
  const base: Customer = {
    id: customerId,
    name: lead.name,
    company: lead.company || lead.name,
    phone: lead.phone,
    email: lead.email,
    wechat: lead.wechat,
    industry: lead.industry,
    city: lead.city,
    owner: lead.owner,
    lifecycleStatusCode: lead.lifecycleStatusCode || LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
    lifecycleStatusUpdatedAt: lead.lifecycleStatusUpdatedAt || now,
    customerLevel: 'L1',
    totalSpent: 0,
    orderCount: 0,
    growthPath: [],
    growthRecords: [],
    activityRecords: [{
      id: `act-${uuidv4().slice(0, 8)}`,
      type: 'create',
      title: '线索入库创建客户',
      content: lead.remark,
      operator: SYSTEM_OPERATOR,
      relatedId: lead.id,
      relatedType: 'lead',
      createdAt: now,
    }],
    tags: lead.tags,
    leadInputBy: lead.inputBy,
    leadContributorId: lead.leadContributorId,
    leadContributorName: lead.leadContributorName,
    leadSource: lead.source,
    remark: lead.remark,
    sourceType: normalizeResourceOwnership(lead.sourceType),
    sourceName: lead.sourceName,
    sourceAccount: lead.sourceAccount,
    score: lead.score,
    createdAt: now,
    updatedAt: now,
  };

  if (idx === -1) {
    customers.unshift(base);
    setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
    return base;
  }

  customers[idx] = {
    ...customers[idx],
    name: lead.name,
    company: lead.company || lead.name,
    phone: lead.phone,
    email: lead.email,
    wechat: lead.wechat,
    industry: lead.industry,
    city: lead.city,
    owner: lead.owner,
    lifecycleStatusCode: lead.lifecycleStatusCode || customers[idx].lifecycleStatusCode || LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
    lifecycleStatusUpdatedAt: lead.lifecycleStatusUpdatedAt || customers[idx].lifecycleStatusUpdatedAt || now,
    tags: lead.tags,
    leadInputBy: lead.inputBy,
    leadContributorId: lead.leadContributorId,
    leadContributorName: lead.leadContributorName,
    leadSource: lead.source,
    remark: lead.remark,
    sourceType: normalizeResourceOwnership(lead.sourceType),
    sourceName: lead.sourceName,
    sourceAccount: lead.sourceAccount,
    score: lead.score,
    activityRecords: [{
      id: `act-${uuidv4().slice(0, 8)}`,
      type: 'update',
      title: '线索资料同步更新客户',
      content: lead.remark,
      operator: getCurrentOperatorName(SYSTEM_OPERATOR),
      relatedId: lead.id,
      relatedType: 'lead',
      createdAt: now,
    }, ...(customers[idx].activityRecords || [])],
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
  return customers[idx];
}

function appendIntakeRecord(record: LeadIntakeRecord): void {
  const records = getStorageData<LeadIntakeRecord[]>(STORAGE_KEYS.LEAD_INTAKE_RECORDS) || [];
  setStorageData(STORAGE_KEYS.LEAD_INTAKE_RECORDS, [record, ...records]);
}

async function fetchLeadFlowConfig(): Promise<ApiResponse<LeadFlowConfig>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(ensureLeadFlowConfig());
}

async function updateLeadFlowConfig(data: Partial<LeadFlowConfig>): Promise<ApiResponse<LeadFlowConfig>> {
  ensureInit();
  await delay(150);
  const current = ensureLeadFlowConfig();
  const next = normalizeLeadFlowConfig({ ...current, ...data, updatedAt: new Date().toISOString() });
  setStorageData(STORAGE_KEYS.LEAD_FLOW_CONFIG, next);
  return createSuccessResponse(next);
}

async function fetchIntakeRecords(filters?: { status?: string; search?: string; page?: number; pageSize?: number }): Promise<ApiResponse<PaginatedResponse<LeadIntakeRecord>>> {
  ensureInit();
  await delay(150);
  let records = getStorageData<LeadIntakeRecord[]>(STORAGE_KEYS.LEAD_INTAKE_RECORDS) || [];
  if (filters?.status) records = records.filter((record) => record.status === filters.status);
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    records = records.filter((record) => (
      record.name.toLowerCase().includes(q)
      || (record.company || '').toLowerCase().includes(q)
      || (record.phone || '').includes(q)
      || (record.wechat || '').toLowerCase().includes(q)
    ));
  }
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const total = records.length;
  const totalPages = Math.ceil(total / pageSize);
  return createSuccessResponse({
    items: records.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total, totalPages },
  });
}

async function cleanupIntakeRecord(id: string, reason: string): Promise<ApiResponse<boolean>> {
  ensureInit();
  await delay(120);
  if (!isSuperAdminRoleName(getCurrentOperatorUser()?.role)) {
    return createErrorResponse('仅超级管理员可以清理线索入库记录', 403);
  }
  const normalizedReason = reason.trim();
  if (!normalizedReason) return createErrorResponse('清理线索入库记录必须填写原因');

  const records = getStorageData<LeadIntakeRecord[]>(STORAGE_KEYS.LEAD_INTAKE_RECORDS) || [];
  if (!records.some((record) => record.id === id)) return createErrorResponse('线索入库记录不存在', 404);
  setStorageData(STORAGE_KEYS.LEAD_INTAKE_RECORDS, records.filter((record) => record.id !== id));
  return createSuccessResponse(true);
}

function intakeLead(data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'followUpRecords'>): { lead: Lead | null; message: string } {
  const config = ensureLeadFlowConfig();
  const now = new Date().toISOString();
  const ruleName = '手机号和微信二选一';
  const normalizedData = { ...data, phone: normalizePhoneForStorage(data.phone) };
  const validationError = validateAttribution(normalizedData) || validateUniqueInput(normalizedData);

  if (validationError) {
    appendIntakeRecord({
      id: `intake-${uuidv4().slice(0, 8)}`,
      name: normalizedData.name,
      company: normalizedData.company,
      phone: normalizedData.phone,
      wechat: normalizedData.wechat,
      source: formatLeadSourceText(normalizedData),
      inputBy: normalizedData.inputBy,
      status: '入库失败',
      matchedRule: ruleName,
      failureReason: validationError,
      createdAt: now,
    });
    return { lead: null, message: validationError };
  }

  const collision = config.interceptionEnabled ? findCollision(normalizedData) : null;
  if (collision) {
    const failureReason = `${collision.field}已存在于${collision.type}库：${collision.name}`;
    appendIntakeRecord({
      id: `intake-${uuidv4().slice(0, 8)}`,
      name: normalizedData.name,
      company: normalizedData.company,
      phone: normalizedData.phone,
      wechat: normalizedData.wechat,
      source: formatLeadSourceText(normalizedData),
      inputBy: normalizedData.inputBy,
      status: '入库失败',
      matchedRule: ruleName,
      failureReason,
      collisionTargetType: collision.type,
      collisionTargetId: collision.id,
      collisionTargetName: collision.name,
      createdAt: now,
    });
    return { lead: null, message: failureReason };
  }

  const assignment = assignLeadOwner(config, normalizedData.owner);
  const leadId = `lead-${uuidv4().slice(0, 8)}`;
  const lead: Lead = {
    ...normalizedData,
    id: leadId,
    owner: assignment.owner,
    assignedTo: assignment.assignedTo,
    assignedAt: assignment.assignedAt,
    assignmentRuleId: assignment.assignmentRuleId,
    intakeStatus: '入库成功',
    lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
    lifecycleStatus: '待跟进',
    sourceType: normalizeResourceOwnership(data.sourceType),
    lifecycleStatusUpdatedAt: now,
    followUpRecords: [],
    createdAt: now,
    updatedAt: now,
  };
  const leadWithLifecycle = hydrateLeadLifecycle(lead);
  const storedLead = leadWithLifecycle;
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  setStorageData(STORAGE_KEYS.LEADS, [storedLead, ...leads]);
  setStorageData(STORAGE_KEYS.LEAD_FLOW_CONFIG, { ...config, lastAssignedIndex: assignment.nextIndex, updatedAt: now });
  appendIntakeRecord({
    id: `intake-${uuidv4().slice(0, 8)}`,
    leadId: storedLead.id,
    name: storedLead.name,
    company: storedLead.company,
    phone: storedLead.phone,
    wechat: storedLead.wechat,
    source: formatLeadSourceText(storedLead),
    inputBy: storedLead.inputBy,
    assignedTo: storedLead.assignedTo,
    status: '入库成功',
    matchedRule: assignment.reason,
    createdAt: now,
  });
  return { lead: storedLead, message: '入库成功' };
}

function syncCustomerByLead(lead: Lead): void {
  if (!lead.customerId) return;
  upsertCustomerFromLead(lead);
}

async function manualAssignLead(leadId: string, userName: string): Promise<ApiResponse<Lead | null>> {
  ensureInit();
  await delay(150);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const idx = leads.findIndex((lead) => lead.id === leadId);
  if (idx === -1) return createSuccessResponse(null);
  const now = new Date().toISOString();
  const beforeAssignee = leads[idx].assignedTo || leads[idx].owner || '';
  const changed = beforeAssignee !== userName;
  const operator = getCurrentOperatorName(leads[idx].inputBy || leads[idx].owner);
  let nextLead = hydrateLeadLifecycle({
    ...leads[idx],
    owner: userName,
    assignedTo: userName,
    assignedAt: changed ? now : leads[idx].assignedAt,
    intakeStatus: '入库成功',
    lifecycleStatusCode: leads[idx].lifecycleStatusCode || LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
    lifecycleStatus: leads[idx].lifecycleStatus || '待跟进',
    lifecycleStatusUpdatedAt: changed ? now : leads[idx].lifecycleStatusUpdatedAt,
    changeHistory: changed
      ? [{
        id: `hist-${uuidv4().slice(0, 8)}`,
        action: 'update',
        operator,
        changedAt: now,
        summary: '修改了分配销售',
        changes: [{
          field: 'assignedTo',
          label: '分配销售',
          oldValue: beforeAssignee || null,
          newValue: userName,
        }],
      }, ...(leads[idx].changeHistory || [])]
      : leads[idx].changeHistory,
    updatedAt: now,
  });
  leads[idx] = nextLead;
  setStorageData(STORAGE_KEYS.LEADS, leads);
  if (leads[idx].customerId) syncCustomerByLead(leads[idx]);
  return createSuccessResponse(leads[idx]);
}

async function claimLeadAsCustomer(leadId: string, userName: string): Promise<ApiResponse<Lead | null>> {
  ensureInit();
  await delay(150);
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const idx = leads.findIndex((lead) => lead.id === leadId);
  if (idx === -1) return createSuccessResponse(null);
  const now = new Date().toISOString();
  const beforeAssignee = leads[idx].assignedTo || leads[idx].owner || '';
  const changed = beforeAssignee !== userName;
  const operator = getCurrentOperatorName(leads[idx].inputBy || leads[idx].owner);
  let nextLead = hydrateLeadLifecycle({
    ...leads[idx],
    owner: userName,
    assignedTo: userName,
    assignedAt: changed || !leads[idx].assignedAt ? now : leads[idx].assignedAt,
    intakeStatus: '入库成功',
    lifecycleStatusCode: LIFECYCLE_STATUS_CODES.FOLLOWING,
    lifecycleStatus: '跟进中',
    lifecycleStatusUpdatedAt: now,
    changeHistory: [({
      id: `hist-${uuidv4().slice(0, 8)}`,
      action: 'update' as const,
      operator,
      changedAt: now,
      summary: changed ? '领取线索并开始跟进' : '开始跟进线索',
      changes: changed
        ? [{
            field: 'assignedTo',
            label: '分配销售',
            oldValue: beforeAssignee || null,
            newValue: userName,
          }, {
            field: 'lifecycleStatus',
            label: '生命周期',
            oldValue: leads[idx].lifecycleStatus || '待跟进',
            newValue: '跟进中',
          }]
        : [{
            field: 'lifecycleStatus',
            label: '生命周期',
            oldValue: leads[idx].lifecycleStatus || '待跟进',
            newValue: '跟进中',
          }],
    }), ...(leads[idx].changeHistory || [])],
    updatedAt: now,
  });
  const customer = upsertCustomerFromLead(nextLead);
  nextLead = { ...nextLead, customerId: customer.id };
  leads[idx] = nextLead;
  setStorageData(STORAGE_KEYS.LEADS, leads);
  syncCustomerByLead(leads[idx]);
  return createSuccessResponse(leads[idx]);
}

export const leadFlowApi = {
  fetchLeadFlowConfig,
  updateLeadFlowConfig,
  fetchIntakeRecords,
  cleanupIntakeRecord,
  intakeLead,
  syncCustomerByLead,
  manualAssignLead,
  claimLeadAsCustomer,
};
