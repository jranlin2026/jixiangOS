import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createBusinessExportWorkbook } from './businessExportWorkbook';
import type { BusinessExportResult } from '../types/businessExport';

const result: BusinessExportResult = {
  filename: '订单导出.xlsx',
  sheetNames: ['订单汇总', '付款明细'],
  summaryColumns: [
    { id: 'orderNo', label: '订单号', type: 'text' },
    { id: 'amount', label: '实付金额', type: 'currency' },
    { id: 'paidAt', label: '付款时间', type: 'date' },
    { id: 'remark', label: '备注', type: 'text' },
  ],
  detailColumns: [
    { id: 'orderNo', label: '订单号', type: 'text' },
    { id: 'sequence', label: '付款序号', type: 'number' },
    { id: 'amount', label: '付款金额', type: 'currency' },
    { id: 'voucherCount', label: '凭证数量', type: 'number' },
    { id: 'voucherNames', label: '凭证文件名', type: 'text' },
  ],
  summaryRows: [
    { orderNo: 'ORD-2', amount: 20, paidAt: '2026-07-24T02:00:00.000Z', remark: '=HYPERLINK("https://invalid")' },
    { orderNo: 'ORD-1', amount: 10, paidAt: '2026-07-23T02:00:00.000Z', remark: '+SUM(1,1)' },
    { orderNo: 'ORD-LF', amount: 1, paidAt: '2026-07-22T02:00:00.000Z', remark: '\n=1+1' },
    { orderNo: 'ORD-CRLF', amount: 1, paidAt: '2026-07-21T02:00:00.000Z', remark: '\r\n@SUM(1,1)' },
  ],
  detailRows: [
    { orderNo: 'ORD-2', sequence: 1, amount: 8, voucherCount: 2, voucherNames: 'a.png；b.png' },
    { orderNo: 'ORD-2', sequence: 2, amount: 12, voucherCount: 0, voucherNames: '' },
  ],
  audit: {
    module: 'orders',
    reason: '财务核对',
    summaryRowCount: 4,
    detailRowCount: 2,
    createdAt: '2026-07-24T03:00:00.000Z',
  },
};

const buffer = await createBusinessExportWorkbook(result);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(buffer);
const rowValues = (row: ExcelJS.Row) => (Array.isArray(row.values) ? row.values.slice(1) : []);

assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['订单汇总', '付款明细']);

const summary = workbook.getWorksheet('订单汇总')!;
assert.deepEqual(rowValues(summary.getRow(1)), ['订单号', '实付金额', '付款时间', '备注']);
assert.equal(summary.views[0]?.state, 'frozen');
assert.equal(summary.views[0]?.ySplit, 1);
assert.deepEqual(summary.autoFilter, 'A1:D5');
assert.equal(summary.getCell('B2').value, 20);
assert.match(summary.getCell('B2').numFmt, /#,/);
assert.ok(summary.getCell('C2').value instanceof Date);
assert.equal(summary.getCell('C2').numFmt, 'yyyy-mm-dd hh:mm:ss');
assert.equal(summary.getCell('D2').value, "'=HYPERLINK(\"https://invalid\")");
assert.equal(summary.getCell('D3').value, "'+SUM(1,1)");
assert.equal(summary.getCell('D4').value, "'\n=1+1");
assert.equal(summary.getCell('D5').value, "'\n@SUM(1,1)", 'ExcelJS 会将 CRLF 规范化为 LF，但必须保留安全前缀');

const detail = workbook.getWorksheet('付款明细')!;
assert.equal(detail.rowCount, 3, '多笔付款应逐笔展开');
assert.deepEqual(rowValues(detail.getRow(1)), ['订单号', '付款序号', '付款金额', '凭证数量', '凭证文件名']);
assert.equal(detail.getCell('E2').value, 'a.png；b.png');
assert.equal(detail.getCell('E2').hyperlink, undefined, '凭证不应输出公开链接');

await assert.rejects(
  () => createBusinessExportWorkbook({ ...result, summaryRows: [] }),
  /没有可生成的业务数据/,
);
