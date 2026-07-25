import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { createServer } from 'vite';
import {
  createBusinessImportTemplateWorkbook,
  createBusinessImportErrorWorkbook,
  downloadBusinessImportWorkbook,
  ORDER_IMPORT_HEADERS,
  RECOVERY_IMPORT_HEADERS,
  parseBusinessImportWorkbook,
  parseBusinessImportPackage,
  validateBusinessImportFile,
} from './businessImportWorkbook';
import type { BusinessImportTemplateOptions } from '../types/businessImport';
import type { OrderImportRow } from '../types/businessImport';

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
assert.ok(ORDER_IMPORT_HEADERS.includes('付款截图文件名'));
assert.ok(ORDER_IMPORT_HEADERS.includes('成交资料图片文件名'));

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
assert.ok(RECOVERY_IMPORT_HEADERS.includes('挽回凭证文件名'));

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
    '2026-07-24 10:30:00', '销售甲', '0000123', '0000456', '销售乙', '首单', '付款001.jpg', '聊天01.jpg;聊天02.png',
  ]],
));
assert.equal(parsedOrders.length, 1);
assert.deepEqual(parsedOrders[0], {
  rowNumber: 2,
  customerName: '客户甲', customerPhone: '013800000001', customerWechat: 'wx_001',
  productName: '增长训练营', orderType: '新购', paymentAmount: 1999.5,
  paymentChannel: '企业微信转账', paidAt: '2026-07-24 10:30:00', salesUserName: '销售甲',
  paymentOrderNo: '0000123', thirdPartyOrderNo: '0000456', creatorName: '销售乙', notes: '首单',
  paymentProofFileName: '付款001.jpg', dealEvidenceFileNames: '聊天01.jpg;聊天02.png', remark: '',
});

const numericPhoneWorkbook = new ExcelJS.Workbook();
const numericPhoneSheet = numericPhoneWorkbook.addWorksheet('订单导入模板');
numericPhoneSheet.addRow([...ORDER_IMPORT_HEADERS]);
numericPhoneSheet.addRow([
  '客户乙', 17791873333, '', '增长训练营', '新购', 900, '企业微信转账',
  '2026-07-24 10:30:00', '销售甲', '', '', '', '',
]);
numericPhoneSheet.getCell('B2').numFmt = '@';
const parsedNumericPhone = await parseBusinessImportWorkbook('orders', await numericPhoneWorkbook.xlsx.writeBuffer());
assert.equal(parsedNumericPhone[0]?.customerPhone, '17791873333',
  'Excel/WPS may persist a valid 11-digit phone as a safe integer even when the cell number format is text');

