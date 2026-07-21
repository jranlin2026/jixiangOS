import { mockCommissions } from '../../src/api/mock/data/commissions';
import { mockCustomers } from '../../src/api/mock/data/customers';
import { mockDeliveries } from '../../src/api/mock/data/deliveries';
import { mockFinanceDailyRecords, mockChannelROI } from '../../src/api/mock/data/finance';
import { mockLeads } from '../../src/api/mock/data/leads';
import { mockOrders } from '../../src/api/mock/data/orders';
import { mockProducts } from '../../src/api/mock/data/products';
import { mockProductLevelConfigs } from '../../src/api/mock/data/productLevels';
import { mockRefunds } from '../../src/api/mock/data/refunds';
import { mockTags } from '../../src/api/mock/data/tags';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';

function parseDate(value: unknown): Date {
  const parsed = new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function recordId(domain: string, item: Record<string, any>, index: number): string {
  return String(item.id || item.orderNo || item.refundNo || `${domain}-${index}`);
}

function amount(item: Record<string, any>): number | null {
  const parsed = Number(item.actualAmount ?? item.amount ?? item.totalSpent ?? item.refundAmount ?? item.commissionAmount ?? item.price);
  return Number.isFinite(parsed) ? parsed : null;
}

async function putStorage(store: any, key: string, value: unknown): Promise<void> {
  await store.appStorage.upsert({ where: { key }, update: { value }, create: { key, value } });
}

async function seedBusinessDomain(store: any, domain: string, items: unknown[]): Promise<void> {
  await putStorage(store, domain, items);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] as Record<string, any>;
    const id = recordId(domain, item, index);
    const data = {
      title: item.name || item.customerName || item.orderNo || item.refundNo || item.title || domain,
      status: item.status || null,
      owner: item.owner || item.ownerName || item.salesName || item.createdBy || null,
      customerId: item.customerId || null,
      orderId: item.orderId || null,
      amount: amount(item),
      eventAt: item.updatedAt || item.createdAt ? parseDate(item.updatedAt || item.createdAt) : null,
      data: item,
    };
    await store.businessRecord.upsert({
      where: { domain_recordId: { domain, recordId: id } },
      update: data,
      create: { id: `${domain}:${id}`.slice(0, 160), domain, recordId: id, ...data },
    });
  }
}

export async function seedDemoBusinessData(store: any): Promise<void> {
  await putStorage(store, STORAGE_KEYS.FINANCE, { dailyRecords: mockFinanceDailyRecords, channelROI: mockChannelROI });
  await putStorage(store, STORAGE_KEYS.PRODUCT_LEVELS, mockProductLevelConfigs);

  for (const lead of mockLeads) {
    await store.leadRecord.upsert({
      where: { id: lead.id },
      update: {
        name: lead.name,
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
        data: lead,
        createdAt: parseDate(lead.createdAt),
        updatedAt: parseDate(lead.updatedAt || lead.createdAt),
      },
      create: {
        id: lead.id,
        name: lead.name,
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
        data: lead,
        createdAt: parseDate(lead.createdAt),
        updatedAt: parseDate(lead.updatedAt || lead.createdAt),
      },
    });
  }
  await putStorage(store, STORAGE_KEYS.LEADS, mockLeads);

  for (const [domain, items] of [
    [STORAGE_KEYS.CUSTOMERS, mockCustomers],
    [STORAGE_KEYS.ORDERS, mockOrders],
    [STORAGE_KEYS.DELIVERIES, mockDeliveries],
    [STORAGE_KEYS.COMMISSIONS, mockCommissions],
    [STORAGE_KEYS.REFUNDS, mockRefunds],
    [STORAGE_KEYS.PRODUCTS, mockProducts],
    [STORAGE_KEYS.TAGS, mockTags],
  ] as const) {
    await seedBusinessDomain(store, domain, items);
  }
}
