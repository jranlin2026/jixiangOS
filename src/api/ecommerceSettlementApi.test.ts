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
      支付完成时间: '2026-07-01 10:05:00',
      发货时间: '2026-07-02 10:00:00',
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
      支付完成时间: '2026-07-02 10:05:00',
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
  freightRows: [{ 订单编号: 'S-001', 支付保费: 3, 保费状态: '已扣减' }],
});

assert.equal(result.stats.orderCount, 2);
assert.equal(result.stats.flowCount, 3);
assert.equal(result.stats.talentCount, 1);
assert.equal(result.orderDetailRows[0].productCost, 24);
assert.equal(result.orderDetailRows[0].freightInsurance, 3);
assert.equal(result.orderDetailRows[0].flowAmount, 95);
assert.equal(result.talentSummaryRows[0].orderCount, 2);
assert.equal(result.talentSummaryRows[0].packageCount, 1);
assert.equal(result.talentSummaryRows[0].shippingFee, 2.4);
assert.equal(result.flowSceneSummaryRows.some((row) => row.dimension === '平台服务费' && row.expenseAmount === 5), true);
assert.equal(result.flowOverviewRows.some((row) => row.metric === '流水总笔数' && row.value === 3), true);
assert.equal(result.exceptionRows.some((row) => row.type === '商品成本缺失'), true);
assert.equal(result.exceptionRows.some((row) => row.type === '资金流水未匹配订单'), true);

const jxFinanceRegression = buildEcommerceSettlement({
  shippingFee: 2.4,
  orderRows: [{
    主订单编号: 'M1',
    子订单编号: 'S1',
    商品数量: '1',
    商家编码: 'SKU1',
    商品单价: '100',
    订单应付金额: '100',
    平台实际承担优惠金额: '5',
    商家实际承担优惠金额: '3',
    达人实际承担优惠金额: '2',
    订单提交时间: '2026-05-10 10:00:00',
    支付完成时间: '2026-05-10 10:01:00',
    发货时间: '2026-05-11 09:00:00',
    达人ID: '',
    达人昵称: '',
  }],
  flowRows: [
    { 子订单号: 'S1', 订单号: 'M1', 动账方向: '入账', 动账金额: '80', 动账场景: '货款结算入账', 动账时间: '2026-06-01 12:00:00' },
    { 子订单号: '', 订单号: '', 动账方向: '出账', 动账金额: '2', 动账场景: '', 备注: '保费扣除', 动账时间: '2026-06-01 12:01:00' },
  ],
  productCostRows: [],
  freightRows: [],
});

assert.equal(jxFinanceRegression.orderDetailRows[0].talentName, '商品卡流量');
assert.equal(jxFinanceRegression.talentSummaryRows[0].payableAmount, 110);
assert.equal(jxFinanceRegression.talentSummaryRows[0].flowAmount, 80);
assert.equal(jxFinanceRegression.talentSummaryRows[0].shippingFee, 2.4);
assert.equal(jxFinanceRegression.talentSummaryRows[0].estimatedProfit, 77.6);

const strictMatchingRegression = buildEcommerceSettlement({
  shippingFee: 0,
  orderRows: [
    { 主订单编号: 'M1', 子订单编号: 'S1', 商品数量: '2', 商家编码: 'SKU1', 订单应付金额: '100', 订单提交时间: '2026-05-10', 支付完成时间: '2026-05-10', 达人ID: 'T1', 达人昵称: '达人A' },
    { 主订单编号: 'M1', 子订单编号: 'S2', 商品数量: '1', 商家编码: 'SKU1', 订单应付金额: '80', 订单提交时间: '2026-05-10', 支付完成时间: '2026-05-10', 达人ID: 'T1', 达人昵称: '达人A' },
  ],
  flowRows: [
    { 子订单号: 'S1', 订单号: 'M1', 动账方向: '入账', 动账金额: '70', 动账时间: '2026-06-01' },
    { 子订单号: 'S2', 订单号: 'M1', 动账方向: '入账', 动账金额: '4', 动账时间: '2026-06-01' },
    { 子订单号: 'S999', 订单号: 'M1', 动账方向: '出账', 动账金额: '5', 动账时间: '2026-06-01' },
  ],
  productCostRows: [{ 商家编码: 'SKU1', 产品单价: '20' }],
  freightRows: [
    { 订单编号: 'S1', 支付保费: '3.2', 保费状态: '已扣减', 动账时间: '2026-05-10' },
    { 订单编号: 'M1', 支付保费: '9.9', 保费状态: '已扣减', 动账时间: '2026-05-10' },
    { 订单编号: 'S2', 支付保费: '1.1', 保费状态: '不扣减', 动账时间: '2026-05-10' },
  ],
});

