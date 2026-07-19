import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  createCustomerExportWorkbook,
  createCustomerImportErrorWorkbook,
  createCustomerImportTemplateWorkbook,
  parseCustomerImportWorkbook,
} from './customerDataExchangeApi';
import { CUSTOMER_IMPORT_HEADERS } from '../types/customerDataExchange';

const options = {
  ownerNames: ['销售甲'],
  lifecycleStatuses: ['待跟进', '跟进中'],
  customerLevels: ['L1-潜客'],
  leadSources: ['市场品牌部-官网'],
  tagNames: ['高意向'],
  canOverrideAttribution: false,
};

const template = await createCustomerImportTemplateWorkbook(options);
const templateBook = new ExcelJS.Workbook();
await templateBook.xlsx.load(template);
const templateHeaders = templateBook.worksheets[0].getRow(1).values;
assert.deepEqual(Array.isArray(templateHeaders) ? templateHeaders.slice(1) : [], [...CUSTOMER_IMPORT_HEADERS]);
assert.equal(templateBook.worksheets[0].getCell('E2').dataValidation.type, 'list');

const inputBook = new ExcelJS.Workbook();
const sheet = inputBook.addWorksheet('客户导入');
sheet.addRow([...CUSTOMER_IMPORT_HEADERS]);
sheet.addRow(['张三', '13800000000', '', '示例公司', '销售甲', '跟进中', 'L1-潜客', '市场品牌部-官网', '教育', '厦门', '高意向', '重点跟进']);
const inputBuffer = await inputBook.xlsx.writeBuffer();
const rows = await parseCustomerImportWorkbook(inputBuffer);
assert.equal(rows.length, 1);
assert.equal(rows[0].rowNumber, 2);
assert.equal(rows[0].name, '张三');
assert.equal(rows[0].leadSource, '市场品牌部-官网');

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

console.log('customer data exchange workbook: ok');
