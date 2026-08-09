import assert from 'node:assert/strict';
import { createBrowserCatalogService, type BrowserCatalogRepository } from './browserCatalogService';
import { createBrowserLeadIntakeService } from './browserLeadIntakeService';

const actor = {
  id: 'user-customer-service',
  name: '客服小李',
  email: 'service@example.com',
  phone: '13800000000',
  role: '客服',
  permissions: ['leads:create'],
  dataScopes: {},
  isActive: true,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
} as any;

const shops = [
  {
    id: 'binding-a', businessPlatformId: 'business-platform-douyin', businessPlatformName: '抖音小店',
    businessShopId: 'business-shop-jixiang-a', platform: 'DOUYIN', shopKey: 'jixiang-a', platformShopId: 'dy-a',
    displayName: '极享官方旗舰店', aliases: ['极享官方店'], source: '抖音电商', sourceName: '飞鸽客服',
    sourceType: '公司资源', active: true, createdById: 'admin-1', createdByName: '管理员',
  },
  {
    id: 'binding-b', platform: 'DOUYIN', shopKey: 'jixiang-b', platformShopId: 'dy-b',
    displayName: '极享AI实验室', aliases: ['极享实验店'], source: '抖音电商', sourceName: '飞鸽客服',
    sourceType: '公司资源', active: true, createdById: 'admin-1', createdByName: '管理员',
  },
  {
    id: 'binding-off', platform: 'DOUYIN', shopKey: 'jixiang-off', platformShopId: null,
    displayName: '已停用店铺', aliases: [], source: '抖音电商', sourceName: '飞鸽客服',
    sourceType: '公司资源', active: false, createdById: 'admin-1', createdByName: '管理员',
  },
  {
    id: 'binding-wechat', platform: 'WECHAT', shopKey: 'wechat-main', platformShopId: null,
    displayName: '微信店铺', aliases: [], source: '微信', sourceName: '微信客服',
    sourceType: '公司资源', active: true, createdById: 'admin-1', createdByName: '管理员',
  },
];
const products = [{ id: 'prod-taojin', name: '淘金AI', price: 299, isActive: true }];
const mappings = [
  {
    id: 'map-a', shopBindingId: 'binding-a', platformIdentityKey: 'product:DY-A-100',
    platformProductId: 'DY-A-100', platformSkuId: null,
    platformProductName: '淘金AI 多模态创作智能体 读书卡', aliases: ['淘金ai 多模态创作智能体 读书卡'],
    osProductId: 'prod-taojin', osProductName: '淘金AI', active: true,
    confirmedById: 'admin-1', confirmedByName: '管理员', confirmedAt: new Date(),
  },
  {
    id: 'map-b', shopBindingId: 'binding-b', platformIdentityKey: 'sku:DY-B-SKU',
    platformProductId: null, platformSkuId: 'DY-B-SKU',
    platformProductName: 'AI创业者陪跑卡', aliases: ['ai创业者陪跑卡'],
    osProductId: 'prod-taojin', osProductName: '淘金AI', active: true,
    confirmedById: 'admin-1', confirmedByName: '管理员', confirmedAt: new Date(),
  },
];

const catalogRepository: BrowserCatalogRepository = {
  async listBusinessShops() { return []; },
  async findBusinessShopById() { return null; },
  async listShops() { return structuredClone(shops); },
  async findShopById(id) { return structuredClone(shops.find((shop) => shop.id === id) || null); },
  async findShopByPlatformAndKey(platform, shopKey) {
    return structuredClone(shops.find((shop) => shop.platform === platform && shop.shopKey === shopKey) || null);
  },
  async createShop() { throw new Error('not used'); },
  async updateShop() { throw new Error('not used'); },
  async deleteShop() { throw new Error('not used'); },
  async listMappings(shopBindingId) {
    return structuredClone(mappings.filter((mapping) => !shopBindingId || mapping.shopBindingId === shopBindingId));
  },
  async findMappingById() { throw new Error('not used'); },
  async createMapping() { throw new Error('not used'); },
  async updateMapping() { throw new Error('not used'); },
  async listProducts() { return structuredClone(products); },
  async findProductById(id) { return structuredClone(products.find((product) => product.id === id) || null); },
  async hasShopAuditReferences() { return false; },
  async withShopMappingLock() { throw new Error('not used'); },
};

