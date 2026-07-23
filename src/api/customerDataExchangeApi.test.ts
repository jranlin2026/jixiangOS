import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  createCustomerExportWorkbook,
  createCustomerImportErrorWorkbook,
  createCustomerImportTemplateWorkbook,
  parseCustomerImportWorkbook,
} from './customerDataExchangeApi';
import { CUSTOMER_IMPORT_HEADERS, CUSTOMER_IMPORT_MAX_ROWS } from '../types/customerDataExchange';

assert.equal(CUSTOMER_IMPORT_MAX_ROWS, 5_000);

const options = {
  ownerNames: ['销售甲'],
  userNames: ['销售甲', '录入乙', '贡献丙'],
  lifecycleStatuses: ['待跟进', '跟进中'],
  customerLevels: ['L1-潜客'],
  leadSources: ['市场品牌部-官网'],
  tagNames: ['高意向'],
  canOverrideAttribution: false,
  canImportToPublicPool: true,
};

const template = await createCustomerImportTemplateWorkbook(options, 'assigned');
const templateBook = new ExcelJS.Workbook();
await templateBook.xlsx.load(template);
const templateHeaders = templateBook.worksheets[0].getRow(1).values;
assert.deepEqual(Array.isArray(templateHeaders) ? templateHeaders.slice(1) : [], [...CUSTOMER_IMPORT_HEADERS]);
assert.equal(
  Array.isArray(templateHeaders) && templateHeaders.includes('最后跟进记录'),
  true,
  '客户导入模板应包含最后跟进记录字段',
);
assert.equal(Array.isArray(templateHeaders) && templateHeaders.includes('上一个销售负责人'), true);
assert.equal(Array.isArray(templateHeaders) && templateHeaders.includes('首个销售负责人'), true);
assert.equal(Array.isArray(templateHeaders) && templateHeaders.includes('线索录入人'), true);
assert.equal(Array.isArray(templateHeaders) && templateHeaders.includes('线索贡献人'), true);
assert.equal(templateBook.worksheets[0].getCell('E2').dataValidation.type, 'list');
assert.equal(templateBook.worksheets[0].getCell('H2').dataValidation.type, 'list');
assert.equal(templateBook.worksheets[0].getCell('I2').dataValidation.type, 'list');
assert.match(templateBook.getWorksheet('填写说明')!.getColumn(2).values.join('|'), /单次最多 5000 条/);

const publicPoolTemplate = await createCustomerImportTemplateWorkbook({
  ...options,
  lifecycleStatuses: ['待跟进', '流失公海'],
}, 'public_pool');
const publicPoolTemplateBook = new ExcelJS.Workbook();
await publicPoolTemplateBook.xlsx.load(publicPoolTemplate);
assert.doesNotMatch(
  publicPoolTemplateBook.getWorksheet('字段选项')!.getColumn(2).values.join('|'),
  /流失公海/,
);
assert.equal(publicPoolTemplateBook.worksheets[0].getCell('E2').dataValidation?.type, undefined);
assert.equal(publicPoolTemplateBook.worksheets[0].getCell('J2').dataValidation?.type, undefined);
assert.equal(publicPoolTemplateBook.worksheets[0].getCell('F2').dataValidation?.type, undefined);
assert.equal(publicPoolTemplateBook.worksheets[0].getCell('G2').dataValidation?.type, undefined);
assert.equal(publicPoolTemplateBook.worksheets[0].getCell('H2').dataValidation?.type, 'list');
assert.equal(publicPoolTemplateBook.worksheets[0].getCell('I2').dataValidation?.type, 'list');
assert.match(
  publicPoolTemplateBook.getWorksheet('填写说明')!.getColumn(2).values.join('|'),
  /销售负责人和客户进展必须留空|必须留空/,
);

