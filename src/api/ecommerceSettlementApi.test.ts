import assert from 'node:assert/strict';
import { ecommerceSettlementApi, buildEcommerceSettlement, createSettlementWorkbook } from './ecommerceSettlementApi';
import { STORAGE_KEYS } from '../shared/utils/constants';

const result = buildEcommerceSettlement({
  shippingFee: 2.4,
  orderRows: [
    {
      主订单编号: 'O-001',
      子订单编号: 'S-001',
      商品数量: 2,
      商家编码: 'SKU-1',
      订单应付金额: 100,
      订单提交时间: '2026-07-01 10:00:00',
      达人ID: 'talent-1',
      达人昵称: '达人一',
    },
    {
      主订单编号: 'O-002',
      子订单编号: 'S-002',
      商品数量: 1,
      商家编码: 'SKU-MISSING',
      订单应付金额: 50,
      订单提交时间: '2026-07-02 10:00:00',
      达人ID: 'talent-1',
      达人昵称: '达人一',
    },
  ],
  flowRows: [
    { 动账时间: '2026-07-03 09:00:00', 动账方向: '入账', 动账金额: 100, 动账场景: '订单结算', 子订单号: 'S-001' },
    { 动账时间: '2026-07-03 09:10:00', 动账方向: '出账', 动账金额: 5, 动账场景: '平台服务费', 子订单号: 'S-001' },
    { 动账时间: '2026-07-03 09:20:00', 动账方向: '入账', 动账金额: 10, 动账场景: '未匹配测试', 子订单号: 'S-404' },
  ],
  productCostRows: [{ 商家编码: 'SKU-1', 产品成本: 12 }],
  freightRows: [{ 订单编号: 'S-001', 支付保费: 3 }],
});

assert.equal(result.stats.orderCount, 2);
assert.equal(result.stats.flowCount, 3);
assert.equal(result.stats.talentCount, 1);
assert.equal(result.orderDetailRows[0].productCost, 24);
assert.equal(result.orderDetailRows[0].shippingFee, 4.8);
assert.equal(result.orderDetailRows[0].freightInsurance, 3);
assert.equal(result.orderDetailRows[0].flowAmount, 95);
assert.equal(result.talentSummaryRows[0].orderCount, 2);
assert.equal(result.flowSceneSummaryRows.some((row) => row.dimension === '平台服务费' && row.expenseAmount === 5), true);
assert.equal(result.exceptionRows.some((row) => row.type === '商品成本缺失'), true);
assert.equal(result.exceptionRows.some((row) => row.type === '资金流水未匹配订单'), true);

const buffer = await createSettlementWorkbook({
  id: 'test-record',
  storeName: '测试店铺',
  generatedAt: '2026-07-05T00:00:00.000Z',
  version: '1.0',
  shippingFee: 2.4,
  uploadedFileNames: [],
  ...result,
});
assert.equal(buffer.byteLength > 0, true);

const storage = (() => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) || null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => Array.from(data.keys())[index] || null,
    get length() {
      return data.size;
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

const fullRecord = {
  id: 'legacy-full-record',
  storeName: '旧记录店铺',
  generatedAt: '2026-07-05T00:00:00.000Z',
  version: '1.0',
  shippingFee: 2.4,
  uploadedFileNames: ['orders.xlsx', 'flows.xlsx'],
  ...result,
};
storage.setItem(STORAGE_KEYS.ECOMMERCE_SETTLEMENT_RECORDS, JSON.stringify([fullRecord]));

const summaries = ecommerceSettlementApi.fetchRecords();
assert.equal(summaries.length, 1);
assert.equal('orderDetailRows' in summaries[0], false);
assert.equal(summaries[0].previewTalentSummaryRows.length > 0, true);
assert.equal(
  JSON.parse(storage.getItem(STORAGE_KEYS.ECOMMERCE_SETTLEMENT_RECORDS) || '[]')[0].orderDetailRows,
  undefined,
);