const records = new Map<string, any>();
const createLeadCalls: any[] = [];

function prismaAuditSnapshot(input: any) {
  return {
    ...input,
    shopBindingId: input.shopBindingId ?? null,
    shopDisplayName: input.shopDisplayName ?? null,
    platformProductId: input.platformProductId ?? null,
    platformSkuId: input.platformSkuId ?? null,
    sourceProductName: input.sourceProductName ?? null,
    matchedProductId: input.matchedProductId ?? null,
    matchedProductName: input.matchedProductName ?? null,
    productMatchMethod: input.productMatchMethod ?? null,
    sourcePaymentAmount: input.sourcePaymentAmount === undefined ? null : String(input.sourcePaymentAmount),
    sourcePaymentAt: input.sourcePaymentAt ? new Date(input.sourcePaymentAt) : null,
  };
}

const repository = {
  async reserve(input: any) {
    const key = `${input.platform}:${input.shopKey}:${input.platformOrderNo}`;
    const existing = records.get(key);
    if (existing) {
      if (existing.status !== 'FAILED') {
        return {
          acquired: false as const,
          record: existing,
          existingLeadState: existing.existingLeadState || 'ACTIVE',
        };
      }
      Object.assign(existing, prismaAuditSnapshot(input), {
        status: 'PENDING',
        lastError: null,
        attemptCount: existing.attemptCount + 1,
        attemptToken: `attempt-${existing.attemptCount + 1}`,
        updatedAt: new Date(),
      });
      return { acquired: true as const, record: existing };
    }
    const record = {
      id: `browser-sync-${records.size + 1}`,
      ...prismaAuditSnapshot(input),
      status: 'PENDING',
      orderRemarkStatus: 'NOT_ATTEMPTED',
      greenFlagStatus: 'NOT_ATTEMPTED',
      attemptCount: 1,
      attemptToken: 'attempt-1',
      updatedAt: new Date(),
    };
    records.set(key, record);
    return { acquired: true as const, record };
  },
  async markSucceeded(id: string, attemptToken: string, input: any) {
    const current = [...records.values()].find((item) => item.id === id);
    if (current.attemptToken !== attemptToken || current.status !== 'PENDING') return current;
    Object.assign(current, input, {
      status: 'SUCCEEDED',
      completedAt: current.completedAt || new Date('2026-08-08T13:00:00.000Z'),
    });
    return current;
  },
  async markFailed(id: string, attemptToken: string, errorMessage: string) {
    const current = [...records.values()].find((item) => item.id === id);
    if (current.attemptToken !== attemptToken || current.status !== 'PENDING') return current;
    Object.assign(current, { status: 'FAILED', lastError: errorMessage });
    return current;
  },
  async reportOrderRemark(id: string, operator: any, input: any) {
    const current = [...records.values()].find((item) => item.id === id);
    if (!current) return null;
    Object.assign(current, {
      orderRemarkStatus: input.status,
      orderRemarkError: input.errorMessage || null,
      remarkOperatorId: operator.id,
      remarkOperatorName: operator.name,
    });
    return current;
  },
  async reportPlatformCompletion(id: string, operator: any, input: any) {
    const current = [...records.values()].find((item) => item.id === id);
    if (!current) return null;
    Object.assign(current, {
      orderRemarkStatus: input.orderRemarkStatus,
      greenFlagStatus: input.greenFlagStatus,
      orderRemarkError: input.errorMessage || null,
      greenFlagError: input.errorMessage || null,
      remarkOperatorId: operator.id,
      remarkOperatorName: operator.name,
    });
    return current;
  },
};