const excelDateRows = [
  [...validOrderRowForDate(), new Date(Date.UTC(2026, 6, 24, 10, 30, 0))],
  [...validOrderRowForDate(), new Date(Date.UTC(2026, 6, 24, 23, 45, 0))],
];
function validOrderRowForDate(): unknown[] {
  return ['客户甲', '013800000001', '', '增长训练营', '新购', 99, '企业微信转账'];
}
const datedWorkbook = new ExcelJS.Workbook();
const datedSheet = datedWorkbook.addWorksheet('订单导入模板');
datedSheet.addRow([...ORDER_IMPORT_HEADERS]);
for (const [index, partial] of excelDateRows.entries()) {
  const row = datedSheet.addRow([...partial, '销售甲']);
  row.getCell(8).numFmt = 'yyyy-mm-dd hh:mm:ss';
  assert.equal(row.number, index + 2);
}
const parsedExcelDates = await parseBusinessImportWorkbook('orders', await datedWorkbook.xlsx.writeBuffer());
assert.equal((parsedExcelDates[0] as OrderImportRow).paidAt, '2026-07-24 10:30:00');
assert.equal((parsedExcelDates[1] as OrderImportRow).paidAt, '2026-07-24 23:45:00', 'Excel wall-clock time must not cross into the next CST day');

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
  async () => parseBusinessImportWorkbook('orders', await workbookBuffer('订单导入模板', [...ORDER_IMPORT_HEADERS, ''], [[...validOrderRow, '', '', '未映射数据']])),
  /第 2 行.*第 16 列.*表头/,
);
const invalidOrder = async (column: number, value: unknown) => {
  const row = [...validOrderRow];
  row[column - 1] = value;
  return workbookBuffer('订单导入模板', ORDER_IMPORT_HEADERS, [row]);
};
await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await invalidOrder(2, 12345678901)),
  /第 2 行.*手机号.*文本格式/,
  '非法的数值手机号不得利用自动转文本绕过校验',
);
await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await workbookBuffer('订单导入模板', ORDER_IMPORT_HEADERS, [[...validOrderRow.slice(0, 1), '', '', ...validOrderRow.slice(3)]])),
  /第 2 行.*手机号或微信/,
);
await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await invalidOrder(6, true)),
  /第 2 行.*实付金额.*数值/,
);
await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await invalidOrder(6, 1.234)),
  /第 2 行.*实付金额.*两位小数/,
);
await assert.rejects(
  async () => parseBusinessImportWorkbook('orders', await invalidOrder(6, -1)),
  /第 2 行.*实付金额.*大于 0/,
);
const preciseMoneyRows = [0.1 + 0.2, 999_999_999_999.99].map((amount) => {
  const row = [...validOrderRow];
  row[5] = amount;
  return row;
});
const parsedPreciseMoney = await parseBusinessImportWorkbook('orders', await workbookBuffer('订单导入模板', ORDER_IMPORT_HEADERS, preciseMoneyRows));
assert.equal((parsedPreciseMoney[0] as OrderImportRow).paymentAmount, 0.1 + 0.2, 'binary floating noise within a cent must remain valid');
assert.equal((parsedPreciseMoney[1] as OrderImportRow).paymentAmount, 999_999_999_999.99);
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
    '抖音', '旗舰店', '1200.00', '企业微信转账', '0000999', '2026-07-20 09:00', '销售乙', '', '再次成交', '挽回01.jpg;挽回02.webp',
  ]],
));
assert.deepEqual(parsedRecovery[0], {
  rowNumber: 2,
  customerName: '客户乙', customerPhone: '', customerWechat: 'wx_0002', thirdPartyOrderNo: '0000789',
  originalProduct: '旧课程', recoveryAmount: 800, recoveryAt: '2026-07-24', recoveryUserName: '销售甲',
  sourcePlatform: '抖音', sourceShop: '旗舰店', originalAmount: '1200.00', paymentChannel: '企业微信转账',
  paymentOrderNo: '0000999', paymentAt: '2026-07-20 09:00', assistUserName: '销售乙', creatorName: '', remark: '再次成交',
  recoveryEvidenceFileNames: '挽回01.jpg;挽回02.webp',
});

const packageOrderWorkbook = await workbookBuffer('订单导入模板', ORDER_IMPORT_HEADERS, [[
  '客户丙', '13800000000', '', '增长训练营', '新购', 399, '企业微信转账',
  '2026-07-24', '销售甲', '', 'TP-ZIP', '', '', '付款001.jpg', '图片/聊天01.png;聊天02.webp',
]]);
await assert.rejects(
  () => parseBusinessImportPackage('orders', '订单.xlsx', packageOrderWorkbook),
  /图片文件名.*ZIP/,
  '纯 Excel 可以继续导入无图记录，但引用图片时必须上传 ZIP 包',
);
const orderZip = new JSZip();
orderZip.file('订单导入.xlsx', packageOrderWorkbook);
orderZip.file('付款001.jpg', Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]));
orderZip.file('图片/聊天01.png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
orderZip.file('聊天02.webp', Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]));
const parsedOrderPackage = await parseBusinessImportPackage('orders', '订单导入.zip', await orderZip.generateAsync({ type: 'arraybuffer' }));
assert.equal(parsedOrderPackage.rows.length, 1);
assert.deepEqual(parsedOrderPackage.images.map((image) => [image.rowNumber, image.category, image.name]), [
  [2, 'order-payment-proof', '付款001.jpg'],
  [2, 'order-deal-evidence', '图片/聊天01.png'],
  [2, 'order-deal-evidence', '聊天02.webp'],
]);

