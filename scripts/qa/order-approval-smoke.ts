import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { Customer } from '../../src/types/customer';
import type { OrderApplication, OrderApprovalResult } from '../../src/types/order';
import type { Product } from '../../src/types/product';

type ApiEnvelope<T> = {
  code: number;
  data: T;
  message?: string;
};

type LoginResult = {
  token: string;
  user: { id: string; name: string };
};

const prisma = new PrismaClient();
const baseUrl = String(process.env.QA_API_BASE || 'http://127.0.0.1:3001/api').replace(/\/$/, '');
const target = new URL(baseUrl);
const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1']);

if (process.env.NODE_ENV === 'production' || !allowedHosts.has(target.hostname)) {
  throw new Error('order-approval-smoke only runs against a loopback non-production API');
}

const salesAccount = String(process.env.QA_SALES_ACCOUNT || '').trim();
const salesPassword = String(process.env.QA_SALES_PASSWORD || '');
const financeAccount = String(process.env.QA_FINANCE_ACCOUNT || '').trim();
const financePassword = String(process.env.QA_FINANCE_PASSWORD || '');
if (!salesAccount || !salesPassword || !financeAccount || !financePassword) {
  throw new Error('QA sales and finance credentials are required through environment variables');
}

const runId = randomUUID().slice(0, 12);
const customerId = `qa-order-customer-${runId}`;
const productId = `qa-order-product-${runId}`;
let applicationId = '';
let orderId = '';
let salesToken = '';
let financeToken = '';

async function request<T>(path: string, init: RequestInit = {}, token = ''): Promise<ApiEnvelope<T>> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const payload = await response.json() as ApiEnvelope<T>;
  if (payload.code !== 0) {
    throw new Error(`${path}: ${payload.message || `HTTP ${response.status}`}`);
  }
  return payload;
}

async function login(account: string, password: string): Promise<LoginResult> {
  const response = await request<LoginResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account, password, remember: false }),
  });
  return response.data;
}

async function cleanup(): Promise<void> {
  if (salesToken) await request<boolean>('/auth/logout', { method: 'POST' }, salesToken).catch(() => undefined);
  if (financeToken) await request<boolean>('/auth/logout', { method: 'POST' }, financeToken).catch(() => undefined);
  await prisma.businessRecord.deleteMany({
    where: {
      OR: [
        { domain: STORAGE_KEYS.CUSTOMERS, recordId: customerId },
        { domain: STORAGE_KEYS.PRODUCTS, recordId: productId },
        ...(applicationId ? [{ domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: applicationId }] : []),
        ...(orderId ? [
          { domain: STORAGE_KEYS.ORDERS, recordId: orderId },
          { orderId },
        ] : []),
      ],
    },
  });
}

