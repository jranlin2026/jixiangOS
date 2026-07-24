import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import {
  createBusinessImportTemplateWorkbook,
  createBusinessImportErrorWorkbook,
  ORDER_IMPORT_HEADERS,
  RECOVERY_IMPORT_HEADERS,
  parseBusinessImportWorkbook,
  validateBusinessImportFile,
} from './businessImportWorkbook';
import type { BusinessImportTemplateOptions } from '../types/businessImport';

const options: BusinessImportTemplateOptions = {
  products: [{ id: 'p1', name: '增长训练营', level: '标准版' }],
  orderTypes: [{ id: 't1', name: '新购' }],
  paymentChannels: ['企业微信转账'],
  users: [{ id: 'u1', name: '销售甲' }, { id: 'u2', name: '销售乙' }],
  recoveryPlatforms: [{ id: 'platform-1', name: '抖音' }],
  recoveryShops: [{ id: 'shop-1', platformId: 'platform-1', name: '旗舰店' }],
};

const buffer = await createBusinessImportTemplateWorkbook('orders', options);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(buffer);
const sheet = workbook.getWorksheet('订单导入模板')!;
const rowValues = (row: ExcelJS.Row) => (Array.isArray(row.values) ? row.values.slice(1) : []);

assert.deepEqual(rowValues(sheet.getRow(1)), [...ORDER_IMPORT_HEADERS]);
assert.equal(sheet.views[0]?.state, 'frozen');
assert.equal(sheet.views[0]?.ySplit, 1);
assert.ok(sheet.getCell('D2').dataValidation.formulae?.[0].includes('字段选项'));
assert.ok(sheet.getCell('E5001').dataValidation.formulae?.[0].includes('字段选项'));
assert.ok(sheet.getCell('G2').dataValidation.formulae?.[0].includes('字段选项'));
assert.ok(sheet.getCell('I2').dataValidation.formulae?.[0].includes('字段选项'));
assert.match(sheet.getCell('F2').numFmt, /0\.00/);
assert.match(sheet.getCell('H2').numFmt, /yyyy/);
assert.equal(sheet.getCell('B2').numFmt, '@');
assert.equal(sheet.getCell('J2').numFmt, '@');
assert.equal(sheet.getCell('K2').numFmt, '@');
assert.equal(workbook.getWorksheet('字段选项')?.state, 'hidden');
assert.ok(workbook.getWorksheet('填写说明'));
assert.equal(ORDER_IMPORT_HEADERS.some((header) => /凭证|图片/u.test(header)), false);

const recoveryBuffer = await createBusinessImportTemplateWorkbook('recovery_orders', options);
const recoveryWorkbook = new ExcelJS.Workbook();
await recoveryWorkbook.xlsx.load(recoveryBuffer);
const recoverySheet = recoveryWorkbook.getWorksheet('售后挽回订单导入模板')!;
assert.deepEqual(rowValues(recoverySheet.getRow(1)), [...RECOVERY_IMPORT_HEADERS]);
assert.ok(recoverySheet.getCell('I2').dataValidation.formulae?.[0].includes('字段选项'));
assert.ok(recoverySheet.getCell('J2').dataValidation.formulae?.[0].includes('字段选项'));
assert.ok(recoverySheet.getCell('L2').dataValidation.formulae?.[0].includes('字段选项'));
assert.ok(recoverySheet.getCell('H2').dataValidation.formulae?.[0].includes('字段选项'));
assert.match(recoverySheet.getCell('F2').numFmt, /0\.00/);
assert.match(recoverySheet.getCell('G2').numFmt, /yyyy/);
assert.equal(recoverySheet.getCell('B2').numFmt, '@');
assert.equal(recoverySheet.getCell('D2').numFmt, '@');
assert.equal(RECOVERY_IMPORT_HEADERS.some((header) => /凭证|图片/u.test(header)), false);