const inputBook = new ExcelJS.Workbook();
const sheet = inputBook.addWorksheet('客户导入');
sheet.addRow([...CUSTOMER_IMPORT_HEADERS]);
sheet.addRow(['张三', '13800000000', '', '示例公司', '销售甲', '销售乙', '销售丙', '录入乙', '贡献丙', '跟进中', 'L1-潜客', '市场品牌部-官网', '教育', '厦门', '高意向', '已确认报价', '重点跟进']);
const inputBuffer = await inputBook.xlsx.writeBuffer();
const rows = await parseCustomerImportWorkbook(inputBuffer);
assert.equal(rows.length, 1);
assert.equal(rows[0].rowNumber, 2);
assert.equal(rows[0].name, '张三');
assert.equal(rows[0].leadSource, '市场品牌部-官网');
assert.equal(rows[0].previousOwnerName, '销售乙');
assert.equal(rows[0].firstOwnerName, '销售丙');
assert.equal(rows[0].leadInputByName, '录入乙');
assert.equal(rows[0].leadContributorName, '贡献丙');
assert.equal(rows[0].lastFollowUpRecord, '已确认报价');
assert.equal(rows[0].remark, '重点跟进');

const legacyHeaders = CUSTOMER_IMPORT_HEADERS.filter((header) => ![
  '上一个销售负责人', '首个销售负责人', '线索录入人', '线索贡献人',
].includes(header));
const legacyBook = new ExcelJS.Workbook();
const legacySheet = legacyBook.addWorksheet('旧版客户导入');
legacySheet.addRow(legacyHeaders);
const legacyValues: Record<string, string> = {
  '客户姓名*': '旧模板客户', 手机号: '13900000000', 公司名称: '旧模板公司', 销售负责人: '销售甲', 备注: '兼容导入',
};
legacySheet.addRow(legacyHeaders.map((header) => legacyValues[header] || ''));
const legacyRows = await parseCustomerImportWorkbook(await legacyBook.xlsx.writeBuffer());
assert.equal(legacyRows[0].name, '旧模板客户');
assert.equal(legacyRows[0].previousOwnerName, '');
assert.equal(legacyRows[0].firstOwnerName, '');
assert.equal(legacyRows[0].leadInputByName, '');
assert.equal(legacyRows[0].leadContributorName, '');

const boundaryBook = new ExcelJS.Workbook();
const boundarySheet = boundaryBook.addWorksheet('客户导入');
boundarySheet.addRow([...CUSTOMER_IMPORT_HEADERS]);
for (let index = 0; index < 5_001; index += 1) {
  boundarySheet.addRow([`边界客户${index + 1}`, `138${String(index).padStart(8, '0')}`]);
}
const overLimitBoundaryBuffer = await boundaryBook.xlsx.writeBuffer();
boundarySheet.spliceRows(5_002, 1);
assert.equal((await parseCustomerImportWorkbook(await boundaryBook.xlsx.writeBuffer())).length, 5_000);
await assert.rejects(() => parseCustomerImportWorkbook(overLimitBoundaryBuffer), /单次最多导入 5000 条客户/);

const exportBuffer = await createCustomerExportWorkbook([{ 客户编号: 'c1', 客户姓名: '张三', 手机号: '+8613800000000' }]);
const exportBook = new ExcelJS.Workbook();
await exportBook.xlsx.load(exportBuffer);
const exportHeaders = exportBook.worksheets[0].getRow(1).values;
assert.deepEqual(Array.isArray(exportHeaders) ? exportHeaders.slice(1) : [], ['客户编号', '客户姓名', '手机号']);

const errorBuffer = await createCustomerImportErrorWorkbook([
  { rowNumber: 2, name: '张三', status: 'failed', reason: '手机号重复' },
], rows);
const errorBook = new ExcelJS.Workbook();
await errorBook.xlsx.load(errorBuffer);
const errorHeaders = errorBook.worksheets[0].getRow(1).values;
assert.deepEqual(Array.isArray(errorHeaders) ? errorHeaders.slice(1) : [], [...CUSTOMER_IMPORT_HEADERS, '错误原因']);
assert.equal(errorBook.worksheets[0].getCell('B2').value, '13800000000');
assert.equal(errorBook.worksheets[0].getCell('P2').value, '已确认报价');

console.log('customer data exchange workbook: ok');
