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
assert.match(
  pageText,
  /EXISTS[\s\S]*linked_customer\.recordId[\s\S]*'\$\.customerId'/,
  '回收站列表必须按真实客户记录判断线索是否仍有关联客户',
);
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
await purgeFixture.repository.purge('order', 'order-deleted', '确认清理测试数据', '管理员');
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
  () => blockedFixture.repository.purge('order', 'order-deleted', '清理', '管理员'),
  /资金流水.*不能永久删除/,
);
assert.equal(blockedFixture.calls.some((call) => call.action === 'delete'), false);

const operationLogOnlyFixture = commandFixture([STORAGE_KEYS.COMMISSION_OPERATION_LOGS]);
await operationLogOnlyFixture.repository.purge('order', 'order-deleted', '清理测试分账日志', '管理员');
assert.equal(operationLogOnlyFixture.calls.some((call) => (
  call.action === 'deleteMany'
  && call.input.where.domain === STORAGE_KEYS.COMMISSION_OPERATION_LOGS
  && call.input.where.orderId === 'order-deleted'
)), true, '只剩分账操作日志时应跟随测试订单一并清理');

function customerPurgeFixture(options: {
  activeLinkedLead?: boolean;
  includeOrder?: boolean;
  retainSharedIdentity?: boolean;
} = {}) {
  const deletedCustomer = {
    id: 'customer-deleted', name: '测试客户', customerLevel: 'L1', owner: '销售甲',
    totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], activityRecords: [],
    deletionCascadeId: 'delete-cascade-1', cascadeDeletedLeadIds: ['lead-linked'],
    deletedAt: '2026-07-28T01:00:00.000Z', deletedBy: '管理员', deleteReason: '测试数据',
    createdAt: '2026-07-25T01:00:00.000Z', updatedAt: '2026-07-28T01:00:00.000Z',
  };
  const deletedLead = {
    id: 'lead-linked', name: '测试客户', customerId: deletedCustomer.id, owner: '销售甲',
    externalIntakeKey: 'browser-sync-linked',
    deletionCascadeId: deletedCustomer.deletionCascadeId,
    ...(options.activeLinkedLead
      ? {}
      : { deletedAt: deletedCustomer.deletedAt, deletedBy: '管理员', deleteReason: '测试数据' }),
    createdAt: '2026-07-25T01:00:00.000Z', updatedAt: '2026-07-28T01:00:00.000Z',
  };
  const businessRows: any[] = [{
    id: 'customer-row', domain: STORAGE_KEYS.CUSTOMERS, recordId: deletedCustomer.id,
    customerId: deletedCustomer.id, data: deletedCustomer,
  }];
  if (options.includeOrder) {
    businessRows.push({
      id: 'order-row', domain: STORAGE_KEYS.ORDERS, recordId: 'order-linked',
      customerId: deletedCustomer.id, data: { id: 'order-linked', customerId: deletedCustomer.id },
    });
  }
  const leadRows: any[] = [{
    id: deletedLead.id,
    externalIntakeKey: deletedLead.externalIntakeKey,
    data: deletedLead,
  }];
  const browserLeadSyncs: any[] = [
    { id: deletedLead.externalIntakeKey, leadId: null, platformOrderNo: 'ORDER-LINKED' },
    { id: deletedLead.id, leadId: 'lead-other-cross-value', platformOrderNo: 'ORDER-CROSS-VALUE' },
    { id: 'browser-sync-unrelated', leadId: 'lead-other', platformOrderNo: 'ORDER-OTHER' },
  ];
  const audits: any[] = [];
  const customerAuditEvents: any[] = [{
    id: 'customer-audit-with-pii',
    customerId: deletedCustomer.id,
    beforeSnapshot: { name: deletedCustomer.name, phone: '13900000000' },
  }];
  const identityLinks: any[] = [
    { id: 'identity-link-customer', identityId: 'identity-1', entityType: 'customer', entityId: deletedCustomer.id },
    { id: 'identity-link-lead', identityId: 'identity-1', entityType: 'lead', entityId: deletedLead.id },
    ...(options.retainSharedIdentity ? [{
      id: 'identity-link-other-customer',
      identityId: 'identity-1',
      entityType: 'customer',
      entityId: 'customer-other',
      linkStatus: 'active',
    }] : []),
  ];
  const identities: any[] = [{
    id: 'identity-1',
    canonicalCustomerId: deletedCustomer.id,
    status: 'active',
    conflictReason: null,
  }];
  const duplicateGroups: any[] = [{ id: 'duplicate-group-1', contactIdentityId: 'identity-1' }];
  const transaction: any = {
    $queryRaw: async (query: any) => {
      const sql = query.strings.join('?');
      if (sql.includes('FROM business_records') && sql.includes('LIMIT 1')) {
        return businessRows.length ? [{ data: businessRows[0].data }] : [];
      }
      if (sql.includes('FROM lead_records') && sql.includes("'$.customerId'")) {
        return leadRows;
      }
      if (sql.includes('FROM contact_identities')) {
        const identityId = query.values.find((value: unknown) => (
          identities.some((identity) => identity.id === value)
        ));
        return identities.filter((identity) => identity.id === identityId);
      }
      if (sql.includes('FROM contact_identity_links')) {
        const identityId = query.values.find((value: unknown) => (
          identities.some((identity) => identity.id === value)
        ));
        return identityLinks
          .filter((link) => (
            link.identityId === identityId
            && link.entityType === 'customer'
            && link.linkStatus === 'active'
          ))
          .map((link) => ({ entityId: link.entityId }));
      }
      return [];
    },
    appStorage: {
      upsert: async ({ create }: any) => create,
      findUnique: async () => null,
    },
    businessRecord: {
      findMany: async () => businessRows,
      create: async ({ data }: any) => { audits.push(data); return data; },
      delete: async ({ where }: any) => {
        const index = businessRows.findIndex((row) => (
          row.domain === where.domain_recordId.domain
          && row.recordId === where.domain_recordId.recordId
        ));
        if (index < 0) throw new Error('customer row missing');
        businessRows.splice(index, 1);
        return {};
      },
    },
    leadRecord: {
      findMany: async () => leadRows,
      deleteMany: async ({ where }: any) => {
        const ids = new Set(where.id.in);
        const kept = leadRows.filter((row) => !ids.has(row.id));
        const count = leadRows.length - kept.length;
        leadRows.splice(0, leadRows.length, ...kept);
        return { count };
      },
    },
    browserLeadSync: {
      deleteMany: async ({ where }: any) => {
        const conditions = where.OR || [];
        const retained = browserLeadSyncs.filter((row) => !conditions.some((condition: any) => (
          (condition.id?.in || []).includes(row.id)
          || (condition.leadId?.in || []).includes(row.leadId)
        )));
        const count = browserLeadSyncs.length - retained.length;
        browserLeadSyncs.splice(0, browserLeadSyncs.length, ...retained);
        return { count };
      },
    },
    customerTodo: { findMany: async () => [] },
    customerAuditEvent: {
      deleteMany: async ({ where }: any) => {
        const retained = customerAuditEvents.filter((event) => event.customerId !== where.customerId);
        const count = customerAuditEvents.length - retained.length;
        customerAuditEvents.splice(0, customerAuditEvents.length, ...retained);
        return { count };
      },
    },
    contactIdentityLink: {
      findMany: async ({ where }: any) => {
        const subjects = where.OR || [];
        return identityLinks.filter((link) => subjects.some((subject: any) => (
          subject.entityType === link.entityType && subject.entityId === link.entityId
        )));
      },
      deleteMany: async ({ where }: any) => {
        const subjects = where.OR || [];
        const removable = identityLinks.filter((link) => subjects.some((subject: any) => (
          subject.entityType === link.entityType && subject.entityId === link.entityId
        )));
        const retained = identityLinks.filter((link) => !removable.includes(link));
        const count = removable.length;
        identityLinks.splice(0, identityLinks.length, ...retained);
        return { count };
      },
    },
    contactIdentity: {
      findMany: async ({ where }: any) => identities.filter((identity) => (
        where.id.in.includes(identity.id)
        && !identityLinks.some((link) => link.identityId === identity.id)
      )),
      update: async ({ where, data }: any) => {
        const identity = identities.find((item) => item.id === where.id);
        if (!identity) throw new Error('identity missing');
        Object.assign(identity, data);
        return identity;
      },
      deleteMany: async ({ where }: any) => {
        const removable = identities.filter((identity) => (
          where.id.in.includes(identity.id)
          && !identityLinks.some((link) => link.identityId === identity.id)
        ));
        const retained = identities.filter((identity) => !removable.includes(identity));
        const count = removable.length;
        identities.splice(0, identities.length, ...retained);
        return { count };
      },
    },
    customerDuplicateGroup: {
      deleteMany: async () => {
        const count = duplicateGroups.length;
        duplicateGroups.splice(0, duplicateGroups.length);
        return { count };
      },
    },
  };
  return {
    businessRows,
    leadRows,
    browserLeadSyncs,
    audits,
    customerAuditEvents,
    identityLinks,
    identities,
    duplicateGroups,
    repository: createPrismaBusinessRecycleBinRepository({
      $queryRaw: async () => [],
      $transaction: async (callback: any) => callback(transaction),
    } as any),
  };
}