const authoritativeCatalog = createBrowserCatalogService({ repository: catalogRepository });
let catalogResolveCalls = 0;
const service = createBrowserLeadIntakeService({
  repository,
  catalog: {
    async resolveForIntake(input) {
      catalogResolveCalls += 1;
      return authoritativeCatalog.resolveForIntake(input);
    },
  },
  async createLead(input, currentUser) {
    createLeadCalls.push({ input, currentUser });
    return {
      code: 0,
      data: {
        id: `lead-${createLeadCalls.length}`,
        name: input.name,
        phone: input.phone,
        wechat: input.wechat,
        assignedTo: '销售小王',
        assignedToId: 'sales-1',
        intakeStatus: '入库成功',
      },
      message: 'success',
    } as any;
  },
});

const shopAInput = {
  platform: 'DOUYIN' as const,
  shopBindingId: 'binding-a',
  pageShopDisplayName: '极享官方旗舰店',
  platformOrderNo: 'DY-20260808-A001',
  contactName: '张先生',
  contactSource: 'CHAT' as const,
  contactPhone: '13800138000',
  contactWechat: 'wx_original_88',
  platformProductId: 'DY-A-100',
  platformProductName: '淘金AI 多模态创作智能体 读书卡',
  paymentAmount: 299,
  paymentAt: '2026-08-08T09:00:00+08:00',
};

const first = await service.intake({
  ...shopAInput,
  source: '插件伪造来源',
  sourceName: '插件伪造客服',
  sourceType: '个人资源',
  sourceProductId: 'plugin-product',
  sourceProductName: '插件伪造OS产品',
} as typeof shopAInput, actor);
assert.equal(first.code, 0);
assert.equal(first.data?.outcome, 'CREATED');
assert.equal(first.data?.lead.assignedTo, '销售小王');
assert.equal(first.data?.lead.assignedToId, 'sales-1');
assert.equal(first.data?.lead.intakeStatus, '入库成功');
assert.equal(first.data?.completedAt, '2026-08-08T13:00:00.000Z');
assert.deepEqual(first.data?.remarkLines, [
  '#张先生/手机号：13800138000/微信号：wx_original_88（对接：销售小王）',
  '#入OS（2026-08-08 21:00）',
]);
assert.deepEqual(first.data?.shop, {
  id: 'binding-a',
  shopKey: 'jixiang-a',
  displayName: '极享官方旗舰店',
});
assert.deepEqual(first.data?.productResolution, {
  status: 'MATCHED', method: 'PLATFORM_PRODUCT_ID', osProductId: 'prod-taojin', osProductName: '淘金AI',
  rawProductName: '淘金AI 多模态创作智能体 读书卡',
});
assert.equal(createLeadCalls.length, 1);
assert.deepEqual(createLeadCalls[0].input, {
  externalIntakeKey: 'browser-sync-1',
  name: '张先生',
  phone: '13800138000',
  phones: [{ number: '13800138000', isPrimary: true, label: '主手机号' }],
  wechat: 'wx_original_88',
  source: '抖音电商',
  sourceName: '飞鸽客服',
  sourceType: '公司资源',
  sourcePlatformId: 'business-platform-douyin',
  sourcePlatformName: '抖音小店',
  sourceShopId: 'business-shop-jixiang-a',
  sourceShopName: '极享官方旗舰店',
  platformOrderNo: 'DY-20260808-A001',
  sourceProductId: 'prod-taojin',
  sourceProductName: '淘金AI',
  sourcePaymentAmount: 299,
  sourcePaymentAt: '2026-08-08T01:00:00.000Z',
  remark: '由极享AI浏览器员工从飞鸽客服录入；店铺：极享官方旗舰店；平台商品：淘金AI 多模态创作智能体 读书卡；匹配OS产品：淘金AI',
  status: '新线索',
});
assert.deepEqual({
  shopBindingId: records.get('DOUYIN:jixiang-a:DY-20260808-A001').shopBindingId,
  shopDisplayName: records.get('DOUYIN:jixiang-a:DY-20260808-A001').shopDisplayName,
  platformProductId: records.get('DOUYIN:jixiang-a:DY-20260808-A001').platformProductId,
  sourceProductName: records.get('DOUYIN:jixiang-a:DY-20260808-A001').sourceProductName,
  matchedProductId: records.get('DOUYIN:jixiang-a:DY-20260808-A001').matchedProductId,
  matchedProductName: records.get('DOUYIN:jixiang-a:DY-20260808-A001').matchedProductName,
  productMatchMethod: records.get('DOUYIN:jixiang-a:DY-20260808-A001').productMatchMethod,
  sourcePaymentAmount: records.get('DOUYIN:jixiang-a:DY-20260808-A001').sourcePaymentAmount,
  sourcePaymentAt: records.get('DOUYIN:jixiang-a:DY-20260808-A001').sourcePaymentAt,
}, {
  shopBindingId: 'binding-a',
  shopDisplayName: '极享官方旗舰店',
  platformProductId: 'DY-A-100',
  sourceProductName: '淘金AI 多模态创作智能体 读书卡',
  matchedProductId: 'prod-taojin',
  matchedProductName: '淘金AI',
  productMatchMethod: 'PLATFORM_PRODUCT_ID',
  sourcePaymentAmount: '299',
  sourcePaymentAt: new Date('2026-08-08T09:00:00+08:00'),
});