try {
  const [sales, finance] = await Promise.all([
    login(salesAccount, salesPassword),
    login(financeAccount, financePassword),
  ]);
  salesToken = sales.token;
  financeToken = finance.token;
  const now = new Date().toISOString();
  const customer: Customer = {
    id: customerId,
    name: `QA订单客户-${runId}`,
    company: `QA订单公司-${runId}`,
    phone: `199${runId.replace(/[^0-9]/g, '').padEnd(8, '0').slice(0, 8)}`,
    owner: sales.user.name,
    customerLevel: 'L1',
    lifecycleStatusCode: 'following',
    lifecycleStatusUpdatedAt: now,
    sourceType: '公司资源',
    totalSpent: 0,
    orderCount: 0,
    growthPath: [],
    growthRecords: [],
    activityRecords: [],
    createdAt: now,
    updatedAt: now,
  };
  const product: Product = {
    id: productId,
    name: `QA899课程-${runId}`,
    level: '899',
    price: 1000,
    description: 'Codex local integration smoke product',
    features: [],
    deliveryStages: ['QA交付启动', 'QA交付验收'],
    isActive: true,
    sortOrder: 9999,
    createdAt: now,
    updatedAt: now,
  };

  await prisma.$transaction([
    prisma.businessRecord.create({
      data: {
        id: `${STORAGE_KEYS.CUSTOMERS}:${customer.id}`,
        domain: STORAGE_KEYS.CUSTOMERS,
        recordId: customer.id,
        title: customer.company,
        status: customer.lifecycleStatusCode,
        owner: customer.owner,
        customerId: customer.id,
        eventAt: new Date(now),
        data: customer as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.businessRecord.create({
      data: {
        id: `${STORAGE_KEYS.PRODUCTS}:${product.id}`,
        domain: STORAGE_KEYS.PRODUCTS,
        recordId: product.id,
        title: product.name,
        status: 'active',
        amount: product.price,
        eventAt: new Date(now),
        data: product as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);

  const submitted = await request<OrderApplication>('/order-applications', {
    method: 'POST',
    body: JSON.stringify({ orderData: {
      customerId,
      customerName: '伪造客户名称应被服务端覆盖',
      productId,
      productName: '伪造产品名称应被服务端覆盖',
      productLevel: '代理',
      orderType: '899成交',
      amount: 1000,
      actualAmount: 1000,
      paymentMethod: '对公转账',
      officialPaymentChannel: '对公银行转账',
      status: '待确认',
      refundStatus: '无',
      owner: '伪造归属应被服务端覆盖',
      resourceOwnership: '个人资源',
      payments: [{
        id: `qa-payment-${runId}`,
        amount: 1000,
        paymentMethod: '对公转账',
        paidAt: now,
        voucherName: 'qa-payment-proof.png',
      }],
    } }),
  }, salesToken);
  applicationId = submitted.data.id;
  assert.equal(submitted.data.applicantId, sales.user.id);
  assert.equal(submitted.data.applicantName, sales.user.name);
  assert.equal(submitted.data.orderData.customerName, customer.name);
  assert.equal(submitted.data.orderData.productName, product.name);
  assert.equal(submitted.data.orderData.productLevel, product.level);
  assert.equal(submitted.data.orderData.salesId, sales.user.id);
  assert.equal(submitted.data.orderData.owner, sales.user.name);
  assert.equal(submitted.data.orderData.resourceOwnership, customer.sourceType);

  const approve = () => request<OrderApprovalResult>(`/order-applications/${encodeURIComponent(applicationId)}/approve`, {
    method: 'POST',
  }, financeToken);
  const [firstApproval, secondApproval] = await Promise.all([approve(), approve()]);
  orderId = firstApproval.data.order.id;
  assert.equal(secondApproval.data.order.id, orderId);
  assert.equal([firstApproval.data.replayed, secondApproval.data.replayed].filter(Boolean).length, 1);
  assert.deepEqual(firstApproval.data.downstreamEffects, {
    customerOrderStats: 'applied',
    commissionGeneration: 'applied',
    deliveryCreation: 'applied',
    customerLifecycle: 'applied',
  });

  const [storedApplication, storedOrders, commissions, deliveries, storedCustomer] = await Promise.all([
    prisma.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: applicationId } },
    }),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.ORDERS, recordId: orderId } }),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.COMMISSIONS, orderId } }),
    prisma.businessRecord.findMany({ where: { domain: STORAGE_KEYS.DELIVERIES, orderId } }),
    prisma.businessRecord.findUnique({
      where: { domain_recordId: { domain: STORAGE_KEYS.CUSTOMERS, recordId: customerId } },
    }),
  ]);
  const approvedApplication = storedApplication?.data as unknown as OrderApplication;
  const customerAfter = storedCustomer?.data as unknown as Customer;
  assert.equal(storedOrders.length, 1);
  assert.equal(approvedApplication.status, '已入库');
  assert.equal(approvedApplication.reviewLogs.filter((item) => item.action === 'approve').length, 1);
  assert.equal(commissions.length, 1);
  assert.equal(deliveries.length, 1);
  assert.equal(customerAfter.orderCount, 1);
  assert.equal(customerAfter.totalSpent, 1000);
  assert.equal(customerAfter.lifecycleStatusCode, 'ordered');

  process.stdout.write(JSON.stringify({
    ok: true,
    concurrentApprovalReplayed: true,
    orderCount: storedOrders.length,
    commissionCount: commissions.length,
    deliveryCount: deliveries.length,
  }));
} finally {
  await cleanup().finally(() => prisma.$disconnect());
}
