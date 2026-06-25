import { Prisma, PrismaClient } from '@prisma/client';
import { ensureAdminUser } from '../src/shared/utils/auth';
import { DEFAULT_DEPARTMENTS, DEFAULT_POSITIONS, DEFAULT_ROLES } from '../src/shared/utils/organizationConfig';
import { mockUsers } from '../src/api/mock/data/users';
import { mockLeads } from '../src/api/mock/data/leads';
import { mockCustomers } from '../src/api/mock/data/customers';
import { mockOrders } from '../src/api/mock/data/orders';
import { mockDeliveries } from '../src/api/mock/data/deliveries';
import { mockCommissions } from '../src/api/mock/data/commissions';
import { mockFinanceDailyRecords, mockChannelROI } from '../src/api/mock/data/finance';
import { mockProducts } from '../src/api/mock/data/products';
import { mockProductLevelConfigs } from '../src/api/mock/data/productLevels';
import { mockRefunds } from '../src/api/mock/data/refunds';
import { mockUpgradePool } from '../src/api/mock/data/upgradePool';
import { mockCommissionRules } from '../src/api/mock/data/commissionRules';
import { mockTags } from '../src/api/mock/data/tags';
import {
  DEFAULT_LEAD_FLOW_CONFIG,
  DEFAULT_LEAD_SOURCE_CONFIGS,
  DEFAULT_LIFECYCLE_STATUS_CONFIGS,
  DEFAULT_ORDER_TYPE_CONFIGS,
  STORAGE_KEYS,
} from '../src/shared/utils/constants';

const prisma = new PrismaClient();

function parseDate(value: unknown): Date {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function upsertLeadRecords(leads: unknown[]) {
  for (const item of leads) {
    const lead = item as Record<string, any>;
    if (!lead?.id) continue;
    await prisma.leadRecord.upsert({
      where: { id: String(lead.id) },
      update: {
        name: String(lead.name || ''),
        company: lead.company || null,
        phone: lead.phone || null,
        wechat: lead.wechat || null,
        source: lead.source || null,
        status: lead.status || null,
        lifecycleStatusCode: lead.lifecycleStatusCode || null,
        owner: lead.owner || null,
        assignedTo: lead.assignedTo || null,
        inputBy: lead.inputBy || null,
        leadContributorId: lead.leadContributorId || null,
        data: lead as Prisma.InputJsonValue,
        createdAt: parseDate(lead.createdAt),
        updatedAt: parseDate(lead.updatedAt || lead.createdAt),
      },
      create: {
        id: String(lead.id),
        name: String(lead.name || ''),
        company: lead.company || null,
        phone: lead.phone || null,
        wechat: lead.wechat || null,
        source: lead.source || null,
        status: lead.status || null,
        lifecycleStatusCode: lead.lifecycleStatusCode || null,
        owner: lead.owner || null,
        assignedTo: lead.assignedTo || null,
        inputBy: lead.inputBy || null,
        leadContributorId: lead.leadContributorId || null,
        data: lead as Prisma.InputJsonValue,
        createdAt: parseDate(lead.createdAt),
        updatedAt: parseDate(lead.updatedAt || lead.createdAt),
      },
    });
  }
}

function storageRecordId(domain: string, item: Record<string, any>, index: number): string {
  return String(item.id || item.orderNo || item.refundNo || item.applicationNo || `${domain}-${index}`);
}

function storageBusinessId(domain: string, recordId: string): string {
  return `${domain}:${recordId}`.slice(0, 160);
}

function storageAmount(item: Record<string, any>): number | null {
  const value = item.actualAmount ?? item.amount ?? item.totalSpent ?? item.refundAmount ?? item.commissionAmount ?? item.estimatedAmount ?? item.price;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function storageTitle(domain: string, item: Record<string, any>): string | null {
  return item.name || item.customerName || item.orderNo || item.refundNo || item.applicationNo || item.title || item.subjectName || item.level || domain;
}

function storageOwner(item: Record<string, any>): string | null {
  return item.owner || item.ownerName || item.salesName || item.applicantName || item.createdBy || item.operator || null;
}

async function upsertBusinessRecords(domain: string, value: unknown) {
  if (!Array.isArray(value)) return;
  const recordIds: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index] as Record<string, any>;
    const recordId = storageRecordId(domain, item, index);
    recordIds.push(recordId);
    await prisma.businessRecord.upsert({
      where: { domain_recordId: { domain, recordId } },
      update: {
        title: storageTitle(domain, item),
        status: item.status || null,
        owner: storageOwner(item),
        customerId: item.customerId || null,
        orderId: item.orderId || null,
        amount: storageAmount(item),
        eventAt: item.updatedAt || item.createdAt ? parseDate(item.updatedAt || item.createdAt) : null,
        data: item as Prisma.InputJsonValue,
      },
      create: {
        id: storageBusinessId(domain, recordId),
        domain,
        recordId,
        title: storageTitle(domain, item),
        status: item.status || null,
        owner: storageOwner(item),
        customerId: item.customerId || null,
        orderId: item.orderId || null,
        amount: storageAmount(item),
        eventAt: item.updatedAt || item.createdAt ? parseDate(item.updatedAt || item.createdAt) : null,
        data: item as Prisma.InputJsonValue,
      },
    });
  }
  await prisma.businessRecord.deleteMany({ where: { domain, recordId: { notIn: recordIds } } });
}