const shopB = await service.intake({
  ...shopAInput,
  shopBindingId: 'binding-b',
  pageShopDisplayName: '极享实验店',
  platformOrderNo: 'DY-20260808-B001',
  platformProductId: undefined,
  platformSkuId: 'DY-B-SKU',
  platformProductName: 'AI创业者陪跑卡',
  paymentAmount: 399,
}, actor);
assert.equal(shopB.code, 0);
assert.equal(createLeadCalls[1].input.sourceProductName, '淘金AI');
assert.equal(createLeadCalls[1].input.sourcePaymentAmount, 399, '飞鸽实付不得被OS参考价299覆盖');
assert.equal(createLeadCalls[1].input.sourceShopId, 'jixiang-b');
assert.equal(createLeadCalls[1].input.sourceShopName, '极享AI实验室');

const unmatched = await service.intake({
  ...shopAInput,
  platformOrderNo: 'DY-20260808-A002',
  platformProductId: undefined,
  platformProductName: '完全未配置的平台商品',
  paymentAmount: 188,
}, actor);
assert.equal(unmatched.code, 0, '未匹配商品仍必须创建线索');
assert.equal(Object.prototype.hasOwnProperty.call(createLeadCalls[2].input, 'sourceProductId'), false);
assert.equal(Object.prototype.hasOwnProperty.call(createLeadCalls[2].input, 'sourceProductName'), false);
assert.match(createLeadCalls[2].input.remark, /平台商品待匹配：完全未配置的平台商品/);
assert.deepEqual(unmatched.data?.productResolution, {
  status: 'UNMATCHED', rawProductName: '完全未配置的平台商品',
});

for (const shopBindingId of ['binding-off', 'binding-missing']) {
  const unavailable = await service.intake({
    ...shopAInput,
    shopBindingId,
    platformOrderNo: `DY-20260808-${shopBindingId}`,
  }, actor);
  assert.equal(unavailable.code, 409);
  assert.equal(unavailable.errorCode, 'SHOP_BINDING_UNAVAILABLE');
}
assert.equal(createLeadCalls.length, 3, '停用或不存在店铺不得创建线索');

const wrongPlatformBinding = await service.intake({
  ...shopAInput,
  shopBindingId: 'binding-wechat',
  pageShopDisplayName: '微信店铺',
  platformOrderNo: 'DY-20260808-WRONG-PLATFORM',
}, actor);
assert.equal(wrongPlatformBinding.code, 409);
assert.equal(wrongPlatformBinding.errorCode, 'SHOP_BINDING_UNAVAILABLE');
assert.equal(createLeadCalls.length, 3, '抖音入库不得使用其他平台的店铺绑定');