const customerFixture = customerPurgeFixture();
await customerFixture.repository.purge('customer', 'customer-deleted', '确认清理测试客户', '管理员');
assert.equal(customerFixture.businessRows.length, 0, '永久删除客户后不得保留客户根记录');
assert.equal(customerFixture.leadRows.length, 0, '永久删除客户必须在同一事务中清理已联合删除的关联线索');
assert.deepEqual(
  customerFixture.browserLeadSyncs.map((row) => row.id),
  ['lead-linked', 'browser-sync-unrelated'],
  '永久删除客户后必须释放关联订单的浏览器入库占用，且不得误删其他订单',
);
assert.equal(customerFixture.identityLinks.length, 0, '永久删除客户及关联线索必须清理对应身份链接');
assert.equal(customerFixture.identities.length, 0, '没有其他业务链接的身份索引必须同步清理');
assert.equal(customerFixture.duplicateGroups.length, 0, '仅引用孤儿身份索引的重复客户候选必须同步清理');
assert.equal(customerFixture.customerAuditEvents.length, 0, '永久删除客户后不得保留含姓名或联系方式快照的旧审计');
assert.equal(customerFixture.audits.some((row) => (
  row.domain === STORAGE_KEYS.BUSINESS_RECYCLE_BIN_AUDITS
  && row.data.targetType === 'customer'
  && row.data.removedLinkedLeadCount === 1
  && row.data.removedCustomerAuditEventCount === 1
  && row.data.removedBrowserLeadSyncCount === 1
  && row.data.reason === '确认清理测试客户'
)), true, '永久删除客户必须保留不含联系方式的最小审计');

