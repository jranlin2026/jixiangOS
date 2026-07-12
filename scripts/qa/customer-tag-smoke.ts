import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { Customer } from '../../src/types/customer';
import type { Lead } from '../../src/types/lead';
import type { CustomerTag, CustomerTagCatalog, CustomerTagGroup } from '../../src/types/tag';

type Envelope<T> = { code: number; data: T; message?: string };
type Login = { token: string; user: { id: string; name: string } };
type CustomerPage = { items: Customer[]; total: number };

const prisma = new PrismaClient();
const baseUrl = String(process.env.QA_API_BASE || 'http://127.0.0.1:3001/api').replace(/\/$/, '');
const target = new URL(baseUrl);
if (process.env.NODE_ENV === 'production' || !new Set(['127.0.0.1', 'localhost', '::1']).has(target.hostname)) {
  throw new Error('customer-tag-smoke only runs against a loopback non-production API');
}

const adminAccount = String(process.env.QA_ADMIN_ACCOUNT || '').trim();
const adminPassword = String(process.env.QA_ADMIN_PASSWORD || '');
const salesAccount = String(process.env.QA_SALES_ACCOUNT || '').trim();
const salesPassword = String(process.env.QA_SALES_PASSWORD || '');
if (!adminAccount || !adminPassword || !salesAccount || !salesPassword) {
  throw new Error('QA admin and sales credentials are required through environment variables');
}

const runId = randomUUID().slice(0, 12);
const prefix = `qa-tag-${runId}`;
const customerIds = ['a', 'b', 'both', 'empty'].map((suffix) => `${prefix}-customer-${suffix}`);
const leadId = `${prefix}-lead`;
let adminToken = '';
let salesToken = '';
const createdGroupIds: string[] = [];
const createdTagIds: string[] = [];

async function raw<T>(path: string, init: RequestInit = {}, token = '') {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const payload = await response.json() as Envelope<T>;
  return { response, payload };
}

async function ok<T>(path: string, init: RequestInit = {}, token = ''): Promise<T> {
  const result = await raw<T>(path, init, token);
  assert.equal(result.payload.code, 0, `${path}: ${result.payload.message || result.response.status}`);
  return result.payload.data;
}

const json = (method: string, value: unknown): RequestInit => ({ method, body: JSON.stringify(value) });
const login = (account: string, password: string) => ok<Login>('/auth/login', json('POST', { account, password, remember: false }));

async function cleanup() {
  if (adminToken) await raw('/auth/logout', { method: 'POST' }, adminToken).catch(() => undefined);
  if (salesToken) await raw('/auth/logout', { method: 'POST' }, salesToken).catch(() => undefined);
  await prisma.$transaction([
    prisma.businessRecord.deleteMany({ where: { domain: STORAGE_KEYS.CUSTOMERS, recordId: { in: customerIds } } }),
    prisma.leadRecord.deleteMany({ where: { id: leadId } }),
    prisma.businessRecord.deleteMany({ where: { domain: STORAGE_KEYS.TAGS, recordId: { in: createdTagIds } } }),
    prisma.businessRecord.deleteMany({ where: { domain: STORAGE_KEYS.TAG_GROUPS, recordId: { in: createdGroupIds } } }),
  ]);
}

function customer(id: string, owner: string, manualTagIds: string[]): Customer {
  const timestamp = new Date().toISOString();
  return {
    id, name: `${prefix}-${id.split('-').pop()}`, company: `${prefix}-company`, phone: `199${Math.random().toString().slice(2, 10)}`,
    owner, customerLevel: 'L1', lifecycleStatusCode: 'following', lifecycleStatusUpdatedAt: timestamp,
    sourceType: '公司资源', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], activityRecords: [],
    manualTagIds, createdAt: timestamp, updatedAt: timestamp,
  };
}