const legacyShopKeyOnly = await service.intake({
  ...shopAInput,
  shopBindingId: undefined,
  shopKey: 'jixiang-a',
  platformOrderNo: 'DY-20260808-LEGACY',
} as any, actor);
assert.equal(legacyShopKeyOnly.code, 400);
assert.equal(legacyShopKeyOnly.message, '店铺绑定不能为空');
assert.equal(createLeadCalls.length, 3, '仅提交旧 shopKey 合同不得进入创建线索');

const mismatch = await service.intake({
  ...shopAInput,
  platformOrderNo: 'DY-20260808-MISMATCH',
  pageShopDisplayName: '完全不相关的店铺',
}, actor);
assert.equal(mismatch.code, 409);
assert.equal(mismatch.errorCode, 'SHOP_CONTEXT_MISMATCH');
assert.equal(createLeadCalls.length, 3, '页面店铺不匹配时不得创建线索');

const optionalFactsDuplicate = await service.intake({
  ...shopAInput,
  pageShopDisplayName: undefined,
  platformProductId: undefined,
  platformProductName: undefined,
  paymentAmount: undefined,
  paymentAt: undefined,
} as any, actor);
assert.equal(optionalFactsDuplicate.code, 0, '页面店铺、商品、实付和付款时间缺失不应阻断入OS');
assert.equal(optionalFactsDuplicate.data?.outcome, 'ALREADY_CREATED');
assert.equal(createLeadCalls.length, 3, '重复订单仍不得创建第二条线索');

for (const [label, invalidFacts, expectedMessage] of [
  ['无效实付', { paymentAmount: Number.NaN }, /非负数且最多两位小数/],
  ['无效付款时间', { paymentAt: 'not-a-time' }, /付款时间/],
] as const) {
  const beforeResolve = catalogResolveCalls;
  const beforeRecords = records.size;
  const beforeCreates: number = createLeadCalls.length;
  const invalidFactsResult = await service.intake({
    ...shopAInput,
    platformOrderNo: `DY-20260808-REQUIRED-${label}`,
    ...invalidFacts,
  } as any, actor);
  assert.equal(invalidFactsResult.code, 400, `${label}时必须在入库边界失败关闭`);
  assert.match(invalidFactsResult.message, expectedMessage);
  assert.equal(catalogResolveCalls, beforeResolve, `${label}时不得调用商品解析器`);
  assert.equal(records.size, beforeRecords, `${label}时不得预留同步记录`);
  assert.equal(createLeadCalls.length, beforeCreates, `${label}时不得创建线索`);
}

for (const paymentAmount of [-0.01, 299.001]) {
  const invalidAmount = await service.intake({
    ...shopAInput,
    paymentAmount,
    platformOrderNo: `DY-20260808-AMOUNT-${paymentAmount}`,
  }, actor);
  assert.equal(invalidAmount.code, 400);
  assert.match(invalidAmount.message, /非负数且最多两位小数/);
}
assert.equal(createLeadCalls.length, 3, '非法金额不得预留或创建线索');

products.push({ id: 'prod-conflict', name: '冲突产品', price: 699, isActive: true });
mappings.push({
  ...mappings[0],
  id: 'map-conflict',
  osProductId: 'prod-conflict',
  osProductName: '冲突产品',
});
const configConflict = await service.intake({
  ...shopAInput,
  platformOrderNo: 'DY-20260808-CONFLICT',
}, actor);
assert.equal(configConflict.code, 409);
assert.equal(configConflict.errorCode, 'PRODUCT_MAPPING_CONFIG_CONFLICT');
assert.match(configConflict.message, /请在极享OS修正冲突映射后重试/);
assert.equal(createLeadCalls.length, 3, '商品映射冲突必须在创建线索前失败关闭');
mappings.pop();
products.pop();