const activeLeadCustomerFixture = customerPurgeFixture({ activeLinkedLead: true });
await assert.rejects(
  () => activeLeadCustomerFixture.repository.purge('customer', 'customer-deleted', '尝试清理', '管理员'),
  /有效线索/,
);
assert.equal(activeLeadCustomerFixture.businessRows.length, 1);
assert.equal(activeLeadCustomerFixture.leadRows.length, 1);

const orderLinkedCustomerFixture = customerPurgeFixture({ includeOrder: true });
await assert.rejects(
  () => orderLinkedCustomerFixture.repository.purge('customer', 'customer-deleted', '尝试清理', '管理员'),
  /订单关联/,
);
assert.equal(orderLinkedCustomerFixture.businessRows.length, 2, '存在真实订单关联时不得永久删除客户');
assert.equal(orderLinkedCustomerFixture.leadRows.length, 1);

const sharedIdentityCustomerFixture = customerPurgeFixture({ retainSharedIdentity: true });
await sharedIdentityCustomerFixture.repository.purge(
  'customer',
  'customer-deleted',
  '清理共享联系方式测试客户',
  '管理员',
);
assert.equal(sharedIdentityCustomerFixture.identities.length, 1);
assert.equal(
  sharedIdentityCustomerFixture.identities[0].canonicalCustomerId,
  'customer-other',
  '共享身份索引保留时必须把主客户指针重算到仍存在的有效客户',
);
assert.equal(
  sharedIdentityCustomerFixture.identityLinks.some((link) => link.entityId === 'customer-other'),
  true,
  '永久删除不得误删其他客户的身份链接',
);