const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
assert.doesNotThrow(() => validateBusinessImportFile({ name: '订单.XLSX', size: 1024, type: xlsxMime }));
assert.doesNotThrow(() => validateBusinessImportFile({ name: '订单.xlsx', size: 1024, type: '' }));
assert.throws(() => validateBusinessImportFile({ name: '订单.xls', size: 1024, type: 'application/vnd.ms-excel' }), /仅支持 \.xlsx/);
assert.throws(() => validateBusinessImportFile({ name: '订单.xlsx', size: 1024, type: 'text\/csv' }), /文件类型与 \.xlsx 不匹配/);
assert.throws(() => validateBusinessImportFile({ name: '订单.xlsx', size: 20 * 1024 * 1024 + 1, type: xlsxMime }), /20 MB/);

async function workbookBuffer(sheetName: string, headers: readonly string[], rows: unknown[][]): Promise<ArrayBuffer> {
  const candidate = new ExcelJS.Workbook();
  const candidateSheet = candidate.addWorksheet(sheetName);
  candidateSheet.addRow([...headers]);
  rows.forEach((row) => candidateSheet.addRow(row));
  return candidate.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

const parsedOrders = await parseBusinessImportWorkbook('orders', await workbookBuffer(
  '订单导入模板',
  ORDER_IMPORT_HEADERS,
  [[
    '客户甲', '013800000001', 'wx_001', '增长训练营', '新购', 1999.5, '企业微信转账',
    '2026-07-24 10:30:00', '销售甲', '0000123', '0000456', '销售乙', '首单',
  ]],
));
assert.equal(parsedOrders.length, 1);
assert.deepEqual(parsedOrders[0], {
  rowNumber: 2,
  customerName: '客户甲', customerPhone: '013800000001', customerWechat: 'wx_001',
  productName: '增长训练营', orderType: '新购', paymentAmount: 1999.5,
  paymentChannel: '企业微信转账', paidAt: '2026-07-24 10:30:00', salesUserName: '销售甲',
  paymentOrderNo: '0000123', thirdPartyOrderNo: '0000456', creatorName: '销售乙', notes: '首单', remark: '',
});

await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await workbookBuffer('订单导入模板', [...ORDER_IMPORT_HEADERS, '未知字段'], [])),
  /未知表头：未知字段/,
);
await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await workbookBuffer('订单导入模板', [...ORDER_IMPORT_HEADERS, ' 手机号 '], [])),
  /重复表头：手机号/,
);
await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await workbookBuffer('订单导入模板', ORDER_IMPORT_HEADERS.filter((header) => header !== '产品名称'), [])),
  /缺少必需表头：产品名称/,
);
const formulaWorkbook = new ExcelJS.Workbook();
const formulaSheet = formulaWorkbook.addWorksheet('订单导入模板');
formulaSheet.addRow([...ORDER_IMPORT_HEADERS]);
formulaSheet.addRow(['客户甲', '013800000001', '', '增长训练营', '新购', 99, '企业微信转账', '2026-07-24', '销售甲']);
formulaSheet.getCell('Z50').value = { formula: '1+1', result: 2 };
await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await formulaWorkbook.xlsx.writeBuffer()),
  /Z50.*公式/,
);

const validOrderRow: unknown[] = [
  '客户甲', '013800000001', '', '增长训练营', '新购', 99, '企业微信转账',
  '2026-07-24', '销售甲', '', '', '', '',
];
await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await workbookBuffer('订单导入模板', [...ORDER_IMPORT_HEADERS, ''], [[...validOrderRow, '未映射数据']])),
  /第 2 行.*第 14 列.*表头/,
);
const invalidOrder = async (column: number, value: unknown) => {
  const row = [...validOrderRow];
  row[column - 1] = value;
  return workbookBuffer('订单导入模板', ORDER_IMPORT_HEADERS, [row]);
};
await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await workbookBuffer('订单导入模板', ORDER_IMPORT_HEADERS, [[...validOrderRow.slice(0, 1), '', '', ...validOrderRow.slice(3)]])),
  /第 2 行.*手机号或微信/,
);
await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await invalidOrder(6, true)),
  /第 2 行.*实付金额.*数值/,
);
await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await invalidOrder(1, true)),
  /第 2 行.*客户姓名.*文本格式/,
);
await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await invalidOrder(8, '2026-02-30')),
  /第 2 行.*付款时间.*日期/,
);
await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await invalidOrder(13, '备'.repeat(2001))),
  /第 2 行.*备注.*2000/,
);