const firstSyncRecord = records.get('DOUYIN:jixiang-a:DY-20260808-A001');
firstSyncRecord.existingLeadState = 'RECYCLED';
const recycled = await service.intake(shopAInput, actor);
assert.deepEqual(recycled, {
  code: 409,
  data: null,
  errorCode: 'LEAD_IN_RECYCLE_BIN',
  message: '该订单已录入极享OS，但原线索已在业务回收站。请先恢复原线索，或由管理员彻底清理该订单的同步记录后再重试；本次不会修改飞鸽订单。',
});
assert.equal(createLeadCalls.length, 3, '回收站线索不得自动创建第二条线索');
firstSyncRecord.existingLeadState = 'ACTIVE';

const duplicate = await service.intake({
  ...shopAInput,
  shopBindingId: ` ${shopAInput.shopBindingId} `,
  platformOrderNo: ` ${shopAInput.platformOrderNo} `,
  contactName: ' 张先生 ',
  contactPhone: ' 13800138000 ',
  contactWechat: ' WX_ORIGINAL_88 ',
}, actor);
assert.equal(duplicate.code, 0);
assert.equal(duplicate.data?.outcome, 'ALREADY_CREATED');
assert.equal(duplicate.errorCode, undefined);
assert.doesNotMatch(duplicate.message, /原线索已不存在|管理员彻底清理/, '并发输家读到 ACTIVE 成功记录时不得误报孤儿同步');
assert.equal(duplicate.data?.lead.id, 'lead-1');
assert.deepEqual(duplicate.data?.storedContact, {
  nickname: '张先生',
  phone: '13800138000',
  wechat: 'wx_original_88',
}, '重复入库必须返回已关联线索的实际联系快照');
assert.deepEqual(duplicate.data?.productResolution, first.data?.productResolution);
assert.equal(duplicate.data?.completedAt, first.data?.completedAt);
assert.deepEqual(duplicate.data?.remarkLines, first.data?.remarkLines);
assert.deepEqual(duplicate.data?.shop, first.data?.shop);
assert.equal(createLeadCalls.length, 3, '重复点击不能再创建线索');
assert.equal(records.size, 3, '业务幂等键必须先规范化再持久化');

const contactConflict = await service.intake({
  ...shopAInput,
  contactName: '另一个昵称',
  contactPhone: '13900139000',
  contactWechat: 'wx_other_99',
}, actor);
assert.equal(contactConflict.code, 409);
assert.equal(contactConflict.errorCode, 'ORDER_CONTACT_CONFLICT');
assert.match(contactConflict.message, /昵称不一致、手机号不一致、微信号不一致/);
assert.doesNotMatch(contactConflict.message, /另一个昵称|13900139000|wx_other_99|张先生|13800138000|wx_original_88/i);
assert.equal(createLeadCalls.length, 3, '资料冲突不得自动创建第二条线索');

for (const conflict of [
  {
    input: { ...shopAInput, contactName: '另一个昵称' },
    expected: '昵称不一致',
    unexpected: /手机号不一致|微信号不一致/,
  },
  {
    input: { ...shopAInput, contactPhone: '13900139000' },
    expected: '手机号不一致',
    unexpected: /昵称不一致|微信号不一致/,
  },
  {
    input: { ...shopAInput, contactWechat: 'wx_other_99' },
    expected: '微信号不一致',
    unexpected: /昵称不一致|手机号不一致/,
  },
] as const) {
  const actualConflict = await service.intake(conflict.input, actor);
  assert.equal(actualConflict.errorCode, 'ORDER_CONTACT_CONFLICT');
  assert.match(actualConflict.message, new RegExp(conflict.expected));
  assert.doesNotMatch(actualConflict.message, conflict.unexpected, '冲突提示只能列出实际差异字段');
}