const recoveryPackageWorkbook = await workbookBuffer('售后挽回订单导入模板', RECOVERY_IMPORT_HEADERS, [[
  '客户丁', '', 'wx-4', 'RCV-ZIP', '老产品', 299, '2026-07-24', '销售甲',
  '', '', '', '', '', '', '', '', '', '凭证1.jpg;凭证2.png',
]]);
const recoveryZip = new JSZip();
recoveryZip.file('售后挽回.xlsx', recoveryPackageWorkbook);
recoveryZip.file('凭证1.jpg', Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]));
recoveryZip.file('凭证2.png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const parsedRecoveryPackage = await parseBusinessImportPackage('recovery_orders', '售后挽回.zip', await recoveryZip.generateAsync({ type: 'arraybuffer' }));
assert.deepEqual(parsedRecoveryPackage.images.map((image) => image.category), ['recovery-payment-proof', 'recovery-payment-proof']);
assert.equal((parsedRecoveryPackage.rows[0] as any).recoveryEvidenceFileNames, '凭证1.jpg;凭证2.png');

const missingImageZip = new JSZip();
missingImageZip.file('订单导入.xlsx', packageOrderWorkbook);
const missingImageZipBuffer = await missingImageZip.generateAsync({ type: 'arraybuffer' });
await assert.rejects(
  () => parseBusinessImportPackage('orders', '订单导入.zip', missingImageZipBuffer),
  /第 2 行.*付款001\.jpg.*ZIP 中不存在/,
);

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
assert.equal(errorSheet.getCell('R2').value, "'@SUM(1,1)");
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
assert.equal(jobErrorSheet.getCell('T2').value, '失败');
assert.equal(jobErrorSheet.getCell('U2').value, "'=PRIVATE_FAILURE");

const downloadEvents: string[] = [];
downloadBusinessImportWorkbook('错误报告.xlsx', new Uint8Array([1, 2, 3]).buffer, {
  createObjectUrl: (blob) => { downloadEvents.push(`blob:${blob.type}:${blob.size}`); return 'blob:report'; },
  revokeObjectUrl: (url) => { downloadEvents.push(`revoke:${url}`); },
  clickAnchor: (url, fileName) => { downloadEvents.push(`click:${url}:${fileName}`); },
});
assert.deepEqual(downloadEvents, [
  'blob:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:3',
  'click:blob:report:错误报告.xlsx',
  'revoke:blob:report',
]);

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
let injectedScripts = 0;
let injectedSource = '';
const browserWindow: { ExcelJS?: typeof ExcelJS } = {};
const browserDocument = {
  createElement: (tag: string) => {
    assert.equal(tag, 'script');
    return { src: '', async: false, onload: undefined as undefined | (() => void), onerror: undefined as undefined | (() => void) };
  },
  head: {
    appendChild: (script: { src: string; onload?: () => void }) => {
      injectedScripts += 1;
      injectedSource = script.src;
      browserWindow.ExcelJS = ExcelJS;
      script.onload?.();
    },
  },
};
Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow });
Object.defineProperty(globalThis, 'document', { configurable: true, value: browserDocument });
try {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const browserWorkbook = await vite.ssrLoadModule('/src/api/businessImportWorkbook.ts') as {
    createBusinessImportTemplateWorkbook: typeof createBusinessImportTemplateWorkbook;
  };
  const browserTemplate = await browserWorkbook.createBusinessImportTemplateWorkbook('orders', options);
  await vite.close();
  assert.ok(browserTemplate.byteLength > 0);
  assert.equal(injectedScripts, 1, 'the browser runtime must lazy-load ExcelJS only when a workbook action starts');
  assert.match(injectedSource, /exceljs\.min/u);
} finally {
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
  else delete (globalThis as { window?: unknown }).window;
  if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
  else delete (globalThis as { document?: unknown }).document;
}