async function main() {
  for (const department of DEFAULT_DEPARTMENTS) {
    await prisma.department.upsert({
      where: { id: department.id },
      update: {
        name: department.name,
        code: department.code,
        description: department.description,
        parentId: department.parentId,
        managerId: department.managerId,
        memberCount: department.memberCount,
        sortOrder: department.sortOrder || 0,
        isActive: department.isActive,
        updatedAt: new Date(department.updatedAt),
      },
      create: {
        id: department.id,
        name: department.name,
        code: department.code,
        description: department.description,
        parentId: department.parentId,
        managerId: department.managerId,
        memberCount: department.memberCount,
        sortOrder: department.sortOrder || 0,
        isActive: department.isActive,
        createdAt: new Date(department.createdAt),
        updatedAt: new Date(department.updatedAt),
      },
    });
  }

  for (const position of DEFAULT_POSITIONS) {
    await prisma.position.upsert({
      where: { id: position.id },
      update: {
        name: position.name,
        code: position.code,
        departmentId: position.departmentId,
        description: position.description,
        sortOrder: position.sortOrder,
        isActive: position.isActive,
        updatedAt: new Date(position.updatedAt),
      },
      create: {
        id: position.id,
        name: position.name,
        code: position.code,
        departmentId: position.departmentId,
        description: position.description,
        sortOrder: position.sortOrder,
        isActive: position.isActive,
        createdAt: new Date(position.createdAt),
        updatedAt: new Date(position.updatedAt),
      },
    });
  }

  for (const role of DEFAULT_ROLES) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: {
        name: role.name,
        code: role.code,
        description: role.description,
        departmentId: role.departmentId,
        permissions: role.permissions as unknown as Prisma.InputJsonValue,
        dataScopes: (role.dataScopes || {}) as Prisma.InputJsonValue,
        memberCount: role.memberCount,
        isActive: role.isActive,
        updatedAt: new Date(role.updatedAt),
      },
      create: {
        id: role.id,
        name: role.name,
        code: role.code,
        description: role.description,
        departmentId: role.departmentId,
        permissions: role.permissions as unknown as Prisma.InputJsonValue,
        dataScopes: (role.dataScopes || {}) as Prisma.InputJsonValue,
        memberCount: role.memberCount,
        isActive: role.isActive,
        createdAt: new Date(role.createdAt),
        updatedAt: new Date(role.updatedAt),
      },
    });
  }

  const users = ensureAdminUser(mockUsers);
  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        name: user.name,
        account: user.account,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        departmentId: user.departmentId,
        positionId: user.positionId,
        positionName: user.positionName,
        roleId: user.roleId,
        passwordHash: user.passwordHash,
        passwordSalt: user.passwordSalt,
        passwordUpdatedAt: user.passwordUpdatedAt ? new Date(user.passwordUpdatedAt) : null,
        lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
        isActive: user.isActive,
        employmentStatus: user.employmentStatus || 'active',
        leftAt: user.leftAt ? new Date(user.leftAt) : null,
        leftBy: user.leftBy,
        updatedAt: new Date(user.updatedAt),
      },
      create: {
        id: user.id,
        name: user.name,
        account: user.account,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        departmentId: user.departmentId,
        positionId: user.positionId,
        positionName: user.positionName,
        roleId: user.roleId,
        passwordHash: user.passwordHash,
        passwordSalt: user.passwordSalt,
        passwordUpdatedAt: user.passwordUpdatedAt ? new Date(user.passwordUpdatedAt) : null,
        lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
        isActive: user.isActive,
        employmentStatus: user.employmentStatus || 'active',
        leftAt: user.leftAt ? new Date(user.leftAt) : null,
        leftBy: user.leftBy,
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(user.updatedAt),
      },
    });
  }

  const storageSeeds: Array<{ key: string; value: unknown }> = [
    { key: STORAGE_KEYS.INITIALIZED, value: true },
    { key: STORAGE_KEYS.LEADS, value: mockLeads },
    { key: STORAGE_KEYS.CUSTOMERS, value: mockCustomers },
    { key: STORAGE_KEYS.ORDERS, value: mockOrders },
    { key: STORAGE_KEYS.DELIVERIES, value: mockDeliveries },
    { key: STORAGE_KEYS.COMMISSIONS, value: mockCommissions },
    { key: STORAGE_KEYS.FINANCE, value: { dailyRecords: mockFinanceDailyRecords, channelROI: mockChannelROI } },
    { key: STORAGE_KEYS.USERS, value: users },
    { key: STORAGE_KEYS.AI_SESSIONS, value: [] },
    { key: STORAGE_KEYS.DEPARTMENTS, value: DEFAULT_DEPARTMENTS },
    { key: STORAGE_KEYS.POSITIONS, value: DEFAULT_POSITIONS },
    { key: STORAGE_KEYS.ROLES, value: DEFAULT_ROLES },
    { key: STORAGE_KEYS.PRODUCTS, value: mockProducts },
    { key: STORAGE_KEYS.PRODUCT_LEVELS, value: mockProductLevelConfigs },
    { key: STORAGE_KEYS.ORDER_TYPE_CONFIGS, value: DEFAULT_ORDER_TYPE_CONFIGS },
    { key: STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS, value: DEFAULT_LIFECYCLE_STATUS_CONFIGS },
    { key: STORAGE_KEYS.REFUNDS, value: mockRefunds },
    { key: STORAGE_KEYS.UPGRADE_POOL, value: mockUpgradePool },
    { key: STORAGE_KEYS.AI_CARDS, value: [] },
    { key: STORAGE_KEYS.CUSTOMER_SUCCESS_TASKS, value: [] },
    { key: STORAGE_KEYS.SERVICE_TICKETS, value: [] },
    { key: STORAGE_KEYS.OPPORTUNITIES, value: [] },
    { key: STORAGE_KEYS.LEAD_FLOW_CONFIG, value: DEFAULT_LEAD_FLOW_CONFIG },
    { key: STORAGE_KEYS.LEAD_INTAKE_RECORDS, value: [] },
    { key: STORAGE_KEYS.LEAD_SOURCE_CONFIGS, value: DEFAULT_LEAD_SOURCE_CONFIGS },
    { key: STORAGE_KEYS.COMMISSION_RULES, value: mockCommissionRules },
    { key: STORAGE_KEYS.COMMISSION_ROLE_CONFIGS, value: [] },
    { key: STORAGE_KEYS.TAGS, value: mockTags },
  ];
  const businessDomains = new Set<string>([
    STORAGE_KEYS.CUSTOMERS,
    STORAGE_KEYS.ORDERS,
    STORAGE_KEYS.ORDER_APPLICATIONS,
    STORAGE_KEYS.DELIVERIES,
    STORAGE_KEYS.COMMISSIONS,
    STORAGE_KEYS.COMMISSION_OPERATION_LOGS,
    STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES,
    STORAGE_KEYS.REFUNDS,
    STORAGE_KEYS.UPGRADE_POOL,
    STORAGE_KEYS.OPPORTUNITIES,
    STORAGE_KEYS.CUSTOMER_SUCCESS_TASKS,
    STORAGE_KEYS.SERVICE_TICKETS,
    STORAGE_KEYS.AI_CARDS,
    STORAGE_KEYS.AI_SESSIONS,
    STORAGE_KEYS.PRODUCTS,
    STORAGE_KEYS.TAGS,
  ]);

  for (const item of storageSeeds) {
    const existing = await prisma.appStorage.findUnique({ where: { key: item.key } });
    await prisma.appStorage.upsert({
      where: { key: item.key },
      update: existing ? {} : { value: item.value as unknown as Prisma.InputJsonValue },
      create: { key: item.key, value: item.value as unknown as Prisma.InputJsonValue },
    });
  }

  const existingLeadsStorage = await prisma.appStorage.findUnique({ where: { key: STORAGE_KEYS.LEADS } });
  const leadSeedValue = Array.isArray(existingLeadsStorage?.value) ? existingLeadsStorage.value : mockLeads;
  await upsertLeadRecords(leadSeedValue);

  for (const item of storageSeeds) {
    if (!businessDomains.has(item.key)) continue;
    const existing = await prisma.appStorage.findUnique({ where: { key: item.key } });
    await upsertBusinessRecords(item.key, existing?.value ?? item.value);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
