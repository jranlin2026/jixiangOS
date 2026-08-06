import assert from 'node:assert/strict';
import type { RecoveryOrder } from '../../src/types/recoveryOrder';
import { createRecoveryCrmBridge, resolveRecoveryCrmIdentity } from './recoveryCrmBridge';
import { hashContactIdentity, normalizeContactIdentity } from './contactIdentityService';

const customers = [
  { id: 'customer-a', name: 'CRM标准名称', phone: '13800000000', wechat: 'wx-a' },
  { id: 'customer-b', name: '客户乙', phone: '13900000000', wechat: 'wx-b' },
];
const leads = [
  { id: 'lead-a', name: '存量线索', phone: '13700000000', wechat: 'wx-lead' },
];

assert.deepEqual(
  resolveRecoveryCrmIdentity({ customers, leads, phone: '+86 138-0000-0000', wechat: '' }),
  { status: '已匹配客户', customerId: 'customer-a' },
  '手机号唯一命中时只返回内部客户 ID，不返回客户名称',
);
assert.deepEqual(
  resolveRecoveryCrmIdentity({
    customers: [{
      id: 'customer-with-backup',
      phone: '13800000010',
      phones: [
        { number: '13800000010', isPrimary: true, label: '主手机号' },
        { number: '13900000010', isPrimary: false, label: '备用手机号' },
      ],
    }],
    leads: [],
    phone: '13900000010',
  }),
  { status: '已匹配客户', customerId: 'customer-with-backup' },
  '售后身份识别必须能通过备用手机号命中客户',
);
assert.deepEqual(
  resolveRecoveryCrmIdentity({ customers: [{ id: 'hk-customer', phone: '+852 9123.4567' }], leads: [], phone: '+85291234567' }),
  { status: '已匹配客户', customerId: 'hk-customer' },
  '国际手机号必须按完整纯数字匹配，不能截断为大陆手机号规则',
);
assert.deepEqual(
  resolveRecoveryCrmIdentity({ customers, leads, phone: '13700000000', wechat: 'wx-lead' }),
  { status: '已匹配线索', leadId: 'lead-a' },
);
assert.deepEqual(
  resolveRecoveryCrmIdentity({ customers, leads, phone: '13600000000', wechat: 'new-wx' }),
  { status: '待创建线索' },
);
assert.deepEqual(
  resolveRecoveryCrmIdentity({
    customers: [],
    leads: [{ id: 'converted-lead', phone: '13600000001', customerId: 'deleted-customer' }],
    phone: '13600000001',
  }),
  { status: '待创建线索' },
  '已转客的历史线索不得被重新绑定为待跟进线索',
);
assert.deepEqual(
  resolveRecoveryCrmIdentity({ customers, leads, phone: '13800000000', wechat: 'wx-b' }),
  { status: '身份冲突' },
  '手机号和微信指向不同客户时不得按手机号优先误绑定',
);
assert.deepEqual(
  resolveRecoveryCrmIdentity({
    customers: [{ id: 'merged-customer', phone: '13400000000', mergedIntoId: 'active-customer' }],
    leads: [],
    phone: '13400000000',
  }),
  { status: '待创建线索' },
  '已合并客户不得作为有效身份重新绑定',
);