assert.deepEqual(strictMatchingRegression.orderDetailRows.map((row) => row.freightInsurance), [3.2, 0]);
assert.deepEqual(strictMatchingRegression.orderDetailRows.map((row) => row.flowAmount), [70, 4]);
assert.equal(strictMatchingRegression.talentSummaryRows[0].freightInsurance, 3.2);
assert.equal(strictMatchingRegression.talentSummaryRows[0].productCost, 40);
assert.equal(strictMatchingRegression.exceptionRows.some((row) => row.type === '运费险未匹配子订单'), true);

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

const ExcelJSModule = await import('exceljs');
const ExcelJS = ExcelJSModule.default || ExcelJSModule;
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(buffer);
const sheetHeaders = (sheetName: string) => {
  const sheet = workbook.getWorksheet(sheetName);
  assert.ok(sheet);
  const values = sheet.getRow(1).values;
  assert.ok(Array.isArray(values));
  return values.slice(1);
};

assert.deepEqual(sheetHeaders('订单明细融合表'), [
  '订单月份',
  '主订单编号',
  '子订单编号',
  '结算到账金额',
  '运费险',
  '商品数量',
  '商家编码',
  '商品单价',
  '订单应付金额',
  '产品单件成本',
  '产品总成本',
  '订单提交时间',
  '订单完成时间',
  '支付完成时间',
  '达人ID',
  '达人昵称',
  '发货时间',
]);
assert.deepEqual(sheetHeaders('达人结算汇总表'), [
  '订单月份',
  '达人昵称',
  '达人ID',
  '实付订单金额',
  '实付订单数',
  '快递包裹数',
  '快递费用',
  '运费险费用',
  '结算到账金额',
  '产品成本',
  '成本总额',
  '毛利润',
  '销售额毛利率',
]);

const firstRecord = {
  id: 'test-record-1',
  storeName: '测试店铺A',
  generatedAt: '2026-07-05T00:00:00.000Z',
  version: '1.0',
  shippingFee: 2.4,
  uploadedFileNames: [],
  ...result,
};
const secondRecord = {
  ...firstRecord,
  id: 'test-record-2',
  storeName: '测试店铺B',
};
const batchBuffer = await ecommerceSettlementApi.createBatchWorkbook({
  batchName: '2026-07 批次',
  month: '2026-07',
  records: [firstRecord, secondRecord],
});
const batchWorkbook = new ExcelJS.Workbook();
await batchWorkbook.xlsx.load(batchBuffer);
const batchSheetHeaders = (sheetName: string) => {
  const sheet = batchWorkbook.getWorksheet(sheetName);
  assert.ok(sheet);
  const values = sheet.getRow(1).values;
  assert.ok(Array.isArray(values));
  return values.slice(1);
};
assert.equal(Boolean(batchWorkbook.getWorksheet('全部店铺利润总览')), true);
assert.deepEqual(batchSheetHeaders('订单明细融合表'), [
  '店铺名称',
  '订单月份',
  '主订单编号',
  '子订单编号',
  '结算到账金额',
  '运费险',
  '商品数量',
  '商家编码',
  '商品单价',
  '订单应付金额',
  '产品单件成本',
  '产品总成本',
  '订单提交时间',
  '订单完成时间',
  '支付完成时间',
  '达人ID',
  '达人昵称',
  '发货时间',
]);
assert.deepEqual(batchSheetHeaders('达人结算汇总表'), [
  '店铺名称',
  '订单月份',
  '达人昵称',
  '达人ID',
  '实付订单金额',
  '实付订单数',
  '快递包裹数',
  '快递费用',
  '运费险费用',
  '结算到账金额',
  '产品成本',
  '成本总额',
  '毛利润',
  '销售额毛利率',
]);

const workbookFile = async (name: string, headers: string[], rows: Array<Array<string | number>>) => {
  const fileWorkbook = new ExcelJS.Workbook();
  const sheet = fileWorkbook.addWorksheet('Sheet1');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  const fileBuffer = await fileWorkbook.xlsx.writeBuffer();
  return new File([fileBuffer], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

await assert.rejects(
  ecommerceSettlementApi.createFromFiles({
    storeName: '测试店铺',
    shippingFee: 2.4,
    orderFile: await workbookFile('错误订单表.xlsx', ['动账时间', '动账方向', '动账金额'], [['2026-07-01', '入账', 10]]),
    flowFiles: [await workbookFile('资金流水.xlsx', ['动账时间', '动账方向', '动账金额', '子订单号'], [['2026-07-01', '入账', 10, 'S-001']])],
  }),
  /订单明细表「错误订单表\.xlsx」缺少必要字段/,
);

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