const parsedRecovery = await parseBusinessImportWorkbook('recovery_orders', await workbookBuffer(
  '售后挽回订单导入模板',
  RECOVERY_IMPORT_HEADERS,
  [[
    '客户乙', '', 'wx_0002', '0000789', '旧课程', 800, '2026-07-24', '销售甲',
    '抖音', '旗舰店', '1200.00', '企业微信转账', '0000999', '2026-07-20 09:00', '销售乙', '', '再次成交',
  ]],
));
assert.deepEqual(parsedRecovery[0], {
  rowNumber: 2,
  customerName: '客户乙', customerPhone: '', customerWechat: 'wx_0002', thirdPartyOrderNo: '0000789',
  originalProduct: '旧课程', recoveryAmount: 800, recoveryAt: '2026-07-24', recoveryUserName: '销售甲',
  sourcePlatform: '抖音', sourceShop: '旗舰店', originalAmount: '1200.00', paymentChannel: '企业微信转账',
  paymentOrderNo: '0000999', paymentAt: '2026-07-20 09:00', assistUserName: '销售乙', creatorName: '', remark: '再次成交',
});

await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await workbookBuffer(
    '订单导入模板', ORDER_IMPORT_HEADERS, Array.from({ length: 5001 }, () => validOrderRow),
  )),
  /单次最多导入 5000 条/,
);

const errorBuffer = await createBusinessImportErrorWorkbook('orders', [{
  rowNumber: 2, status: 'blocked', reason: '@SUM(1,1)',
}], [{ ...parsedOrders[0], customerName: '=2+2', notes: '\n-1+1' }]);
const errorWorkbook = new ExcelJS.Workbook();
await errorWorkbook.xlsx.load(errorBuffer);
const errorSheet = errorWorkbook.getWorksheet('订单导入错误报告')!;
assert.equal(errorSheet.views[0]?.state, 'frozen');
assert.equal(errorSheet.views[0]?.ySplit, 1);
assert.ok(errorSheet.autoFilter);
assert.deepEqual(rowValues(errorSheet.getRow(1)), ['Excel行', ...ORDER_IMPORT_HEADERS, '状态', '警告/错误原因']);
assert.equal(errorSheet.getCell('B2').value, "'=2+2");
assert.equal(errorSheet.getCell('N2').value, "'\n-1+1");
assert.equal(errorSheet.getCell('P2').value, "'@SUM(1,1)");
assert.match(errorSheet.getCell('G2').numFmt, /0\.00/);
assert.match(errorSheet.getCell('I2').numFmt, /yyyy/);

const jobErrorBuffer = await createBusinessImportErrorWorkbook('recovery_orders', [{
  rowNumber: 2,
  status: 'warning',
  reason: '预检警告',
  normalized: parsedRecovery[0],
  executionStatus: 'failed',
  errorMessage: '=PRIVATE_FAILURE',
}], []);
const jobErrorWorkbook = new ExcelJS.Workbook();
await jobErrorWorkbook.xlsx.load(jobErrorBuffer);
const jobErrorSheet = jobErrorWorkbook.getWorksheet('售后挽回订单导入错误报告')!;
assert.equal(jobErrorSheet.getCell('S2').value, '失败');
assert.equal(jobErrorSheet.getCell('T2').value, "'=PRIVATE_FAILURE");

const workbookSource = readFileSync(join(process.cwd(), 'src/api/businessImportWorkbook.ts'), 'utf8');
assert.doesNotMatch(workbookSource, /^import\s+(?!type\b).*from\s+['"]exceljs['"]/mu);
assert.doesNotMatch(workbookSource, /await\s+import\(['"]exceljs['"]\)/u);
assert.match(workbookSource, /new Function\('specifier', 'return import\(specifier\)'\)/u);