function standaloneLeadPurgeFixture(customerExists = false) {
  const deletedLead = {
    id: 'lead-standalone', name: '独立测试线索',
    externalIntakeKey: 'browser-sync-standalone',
    ...(customerExists ? { customerId: 'customer-deleted' } : {}),
    deletedAt: '2026-07-28T01:00:00.000Z', deletedBy: '管理员', deleteReason: '测试数据',
    createdAt: '2026-07-25T01:00:00.000Z', updatedAt: '2026-07-28T01:00:00.000Z',
  };
  const leadRows: any[] = [{
    id: deletedLead.id,
    externalIntakeKey: deletedLead.externalIntakeKey,
    data: deletedLead,
  }];
  const browserLeadSyncs: any[] = [
    { id: deletedLead.externalIntakeKey, leadId: null, platformOrderNo: 'ORDER-STANDALONE' },
    { id: 'browser-sync-unrelated', leadId: 'lead-other', platformOrderNo: 'ORDER-OTHER' },
  ];
  const audits: any[] = [];
  const identityLinks: any[] = [{
    id: 'identity-link-lead', identityId: 'identity-lead', entityType: 'lead', entityId: deletedLead.id,
  }];
  const identities: any[] = [{ id: 'identity-lead' }];
  const transaction: any = {
    $queryRaw: async (query: any) => {
      const sql = query.strings.join('?');
      if (sql.includes('FROM lead_records') && sql.includes('LIMIT 1')) return leadRows;
      return [];
    },
    appStorage: {
      upsert: async ({ create }: any) => create,
      findUnique: async () => null,
    },
    businessRecord: {
      findMany: async () => customerExists ? [{
        id: 'customer-row', domain: STORAGE_KEYS.CUSTOMERS, recordId: 'customer-deleted',
        customerId: 'customer-deleted', data: { id: 'customer-deleted', deletedAt: deletedLead.deletedAt },
      }] : [],
      findUnique: async () => customerExists ? { recordId: 'customer-deleted' } : null,
      create: async ({ data }: any) => { audits.push(data); return data; },
    },
    leadRecord: {
      findMany: async () => leadRows,
      delete: async () => {
        if (!leadRows.length) throw new Error('lead row missing');
        leadRows.splice(0, 1);
        return {};
      },
    },
    browserLeadSync: {
      deleteMany: async ({ where }: any) => {
        const conditions = where.OR || [];
        const retained = browserLeadSyncs.filter((row) => !conditions.some((condition: any) => (
          (condition.id?.in || []).includes(row.id)
          || (condition.leadId?.in || []).includes(row.leadId)
        )));
        const count = browserLeadSyncs.length - retained.length;
        browserLeadSyncs.splice(0, browserLeadSyncs.length, ...retained);
        return { count };
      },
    },
    customerTodo: { findMany: async () => [] },
    contactIdentityLink: {
      findMany: async () => identityLinks,
      deleteMany: async () => {
        const count = identityLinks.length;
        identityLinks.splice(0, identityLinks.length);
        return { count };
      },
    },
    contactIdentity: {
      findMany: async () => identities.filter((identity) => (
        !identityLinks.some((link) => link.identityId === identity.id)
      )),
      deleteMany: async () => {
        const count = identities.length;
        identities.splice(0, identities.length);
        return { count };
      },
    },
    customerDuplicateGroup: { deleteMany: async () => ({ count: 0 }) },
  };
  return {
    leadRows,
    browserLeadSyncs,
    audits,
    identityLinks,
    identities,
    repository: createPrismaBusinessRecycleBinRepository({
      $queryRaw: async () => [],
      $transaction: async (callback: any) => callback(transaction),
    } as any),
  };
}

const standaloneLeadFixture = standaloneLeadPurgeFixture();
await standaloneLeadFixture.repository.purge('lead', 'lead-standalone', '确认清理独立线索', '管理员');
assert.equal(standaloneLeadFixture.leadRows.length, 0, '未关联客户的回收站线索应允许永久删除');
assert.deepEqual(
  standaloneLeadFixture.browserLeadSyncs.map((row) => row.id),
  ['browser-sync-unrelated'],
  '永久删除独立线索后必须释放关联订单的浏览器入库占用',
);
assert.equal(standaloneLeadFixture.identityLinks.length, 0);
assert.equal(standaloneLeadFixture.identities.length, 0);
assert.equal(standaloneLeadFixture.audits.some((row) => (
  row.domain === STORAGE_KEYS.BUSINESS_RECYCLE_BIN_AUDITS
  && row.data.targetType === 'lead'
  && row.data.removedBrowserLeadSyncCount === 1
  && row.data.reason === '确认清理独立线索'
)), true, '永久删除独立线索必须保留最小审计');

const linkedLeadFixture = standaloneLeadPurgeFixture(true);
await assert.rejects(
  () => linkedLeadFixture.repository.purge('lead', 'lead-standalone', '尝试单独清理关联线索', '管理员'),
  /请从关联客户统一永久删除/,
);
assert.equal(linkedLeadFixture.leadRows.length, 1, '关联客户仍存在时不得单独永久删除线索');
assert.equal(linkedLeadFixture.audits.length, 0, '被阻断的永久删除不得写入成功审计');

console.log('business recycle bin repository tests passed');