const identities: any[] = [];
const links: any[] = [];
const createdLeads: any[] = [];
const storage = new Map<string, any>();
const tx = {
  businessRecord: { findMany: async () => [], findUnique: async () => null },
  leadRecord: {
    findMany: async () => createdLeads.map((item) => ({ id: item.id, data: item.data })),
    findUnique: async ({ where }: any) => createdLeads.find((item) => item.id === where.id) || null,
    create: async ({ data }: any) => { createdLeads.push(data); return data; },
  },
  appStorage: {
    findUnique: async ({ where }: any) => storage.has(where.key) ? { value: storage.get(where.key) } : null,
    upsert: async ({ where, update, create }: any) => {
      const value = storage.has(where.key) ? (update.value ?? storage.get(where.key)) : create.value;
      storage.set(where.key, value);
      return { key: where.key, value };
    },
  },
  contactIdentity: {
    findUnique: async ({ where }: any) => identities.find((item) => (
      item.type === where.type_normalizedHash.type && item.normalizedHash === where.type_normalizedHash.normalizedHash
    )) || null,
    create: async ({ data }: any) => { const item = { ...data, createdAt: new Date(), updatedAt: new Date() }; identities.push(item); return item; },
    update: async ({ where, data }: any) => {
      const item = identities.find((candidate) => candidate.id === where.id);
      Object.assign(item, data);
      return item;
    },
  },
  contactIdentityLink: {
    findMany: async ({ where }: any) => links.filter((item) => Object.entries(where).every(([key, value]: [string, any]) => (
      value?.in ? value.in.includes(item[key]) : item[key] === value
    ))),
    upsert: async ({ where, update, create }: any) => {
      const key = where.identityId_entityType_entityId;
      const item = links.find((candidate) => candidate.identityId === key.identityId && candidate.entityType === key.entityType && candidate.entityId === key.entityId);
      if (item) { Object.assign(item, update); return item; }
      links.push(create);
      return create;
    },
    updateMany: async () => ({ count: 0 }),
  },
};
const bridge = createRecoveryCrmBridge({
  contactIdentityCrypto: { hmacKey: Buffer.alloc(32, 1), keyVersion: 1, encryptionKey: Buffer.alloc(32, 2), encryptionKeyVersion: 1 },
});
const order = {
  id: 'recovery-new-contact', recoveryNo: 'RCV-NEW', thirdPartyOrderNo: 'TP-NEW', customerId: '',
  customerName: '售后填报称呼', submittedCustomerName: '售后填报称呼', customerPhone: '13600000000', customerWechat: 'new-contact',
  customerMatchStatus: '售后临时客户', originalProduct: '原产品', originalAmount: 200, recoveryAmount: 100,
  recoveryUserId: 'after-sales-1', recoveryUserName: '售后甲', recoveryAt: '2026-07-25T00:00:00.000Z',
  status: '待审核', settlementStatus: '未分账', commissionIds: [], createdBy: 'importer-1', createdByName: '导入人',
  auditorName: '审核人', createdAt: '2026-07-25T00:00:00.000Z', updatedAt: '2026-07-25T00:00:00.000Z',
} as RecoveryOrder;
const synced = await bridge.resolveAndSyncLead(tx, order);
assert.equal(synced.crmIdentityStatus, '已创建线索');
assert.equal(createdLeads.length, 1);
assert.equal(createdLeads[0].data.name, '售后填报称呼');
assert.equal(createdLeads[0].data.source, '售后服务');
assert.equal(createdLeads[0].data.sourceName, '售后挽回');
assert.equal(createdLeads[0].data.owner, '待分配');
assert.equal(createdLeads[0].data.inputBy, '导入人');
assert.equal(createdLeads[0].data.leadContributorName, '售后甲');
assert.equal(createdLeads[0].data.recoveryOrderId, order.id);
assert.equal(links.length, 2, '手机号和微信都应建立线索身份索引');
assert.equal(storage.get('aaos_lead_intake_records')?.[0]?.leadId, synced.linkedLeadId, '自动沉淀线索必须同步写入线索入库记录');
assert.deepEqual(
  await bridge.resolve(tx, order),
  { status: '已匹配线索', leadId: synced.linkedLeadId },
  '后续售后单应通过联系方式索引直接命中已沉淀线索',
);
const legacyBridge = createRecoveryCrmBridge({
  contactIdentityCrypto: { hmacKey: Buffer.alloc(32, 1), keyVersion: 1, encryptionKey: Buffer.alloc(32, 2), encryptionKeyVersion: 1 },
});
assert.deepEqual(
  await legacyBridge.resolve({
    ...tx,
    businessRecord: {
      findMany: async () => [{ data: { id: 'legacy-customer', name: '未回填客户', phone: '13500000000' } }],
      findUnique: async () => null,
    },
    leadRecord: { ...tx.leadRecord, findMany: async () => [] },
  }, { customerPhone: '13500000000' }),
  { status: '已匹配客户', customerId: 'legacy-customer' },
  '联系方式索引尚未回填时也不得遗漏已有 CRM 客户',
);

const mixedKey = Buffer.alloc(32, 3);
const mixedPhone = normalizeContactIdentity('phone', '13300000000')!;
const mixedBridge = createRecoveryCrmBridge({
  contactIdentityCrypto: { hmacKey: mixedKey, keyVersion: 1, encryptionKey: Buffer.alloc(32, 4), encryptionKeyVersion: 1 },
});
assert.deepEqual(
  await mixedBridge.resolve({
    ...tx,
    businessRecord: {
      findMany: async () => [
        { data: { id: 'indexed-customer', name: '索引客户', phone: '13300000000' } },
        { data: { id: 'legacy-wechat-customer', name: '旧微信客户', wechat: 'legacy-wx' } },
      ],
      findUnique: async () => null,
    },
    leadRecord: { ...tx.leadRecord, findMany: async () => [] },
    contactIdentity: {
      ...tx.contactIdentity,
      findUnique: async ({ where }: any) => where.type_normalizedHash.normalizedHash === hashContactIdentity(mixedPhone, mixedKey)
        ? { id: 'indexed-phone', status: 'active', canonicalCustomerId: 'indexed-customer' }
        : null,
    },
    contactIdentityLink: { ...tx.contactIdentityLink, findMany: async () => [] },
  }, { customerPhone: '13300000000', customerWechat: 'legacy-wx' }),
  { status: '身份冲突' },
  '手机号已索引、微信仍是旧数据时也必须合并检查并阻止跨实体绑定',
);

let freshCustomerRows: any[] = [];
const freshBridge = createRecoveryCrmBridge({
  contactIdentityCrypto: { hmacKey: Buffer.alloc(32, 5), keyVersion: 1, encryptionKey: Buffer.alloc(32, 6), encryptionKeyVersion: 1 },
});
const freshTx = {
  ...tx,
  businessRecord: { findMany: async () => freshCustomerRows, findUnique: async () => null },
  leadRecord: { ...tx.leadRecord, findMany: async () => [], findUnique: async () => null },
  contactIdentity: { ...tx.contactIdentity, findUnique: async () => null },
  contactIdentityLink: { ...tx.contactIdentityLink, findMany: async () => [] },
};
const freshOrder = { ...order, id: 'recovery-fresh-approval', customerPhone: '13200000000', customerWechat: undefined };
assert.deepEqual(await freshBridge.resolve(freshTx, freshOrder), { status: '待创建线索' });
freshCustomerRows = [{ data: { id: 'customer-created-before-approval', name: '刚录入客户', phone: '13200000000' } }];
assert.deepEqual(
  await freshBridge.resolveAndSyncLead(freshTx, freshOrder),
  { customerId: 'customer-created-before-approval', linkedLeadId: undefined, crmIdentityStatus: '已匹配客户', leadSyncStatus: '不需要' },
  '审批必须绕过创建页缓存并读取最新 CRM 身份',
);

console.log('recovery CRM bridge identity resolution: ok');