firstSyncRecord.storedContact.phone = '+8613800138000';
const normalizedPhoneDuplicate = await service.intake(shopAInput, actor);
assert.equal(normalizedPhoneDuplicate.code, 0, '手机号比较必须复用极享OS号码归一化规则');
firstSyncRecord.storedContact.phone = '13800138000';

firstSyncRecord.existingLeadState = 'MISSING';
const missingSuccessfulLead = await service.intake(shopAInput, actor);
assert.deepEqual(missingSuccessfulLead, {
  code: 409,
  data: null,
  errorCode: 'LEAD_SYNC_RECORD_ORPHANED',
  message: '该订单的同步记录显示已录入，但原线索已不存在。请由管理员彻底清理该订单的同步记录后再重试；本次不会修改飞鸽订单。',
});
assert.equal(createLeadCalls.length, 3, '成功同步关联线索消失时不得静默创建第二条线索');
firstSyncRecord.existingLeadState = 'ACTIVE';

const originalStoredContact = firstSyncRecord.storedContact;
firstSyncRecord.storedContact = { ...originalStoredContact, nickname: '张\n先生' };
const malformedStoredContact = await service.intake(shopAInput, actor);
firstSyncRecord.storedContact = originalStoredContact;
assert.equal(malformedStoredContact.code, 409);
assert.equal(
  malformedStoredContact.message,
  '订单备注中的客户昵称不能包含换行，请先在极享OS清理后重试',
  '已持久化的权威字段含换行时必须返回可操作错误而非写入飞鸽',
);

const invalid = await service.intake({
  ...shopAInput,
  platformOrderNo: 'DY-20260808-INVALID',
  contactPhone: undefined,
  contactWechat: undefined,
}, actor);
assert.equal(invalid.code, 400);
assert.equal(invalid.message, '手机号或微信至少填写一项');
assert.equal(createLeadCalls.length, 3, '无效联系方式不能进入线索创建');

const retryCreateLeadCalls: any[] = [];
const retryService = createBrowserLeadIntakeService({
  repository,
  catalog: createBrowserCatalogService({ repository: catalogRepository }),
  async createLead(input) {
    retryCreateLeadCalls.push(input);
    if (retryCreateLeadCalls.length === 1) {
      return { code: 503, data: null, message: '极享OS暂时不可用' } as any;
    }
    return {
      code: 0,
      data: {
        id: 'lead-retried',
        name: input.name,
        phone: input.phone,
        wechat: input.wechat,
        assignedTo: '销售小周',
        assignedToId: 'sales-2',
        intakeStatus: '入库成功',
      },
      message: 'success',
    } as any;
  },
});
const retryOrderInput = {
  ...shopAInput,
  platformOrderNo: 'DY-20260808-RETRY',
};
const failedFirstAttempt = await retryService.intake(retryOrderInput, actor);
assert.equal(failedFirstAttempt.code, 503);
const originalMapping = { ...mappings[0] };
products.push({ id: 'prod-corrected', name: '更正后OS产品', price: 599, isActive: true });
Object.assign(mappings[0], {
  osProductId: 'prod-corrected',
  osProductName: '更正后OS产品',
});
const retried = await retryService.intake({
  ...retryOrderInput,
  platformProductName: '更正后的平台商品',
  paymentAmount: 399.25,
  paymentAt: '2026-08-09T10:30:00+08:00',
}, actor);
Object.assign(mappings[0], originalMapping);
products.pop();
assert.equal(retried.code, 0);
assert.equal(retried.data?.outcome, 'CREATED');
assert.deepEqual({
  sourceProductId: retryCreateLeadCalls[1].sourceProductId,
  sourceProductName: retryCreateLeadCalls[1].sourceProductName,
  sourcePaymentAmount: retryCreateLeadCalls[1].sourcePaymentAmount,
  sourcePaymentAt: retryCreateLeadCalls[1].sourcePaymentAt,
  remark: retryCreateLeadCalls[1].remark,
}, {
  sourceProductId: 'prod-corrected',
  sourceProductName: '更正后OS产品',
  sourcePaymentAmount: 399.25,
  sourcePaymentAt: '2026-08-09T02:30:00.000Z',
  remark: '由极享AI浏览器员工从飞鸽客服录入；店铺：极享官方旗舰店；平台商品：更正后的平台商品；匹配OS产品：更正后OS产品',
}, '重试创建线索必须只使用原子抢占后的当前审计快照');
const retriedRecord = records.get('DOUYIN:jixiang-a:DY-20260808-RETRY');
assert.deepEqual({
  matchedProductId: retriedRecord.matchedProductId,
  matchedProductName: retriedRecord.matchedProductName,
  productMatchMethod: retriedRecord.productMatchMethod,
  sourceProductName: retriedRecord.sourceProductName,
  sourcePaymentAmount: retriedRecord.sourcePaymentAmount,
  sourcePaymentAt: retriedRecord.sourcePaymentAt,
  attemptCount: retriedRecord.attemptCount,
}, {
  matchedProductId: 'prod-corrected',
  matchedProductName: '更正后OS产品',
  productMatchMethod: 'PLATFORM_PRODUCT_ID',
  sourceProductName: '更正后的平台商品',
  sourcePaymentAmount: '399.25',
  sourcePaymentAt: new Date('2026-08-09T02:30:00.000Z'),
  attemptCount: 2,
});
assert.deepEqual(retried.data?.productResolution, {
  status: 'MATCHED',
  method: 'PLATFORM_PRODUCT_ID',
  osProductId: 'prod-corrected',
  osProductName: '更正后OS产品',
  rawProductName: '更正后的平台商品',
}, '重试响应必须返回刷新后的持久化商品审计');

