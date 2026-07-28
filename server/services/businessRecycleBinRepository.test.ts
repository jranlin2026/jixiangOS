import assert from 'node:assert/strict';
import { createPrismaBusinessRecycleBinRepository } from './businessRecycleBinRepository';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';

const queries: any[] = [];
const prisma = {
  $queryRaw: async (query: any) => {
    queries.push(query);
    const sql = query.strings.join('?');
    return sql.includes('COUNT(*)')
      ? [{ total: 7n }]
      : [{ recordType: 'customer', data: { id: 'customer-1', deletedAt: '2026-07-21T00:00:00.000Z' } }];
  },
};

const result = await createPrismaBusinessRecycleBinRepository(prisma as any).listDeleted({
  type: 'customer',
  search: '测试',
  offset: 20,
  limit: 20,
});
assert.equal(result.total, 7);
assert.equal(result.rows[0].type, 'customer');
assert.equal(queries.length, 2);

const countSql = queries.find((query) => query.strings.join('?').includes('COUNT(*)'));
const pageSql = queries.find((query) => query.strings.join('?').includes('ORDER BY'));
assert.ok(countSql);
assert.ok(pageSql);
const countText = countSql.strings.join('?');
const pageText = pageSql.strings.join('?');
assert.match(countText, /recordType = \?/);
assert.match(countText, /LIKE \?/);
assert.match(pageText, /deletedAt.*DESC[\s\S]*recordType ASC[\s\S]*'\$\.id'.*ASC/);
assert.match(pageText, /LIMIT \? OFFSET \?/);
assert.equal(pageSql.values.includes('customer'), true);
assert.equal(pageSql.values.includes('%测试%'), true);
assert.equal(pageSql.values.includes(20), true);

function commandFixture(dependencyDomains: string[] = []) {
  const deletedOrder = {
    id: 'order-deleted', orderNo: 'ORD-DELETED', customerId: 'customer-1', customerName: '测试客户',
    actualAmount: 100, status: '已确认', owner: '销售甲', productLevel: '代理', orderType: '成交线索',
    refundStatus: '无', payments: [], sourceApplicationId: 'application-1',
    deletedAt: '2026-07-28T01:00:00.000Z', deletedBy: '管理员', deleteReason: '测试数据',
    createdAt: '2026-07-25T01:00:00.000Z', updatedAt: '2026-07-28T01:00:00.000Z',
  };
  const customer = {
    id: 'customer-1', name: '测试客户', customerLevel: 'L1', owner: '销售甲',
    totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], activityRecords: [],
    createdAt: '2026-07-25T01:00:00.000Z', updatedAt: '2026-07-28T01:00:00.000Z', recordRevision: 0,
  };
  const calls: any[] = [];
  let orderPresent = true;
  const transaction: any = {
    $queryRaw: async (query: any) => {
      const sql = query.strings.join('?');
      if (sql.includes('recordId =') && sql.includes('SELECT data')) return orderPresent ? [{ data: deletedOrder }] : [];
      if (sql.includes('recordRevision')) return [{
        id: 'row-customer-1', domain: STORAGE_KEYS.CUSTOMERS, recordId: customer.id,
        data: customer, recordRevision: 0, updatedAt: new Date('2026-07-28T01:00:00.000Z'),
      }];
      return [];
    },
    businessRecord: {
      findMany: async ({ where }: any) => {
        if (where?.orderId === deletedOrder.id) {
          const domains = where?.domain?.notIn
            ? dependencyDomains.filter((domain) => !where.domain.notIn.includes(domain))
            : where?.domain
              ? dependencyDomains.filter((domain) => domain === where.domain)
              : dependencyDomains;
          return domains.map((domain, index) => ({ domain, recordId: `dependency-${index + 1}` }));
        }
        if (where?.domain === STORAGE_KEYS.ORDERS) return orderPresent ? [{ data: deletedOrder }] : [];
        return [];
      },
      create: async (input: any) => { calls.push({ action: 'create', input }); return input.data; },
      deleteMany: async (input: any) => { calls.push({ action: 'deleteMany', input }); return { count: 1 }; },
      delete: async (input: any) => { calls.push({ action: 'delete', input }); orderPresent = false; return {}; },
      updateMany: async (input: any) => { calls.push({ action: 'updateMany', input }); return { count: 1 }; },
    },
  };
  return {
    calls,
    repository: createPrismaBusinessRecycleBinRepository({
      $queryRaw: async () => [],
      $transaction: async (callback: any) => callback(transaction),
    } as any),
  };
}

const purgeFixture = commandFixture();
await purgeFixture.repository.purgeOrder('order-deleted', '确认清理测试数据', '管理员');
assert.equal(purgeFixture.calls.some((call) => (
  call.action === 'deleteMany' && call.input.where.domain === STORAGE_KEYS.ORDER_APPLICATIONS
)), true, '永久删除订单必须同步删除来源订单申请');
assert.equal(purgeFixture.calls.some((call) => (
  call.action === 'create'
  && call.input.data.domain === STORAGE_KEYS.BUSINESS_RECYCLE_BIN_AUDITS
  && call.input.data.data.reason === '确认清理测试数据'
)), true, '永久删除必须保留操作人和原因审计');

const blockedFixture = commandFixture([STORAGE_KEYS.FINANCE_TRANSACTIONS]);
await assert.rejects(
  () => blockedFixture.repository.purgeOrder('order-deleted', '清理', '管理员'),
  /资金流水.*不能永久删除/,
);
assert.equal(blockedFixture.calls.some((call) => call.action === 'delete'), false);

const operationLogOnlyFixture = commandFixture([STORAGE_KEYS.COMMISSION_OPERATION_LOGS]);
await operationLogOnlyFixture.repository.purgeOrder('order-deleted', '清理测试分账日志', '管理员');
assert.equal(operationLogOnlyFixture.calls.some((call) => (
  call.action === 'deleteMany'
  && call.input.where.domain === STORAGE_KEYS.COMMISSION_OPERATION_LOGS
  && call.input.where.orderId === 'order-deleted'
)), true, '只剩分账操作日志时应跟随测试订单一并清理');

console.log('business recycle bin repository tests passed');