try {
  const admin = await login(adminAccount, adminPassword);
  adminToken = admin.token;
  const sales = await login(salesAccount, salesPassword);
  salesToken = sales.token;

  const forbidden = await raw('/customer-tags/groups', json('POST', { name: `${prefix}-forbidden` }), salesToken);
  assert.equal(forbidden.response.status, 403);
  assert.equal(forbidden.payload.code, 403);

  const sharedGroup = await ok<CustomerTagGroup>('/customer-tags/groups', json('POST', {
    name: `${prefix}-shared`, selectionMode: 'multiple', scope: 'both', color: '#1677ff',
  }), adminToken);
  createdGroupIds.push(sharedGroup.id);
  const leadGroup = await ok<CustomerTagGroup>('/customer-tags/groups', json('POST', {
    name: `${prefix}-lead-only`, selectionMode: 'single', scope: 'lead', color: '#8c8c8c',
  }), adminToken);
  createdGroupIds.push(leadGroup.id);

  const sharedA = await ok<CustomerTag>('/customer-tags', json('POST', { groupId: sharedGroup.id, name: `${prefix}-shared-a` }), adminToken);
  createdTagIds.push(sharedA.id);
  const sharedB = await ok<CustomerTag>('/customer-tags', json('POST', { groupId: sharedGroup.id, name: `${prefix}-shared-b` }), adminToken);
  createdTagIds.push(sharedB.id);
  const leadOnly = await ok<CustomerTag>('/customer-tags', json('POST', { groupId: leadGroup.id, name: `${prefix}-lead-a` }), adminToken);
  createdTagIds.push(leadOnly.id);
  const leadOnlySecond = await ok<CustomerTag>('/customer-tags', json('POST', { groupId: leadGroup.id, name: `${prefix}-lead-b` }), adminToken);
  createdTagIds.push(leadOnlySecond.id);

  const timestamp = new Date().toISOString();
  const lead: Lead = {
    id: leadId, name: `${prefix}-lead`, company: `${prefix}-lead-company`, phone: `198${runId.replace(/\D/g, '').padEnd(8, '0').slice(0, 8)}`,
    source: 'QA', status: '新线索', lifecycleStatusCode: 'following', lifecycleStatusUpdatedAt: timestamp,
    owner: sales.user.name, assignedTo: sales.user.name, sourceType: '公司资源', manualTagIds: [],
    createdAt: timestamp, updatedAt: timestamp, followUpRecords: [],
  };
  const fixtures = [
    customer(customerIds[0], sales.user.name, [sharedA.id]),
    customer(customerIds[1], sales.user.name, [sharedB.id]),
    customer(customerIds[2], sales.user.name, [sharedA.id, sharedB.id]),
    customer(customerIds[3], sales.user.name, []),
  ];
  await prisma.$transaction([
    ...fixtures.map((value) => prisma.businessRecord.create({ data: {
      id: `${STORAGE_KEYS.CUSTOMERS}:${value.id}`, domain: STORAGE_KEYS.CUSTOMERS, recordId: value.id,
      title: value.name, status: value.lifecycleStatusCode, owner: value.owner, customerId: value.id,
      eventAt: new Date(timestamp), data: value as unknown as Prisma.InputJsonValue,
    } })),
    prisma.leadRecord.create({ data: {
      id: lead.id, name: lead.name, company: lead.company, phone: lead.phone, source: lead.source, status: lead.status,
      lifecycleStatusCode: lead.lifecycleStatusCode, owner: lead.owner, assignedTo: lead.assignedTo,
      data: lead as unknown as Prisma.InputJsonValue,
    } }),
  ]);

  await ok(`/leads/${encodeURIComponent(leadId)}`, json('PUT', { manualTagIds: [sharedA.id, leadOnly.id] }), salesToken);
  const conflict = await raw(`/leads/${encodeURIComponent(leadId)}`, json('PUT', { manualTagIds: [sharedA.id, leadOnly.id, leadOnlySecond.id] }), salesToken);
  assert.equal(conflict.payload.code, 400, 'single-select group must reject two active selections');
  await ok(`/leads/${encodeURIComponent(leadId)}`, json('PUT', { manualTagIds: [sharedA.id, leadOnlySecond.id] }), salesToken);

  const converted = await ok<Lead>(`/leads/${encodeURIComponent(leadId)}/convert`, { method: 'POST' }, salesToken);
  assert.ok(converted.customerId);
  customerIds.push(converted.customerId!);
  const [storedLead, storedCustomer] = await Promise.all([
    prisma.leadRecord.findUnique({ where: { id: leadId } }),
    prisma.businessRecord.findUnique({ where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: converted.customerId! } } }),
  ]);
  assert.deepEqual((storedLead?.data as any).manualTagIds, [sharedA.id, leadOnlySecond.id], 'lead-only history must remain on lead');
  assert.deepEqual((storedCustomer?.data as any).manualTagIds, [sharedA.id], 'customer inherits only shared tags');

  const query = async (mode: 'grouped' | 'any' | 'all') => {
    const params = new URLSearchParams({ search: prefix, tagMatch: mode, page: '1', pageSize: '100' });
    params.append('tagId', sharedA.id); params.append('tagId', sharedB.id);
    return ok<CustomerPage>(`/customers?${params}`, {}, salesToken);
  };
  const [grouped, any, all] = await Promise.all([query('grouped'), query('any'), query('all')]);
  assert.deepEqual(new Set(grouped.items.map((item) => item.id)), new Set([customerIds[0], customerIds[1], customerIds[2]]));
  assert.deepEqual(new Set(any.items.map((item) => item.id)), new Set([customerIds[0], customerIds[1], customerIds[2]]));
  assert.deepEqual(all.items.map((item) => item.id), [customerIds[2]]);

  const assignmentBeforeRename = await prisma.businessRecord.findUnique({
    where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: customerIds[0] } },
  });
  const renamed = `${prefix}-renamed`;
  await ok(`/customer-tags/${encodeURIComponent(sharedA.id)}`, json('PUT', { name: renamed }), adminToken);
  const catalog = await ok<CustomerTagCatalog>('/customer-tags/catalog?scope=all&includeInactive=true', {}, adminToken);
  assert.equal(catalog.tags.find((tag) => tag.id === sharedA.id)?.name, renamed, 'rename must resolve through stable ID');
  const assignmentAfterRename = await prisma.businessRecord.findUnique({
    where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: customerIds[0] } },
  });
  assert.deepEqual(
    (assignmentAfterRename?.data as any).manualTagIds,
    (assignmentBeforeRename?.data as any).manualTagIds,
    'rename must not rewrite assignment IDs',
  );

  await ok(`/customer-tags/${encodeURIComponent(sharedB.id)}`, json('PUT', { isActive: false }), adminToken);
  const inactiveCatalog = await ok<CustomerTagCatalog>('/customer-tags/catalog?scope=all&includeInactive=true', {}, adminToken);
  assert.equal(inactiveCatalog.tags.find((tag) => tag.id === sharedB.id)?.isActive, false);
  const inactiveAssign = await raw(`/customers/${encodeURIComponent(customerIds[3])}`, json('PUT', { manualTagIds: [sharedB.id] }), salesToken);
  assert.equal(inactiveAssign.payload.code, 400, 'inactive tag cannot be newly assigned');

  process.stdout.write(`${JSON.stringify({ ok: true, runId, roleBoundary: 'sales=403', filters: { grouped: grouped.total, any: any.total, all: all.total }, conversionInherited: true })}\n`);
} finally {
  await cleanup().finally(() => prisma.$disconnect());
}