const remark = await service.reportOrderRemark('browser-sync-1', { status: 'SUBMITTED' }, actor);
assert.equal(remark.code, 0);
assert.equal(remark.data?.orderRemarkStatus, 'SUBMITTED');
const colleagueRemark = await service.reportOrderRemark(
  'browser-sync-1',
  { status: 'FAILED', errorMessage: '备注按钮未找到' },
  { ...actor, id: 'user-customer-service-2', name: '客服小周' },
);
assert.equal(colleagueRemark.code, 0, '另一位有权限的客服接手时仍可回报备注');

const completion = await service.reportPlatformCompletion('browser-sync-1', {
  orderRemarkStatus: 'SUCCEEDED',
  greenFlagStatus: 'SUCCEEDED',
}, actor);
assert.equal(completion.code, 0);
assert.equal(completion.data?.orderRemarkStatus, 'SUCCEEDED');
assert.equal(completion.data?.greenFlagStatus, 'SUCCEEDED');

const invalidRemarkCompletion = await service.reportPlatformCompletion('browser-sync-1', {
  orderRemarkStatus: 'NOT_ATTEMPTED' as any,
  greenFlagStatus: 'SUCCEEDED',
}, actor);
assert.equal(invalidRemarkCompletion.code, 400);

const invalidGreenFlagCompletion = await service.reportPlatformCompletion('browser-sync-1', {
  orderRemarkStatus: 'SUCCEEDED',
  greenFlagStatus: 'UNKNOWN' as any,
}, actor);
assert.equal(invalidGreenFlagCompletion.code, 400);

const throwingService = createBrowserLeadIntakeService({
  repository,
  catalog: createBrowserCatalogService({ repository: catalogRepository }),
  async createLead() {
    throw new Error('数据库连接中断');
  },
});
const thrown = await throwingService.intake({
  ...shopAInput,
  platformOrderNo: 'DY-20260808-THROW',
}, actor);
assert.equal(thrown.code, 500);
assert.match(thrown.message, /数据库连接中断/);
assert.equal(
  [...records.values()].find((item) => item.platformOrderNo === 'DY-20260808-THROW')?.status,
  'FAILED',
  '意外异常不能让订单永久停留在入库中',
);

console.log('browser lead intake mapped products: ok');
