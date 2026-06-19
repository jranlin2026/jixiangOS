import type { Customer } from '../types/customer';
import type { Lead, LeadFlowConfig, LeadIntakeRecord } from '../types/lead';
import type { User } from '../types/settings';
import type { ApiResponse, PaginatedResponse } from './types';
import { createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { DEFAULT_LEAD_FLOW_CONFIG, DEFAULT_PAGE_SIZE, STORAGE_KEYS, normalizeResourceOwnership } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { v4 as uuidv4 } from 'uuid';

function ensureInit(): void {
  initializeMockData();
  ensureLeadFlowConfig();
}

function ensureLeadFlowConfig(): LeadFlowConfig {
  const existing = getStorageData<LeadFlowConfig>(STORAGE_KEYS.LEAD_FLOW_CONFIG);
  const config = {
    ...DEFAULT_LEAD_FLOW_CONFIG,
    ...(existing || {}),
  } as LeadFlowConfig;
  if (!existing) setStorageData(STORAGE_KEYS.LEAD_FLOW_CONFIG, config);
  return config;
}

function normalizeText(value?: string): string {
  return (value || '').trim().toLowerCase();
}

function getActiveSalesUsers(): User[] {
  const users = getStorageData<User[]>(STORAGE_KEYS.USERS) || [];
  return users.filter((user) => user.isActive && (user.role === '销售' || user.role === '销售经理'));
}

function getConfiguredParticipants(config: LeadFlowConfig): User[] {
  const activeSales = getActiveSalesUsers();
  if (!config.participantUserIds.length) return activeSales;
  const selected = activeSales.filter((user) => config.participantUserIds.includes(user.id));
  return selected.length ? selected : activeSales;
}

function findCollision(data: Partial<Lead>, excludeLeadId?: string) {
  const phone = normalizeText(data.phone);
  const wechat = normalizeText(data.wechat);
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const leads = (getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || []).filter((lead) => lead.id !== excludeLeadId);

  if (phone) {
    const customer = customers.find((item) => normalizeText(item.phone) === phone);
    if (customer) return { type: '客户' as const, id: customer.id, name: customer.name, field: '手机号' };
    const lead = leads.find((item) => item.intakeStatus !== '入库失败' && normalizeText(item.phone) === phone);
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

function validateUniqueInput(config: LeadFlowConfig, data: Partial<Lead>): string | null {
  const hasPhone = Boolean(normalizeText(data.phone));
  const hasWechat = Boolean(normalizeText(data.wechat));
  if (config.uniqueKeyMode === 'phone' && !hasPhone) return '手机号为必填唯一标识';
  if (config.uniqueKeyMode === 'wechat' && !hasWechat) return '微信为必填唯一标识';
  if (config.uniqueKeyMode === 'phone_or_wechat' && !hasPhone && !hasWechat) return '手机号和微信至少填写一项';
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

function assignLeadOwner(config: LeadFlowConfig, fallbackOwner?: string): { owner: string; assignedTo?: string; assignedAt?: string; assignmentRuleId?: string; status: '入库成功' | '待分配'; reason: string; nextIndex: number } {
  if (!config.autoAssignEnabled) {
    if (fallbackOwner && fallbackOwner !== '待分配') {
      const now = new Date().toISOString();
      return { owner: fallbackOwner, assignedTo: fallbackOwner, assignedAt: now, status: '入库成功', reason: '手动指定销售', nextIndex: config.lastAssignedIndex };
    }
    return { owner: '待分配', status: '待分配', reason: '商机自动分配未开启', nextIndex: config.lastAssignedIndex };
  }

  const participants = getConfiguredParticipants(config);
  if (!participants.length) {
    return { owner: '待分配', status: '待分配', reason: '暂无可分配销售成员', nextIndex: config.lastAssignedIndex };
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
      status: '入库成功',
      reason: '顺序平均分配',
      nextIndex: index,
    };
  }

  return { owner: '待分配', status: '待分配', reason: '今日分配上限已达', nextIndex: config.lastAssignedIndex };
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
      operator: lead.inputBy || lead.owner || '系统',
      relatedId: lead.id,
      relatedType: 'lead',
      createdAt: now,
    }],
    tags: lead.tags,
    leadInputBy: lead.inputBy,
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
    tags: lead.tags,
    leadInputBy: lead.inputBy,
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
      operator: lead.inputBy || lead.owner || '系统',
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
  const next = { ...current, ...data, updatedAt: new Date().toISOString() };
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

function intakeLead(data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'followUpRecords'>): { lead: Lead | null; message: string } {
  const config = ensureLeadFlowConfig();
  const now = new Date().toISOString();
  const ruleName = config.uniqueKeyMode === 'phone' ? '手机号唯一' : config.uniqueKeyMode === 'wechat' ? '微信唯一' : '手机号和微信二选一';
  const validationError = validateUniqueInput(config, data);

  if (validationError) {
    appendIntakeRecord({
      id: `intake-${uuidv4().slice(0, 8)}`,
      name: data.name,
      company: data.company,
      phone: data.phone,
      wechat: data.wechat,
      source: formatLeadSourceText(data),
      inputBy: data.inputBy,
      status: '入库失败',
      matchedRule: ruleName,
      failureReason: validationError,
      createdAt: now,
    });
    return { lead: null, message: validationError };
  }

  const collision = config.interceptionEnabled ? findCollision(data) : null;
  if (collision) {
    const failureReason = `${collision.field}已存在于${collision.type}库：${collision.name}`;
    appendIntakeRecord({
      id: `intake-${uuidv4().slice(0, 8)}`,
      name: data.name,
      company: data.company,
      phone: data.phone,
      wechat: data.wechat,
      source: formatLeadSourceText(data),
      inputBy: data.inputBy,
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

  const assignment = assignLeadOwner(config, data.owner);
  const leadId = `lead-${uuidv4().slice(0, 8)}`;
  const lead: Lead = {
    ...data,
    id: leadId,
    owner: assignment.owner,
    assignedTo: assignment.assignedTo,
    assignedAt: assignment.assignedAt,
    assignmentRuleId: assignment.assignmentRuleId,
    intakeStatus: assignment.status,
    lifecycleStatus: data.lifecycleStatus || '待跟进',
    sourceType: normalizeResourceOwnership(data.sourceType),
    lifecycleStatusUpdatedAt: now,
    followUpRecords: [],
    createdAt: now,
    updatedAt: now,
  };
  const customer = upsertCustomerFromLead(lead);
  const leadWithCustomer = { ...lead, customerId: customer.id };
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  setStorageData(STORAGE_KEYS.LEADS, [leadWithCustomer, ...leads]);
  setStorageData(STORAGE_KEYS.LEAD_FLOW_CONFIG, { ...config, lastAssignedIndex: assignment.nextIndex, updatedAt: now });
  appendIntakeRecord({
    id: `intake-${uuidv4().slice(0, 8)}`,
    leadId: leadWithCustomer.id,
    customerId: customer.id,
    name: leadWithCustomer.name,
    company: leadWithCustomer.company,
    phone: leadWithCustomer.phone,
    wechat: leadWithCustomer.wechat,
    source: formatLeadSourceText(leadWithCustomer),
    inputBy: leadWithCustomer.inputBy,
    assignedTo: leadWithCustomer.assignedTo,
    status: assignment.status,
    matchedRule: assignment.reason,
    failureReason: assignment.status === '待分配' ? assignment.reason : undefined,
    createdAt: now,
  });
  return { lead: leadWithCustomer, message: assignment.status === '待分配' ? assignment.reason : '入库成功' };
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
  leads[idx] = {
    ...leads[idx],
    owner: userName,
    assignedTo: userName,
    assignedAt: changed ? now : leads[idx].assignedAt,
    intakeStatus: '入库成功',
    changeHistory: changed
      ? [{
        id: `hist-${uuidv4().slice(0, 8)}`,
        action: 'update',
        operator: userName,
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
  };
  setStorageData(STORAGE_KEYS.LEADS, leads);
  syncCustomerByLead(leads[idx]);
  return createSuccessResponse(leads[idx]);
}

export const leadFlowApi = {
  fetchLeadFlowConfig,
  updateLeadFlowConfig,
  fetchIntakeRecords,
  intakeLead,
  syncCustomerByLead,
  manualAssignLead,
};
