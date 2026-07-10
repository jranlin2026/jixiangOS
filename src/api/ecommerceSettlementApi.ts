import type { Row } from 'exceljs';
import excelJsBrowserUrl from 'exceljs/dist/exceljs.min.js?url';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { getStorageData, setStorageData } from './mock/storage';
import type {
  EcommerceExceptionRow,
  EcommerceFlowCheckRow,
  EcommerceFlowOverviewRow,
  EcommerceFlowSummaryRow,
  EcommerceOrderDetailRow,
  EcommerceSettlementConfig,
  EcommerceSettlementRecord,
  EcommerceSettlementRecordSummary,
  EcommerceSettlementResult,
  EcommerceSettlementStats,
  EcommerceTalentSummaryRow,
} from '../types/ecommerceSettlement';

type ExcelJsNamespace = typeof import('exceljs');
type ExcelJsModule = ExcelJsNamespace & { default?: ExcelJsNamespace };
type WindowWithExcelJs = Window & { ExcelJS?: ExcelJsNamespace };
type RawRow = Record<string, unknown>;
type FieldSpec = { label: string; aliases: string[] };

export interface EcommerceSettlementInput {
  storeName?: string;
  shippingFee: number;
  orderRows: RawRow[];
  flowRows: RawRow[];
  productCostRows?: RawRow[];
  freightRows?: RawRow[];
}

export interface EcommerceSettlementFileInput {
  storeName?: string;
  shippingFee: number;
  orderFile: File;
  flowFiles: File[];
  productCostFile?: File | null;
  freightFiles?: File[];
}

export interface EcommerceSettlementBatchWorkbookInput {
  batchName: string;
  month: string;
  records: EcommerceSettlementRecord[];
}

const DEFAULT_CONFIG: EcommerceSettlementConfig = {
  storeName: '抖音店铺',
  shippingFee: 2.4,
};

const SETTLEMENT_DB_NAME = 'aaos_ecommerce_settlement';
const SETTLEMENT_DB_VERSION = 1;
const SETTLEMENT_RECORD_STORE = 'records';
const MAX_STORED_RECORD_SUMMARIES = 30;
const PREVIEW_ROW_LIMIT = 12;

const ORDER_REQUIRED_FIELDS: FieldSpec[] = [
  { label: '主订单编号', aliases: ['主订单编号', '订单编号'] },
  { label: '子订单编号', aliases: ['子订单编号', '子订单号'] },
  { label: '订单提交时间', aliases: ['订单提交时间', '下单时间'] },
  { label: '订单应付金额', aliases: ['订单应付金额', '实付金额', '订单金额'] },
];

const FLOW_REQUIRED_FIELDS: FieldSpec[] = [
  { label: '动账时间', aliases: ['动账时间', '发生时间', '创建时间'] },
  { label: '动账方向', aliases: ['动账方向', '收支方向'] },
  { label: '动账金额', aliases: ['动账金额', '金额'] },
  { label: '子订单号或订单号', aliases: ['子订单号', '子订单编号', '订单号', '主订单编号', '订单编号'] },
];

const PRODUCT_COST_REQUIRED_FIELDS: FieldSpec[] = [
  { label: '商家编码', aliases: ['商家编码', 'SKU编码', '商品编码'] },
  { label: '产品成本', aliases: ['产品单价', '产品单件成本', '产品成本', '成本', '单件成本', '商品成本', '成本单价'] },
];

const FREIGHT_REQUIRED_FIELDS: FieldSpec[] = [
  { label: '订单编号', aliases: ['订单编号', '子订单编号'] },
  { label: '支付保费', aliases: ['支付保费', '保费', '运费险金额'] },
  { label: '保费状态', aliases: ['保费状态'] },
];

const SHEET_HEADERS = {
  orderDetail: [
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
  ],
  talentSummary: [
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
  ],
  flowOverview: ['指标', '值', '说明', 'Top动账场景', 'Top净额'],
  flowSummary: ['维度', '笔数', '入账金额', '出账金额', '净额'],
  flowCheck: ['动账时间', '动账方向', '动账金额', '带符号金额', '动账场景', '主订单编号', '子订单编号', '匹配状态', '备注'],
  exceptions: ['异常类型', '风险等级', '主订单编号', '子订单编号', '异常说明', '处理建议'],
} as const;

let browserExcelJsPromise: Promise<ExcelJsNamespace> | null = null;
const memoryRecordCache = new Map<string, EcommerceSettlementRecord>();

function loadBrowserExcelJs(): Promise<ExcelJsNamespace> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('ExcelJS browser runtime is unavailable'));
  }
  const existing = (window as WindowWithExcelJs).ExcelJS;
  if (existing?.Workbook) return Promise.resolve(existing);
  if (browserExcelJsPromise) return browserExcelJsPromise;

  browserExcelJsPromise = new Promise<ExcelJsNamespace>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = excelJsBrowserUrl;
    script.async = true;
    script.onload = () => {
      const loaded = (window as WindowWithExcelJs).ExcelJS;
      if (loaded?.Workbook) resolve(loaded);
      else reject(new Error('ExcelJS 加载失败，请刷新页面后重试'));
    };
    script.onerror = () => reject(new Error('ExcelJS 文件加载失败，请检查本地服务后重试'));
    document.head.appendChild(script);
  }).finally(() => {
    browserExcelJsPromise = null;
  });

  return browserExcelJsPromise;
}

async function loadExcelJs(): Promise<ExcelJsNamespace> {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') return loadBrowserExcelJs();
  const importExcelJs = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<ExcelJsModule>;
  const imported = await importExcelJs('exceljs');
  return typeof imported.Workbook === 'function' ? imported : imported.default || imported;
}

function toText(value: unknown): string {
  if (value instanceof Date) return formatDate(value);
  if (value && typeof value === 'object') {
    const cellValue = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: unknown }> };
    if (cellValue.text !== undefined) return String(cellValue.text).trim();
    if (cellValue.result !== undefined) return String(cellValue.result).trim();
    if (Array.isArray(cellValue.richText)) return cellValue.richText.map((item) => item.text || '').join('').trim();
  }
  return String(value ?? '').trim();
}

function cleanId(value: unknown): string {
  return toText(value).replace(/\.0$/, '').replace(/^[\t',]+/, '').trim();
}

function parseMoney(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = toText(value).replace(/[,\s¥￥]/g, '');
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function excelSerialToDate(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
}

function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return excelSerialToDate(value);
  const text = toText(value);
  if (!text) return null;
  const normalized = text.replace(/\./g, '-').replace(/\//g, '-');
  const date = new Date(normalized);
  if (!Number.isNaN(date.getTime())) return date;
  return null;
}

function formatDate(value: Date | null): string {
  if (!value || Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hour = String(value.getHours()).padStart(2, '0');
  const minute = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function monthKey(value: Date | null): string {
  if (!value) return '未识别月份';
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

function pick(row: RawRow, fields: string[]): unknown {
  return fields.map((field) => row[field]).find((value) => toText(value));
}

function validateRows(fileLabel: string, fileName: string, rows: RawRow[], fields: FieldSpec[]): void {
  if (!rows.length) {
    throw new Error(`${fileLabel}「${fileName}」没有读取到数据，请确认上传的是对应导出的明细表。`);
  }
  const headers = new Set(rows.flatMap((row) => Object.keys(row)));
  const missing = fields
    .filter((field) => !field.aliases.some((alias) => headers.has(alias)))
    .map((field) => field.label);
  if (missing.length) {
    throw new Error(`${fileLabel}「${fileName}」缺少必要字段：${missing.join('、')}。请检查是否上传错了表格。`);
  }
}

function addMoney<T extends string>(map: Map<T, number>, key: T, value: number): void {
  map.set(key, roundMoney((map.get(key) || 0) + value));
}

function addFlowSummary(map: Map<string, EcommerceFlowSummaryRow>, dimension: string, signedAmount: number): void {
  const current = map.get(dimension) || { dimension, count: 0, incomeAmount: 0, expenseAmount: 0, netAmount: 0 };
  current.count += 1;
  if (signedAmount >= 0) current.incomeAmount = roundMoney(current.incomeAmount + signedAmount);
  else current.expenseAmount = roundMoney(current.expenseAmount + Math.abs(signedAmount));
  current.netAmount = roundMoney(current.incomeAmount - current.expenseAmount);
  map.set(dimension, current);
}

function talentFromOrder(row: RawRow): { talentName: string; talentId: string } {
  const talentName = toText(pick(row, ['达人昵称', '达人名称', '作者昵称']));
  if (!talentName) return { talentName: '商品卡流量', talentId: '' };
  return { talentName, talentId: cleanId(pick(row, ['达人ID', '达人id', '作者ID'])) };
}

function summaryKey(row: Pick<EcommerceTalentSummaryRow, 'orderMonth' | 'talentName' | 'talentId'>): string {
  return `${row.orderMonth}\u0001${row.talentName}\u0001${row.talentId}`;
}

function ensureTalentSummary(
  map: Map<string, EcommerceTalentSummaryRow>,
  context: Pick<EcommerceTalentSummaryRow, 'orderMonth' | 'talentName' | 'talentId'>,
): EcommerceTalentSummaryRow {
  const key = summaryKey(context);
  const existing = map.get(key);
  if (existing) return existing;
  const created: EcommerceTalentSummaryRow = {
    orderMonth: context.orderMonth,
    talentId: context.talentId,
    talentName: context.talentName,
    orderCount: 0,
    packageCount: 0,
    payableAmount: 0,
    flowAmount: 0,
    productCost: 0,
    shippingFee: 0,
    freightInsurance: 0,
    estimatedProfit: 0,
    totalCost: 0,
    grossProfitRate: '',
  };
  map.set(key, created);
  return created;
}

function pushException(rows: EcommerceExceptionRow[], item: EcommerceExceptionRow): void {
  rows.push(item);
}

function toArrayBuffer(value: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  const view = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

function isFullSettlementRecord(value: unknown): value is EcommerceSettlementRecord {
  const record = value as Partial<EcommerceSettlementRecord> | null;
  return Boolean(
    record
    && typeof record === 'object'
    && Array.isArray(record.orderDetailRows)
    && Array.isArray(record.talentSummaryRows)
    && Array.isArray(record.flowCheckRows),
  );
}

export function summarizeSettlementRecord(record: EcommerceSettlementRecord, fullRecordStorage: EcommerceSettlementRecordSummary['fullRecordStorage'] = 'memory'): EcommerceSettlementRecordSummary {
  return {
    id: record.id,
    storeName: record.storeName,
    generatedAt: record.generatedAt,
    version: record.version,
    shippingFee: record.shippingFee,
    uploadedFileNames: record.uploadedFileNames,
    stats: record.stats,
    coveredMonths: record.coveredMonths,
    previewTalentSummaryRows: record.talentSummaryRows.slice(0, PREVIEW_ROW_LIMIT),
    previewFlowSceneSummaryRows: record.flowSceneSummaryRows.slice(0, PREVIEW_ROW_LIMIT),
    previewExceptionRows: record.exceptionRows.slice(0, PREVIEW_ROW_LIMIT),
    fullRecordStorage,
  };
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openSettlementDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(SETTLEMENT_DB_NAME, SETTLEMENT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SETTLEMENT_RECORD_STORE)) {
        db.createObjectStore(SETTLEMENT_RECORD_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

async function putIndexedDbRecord(record: EcommerceSettlementRecord): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  try {
    const db = await openSettlementDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SETTLEMENT_RECORD_STORE, 'readwrite');
      tx.objectStore(SETTLEMENT_RECORD_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

async function getIndexedDbRecord(id: string): Promise<EcommerceSettlementRecord | null> {
  if (!hasIndexedDb()) return null;
  try {
    const db = await openSettlementDb();
    const record = await new Promise<EcommerceSettlementRecord | null>((resolve, reject) => {
      const tx = db.transaction(SETTLEMENT_RECORD_STORE, 'readonly');
      const request = tx.objectStore(SETTLEMENT_RECORD_STORE).get(id);
      request.onsuccess = () => resolve(isFullSettlementRecord(request.result) ? request.result : null);
      request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
    });
    db.close();
    return record;
  } catch {
    return null;
  }
}

function readStoredRecordItems(): Array<EcommerceSettlementRecordSummary | EcommerceSettlementRecord> {
  if (typeof localStorage === 'undefined') return [];
  const raw = getStorageData<Array<EcommerceSettlementRecordSummary | EcommerceSettlementRecord>>(STORAGE_KEYS.ECOMMERCE_SETTLEMENT_RECORDS);
  return Array.isArray(raw) ? raw : [];
}

export async function readWorkbookRows(arrayBuffer: ArrayBuffer): Promise<RawRow[]> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    headers[columnNumber] = toText(cell.value);
  });

  const rows: RawRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row: Row, rowNumber: number) => {
    if (rowNumber === 1) return;
    const data = headers.reduce((acc, header, columnNumber) => {
      if (header) acc[header] = row.getCell(columnNumber).value;
      return acc;
    }, {} as RawRow);
    if (Object.values(data).some((value) => toText(value))) rows.push(data);
  });
  return rows;
}

export function buildEcommerceSettlement(input: EcommerceSettlementInput): EcommerceSettlementResult {
  const exceptions: EcommerceExceptionRow[] = [];
  const orderByMainId = new Map<string, EcommerceOrderDetailRow[]>();
  const orderBySubId = new Map<string, EcommerceOrderDetailRow>();
  const rawOrderBySubId = new Map<string, RawRow>();
  const productCostBySku = new Map<string, number>();
  const freightBySubOrderId = new Map<string, number>();
  const deductedFreightOrderIds = new Set<string>();
  const hasProductCostSheet = Boolean(input.productCostRows?.length);
  const hasFreightSheet = Boolean(input.freightRows?.length);
  const flowTotalsBySubOrderId = new Map<string, number>();
  const flowTotalsByMainOrderId = new Map<string, number>();
  const flowSceneSummary = new Map<string, EcommerceFlowSummaryRow>();
  const flowMonthSummary = new Map<string, EcommerceFlowSummaryRow>();
  const flowCheckRows: EcommerceFlowCheckRow[] = [];
  const flowMonths = new Set<string>();
  const summaryMap = new Map<string, EcommerceTalentSummaryRow>();
  const paidSubOrderKeys = new Set<string>();
  const packageKeys = new Set<string>();
  let blankSceneCount = 0;
  let remarkFallbackCount = 0;
  let noOrderFlowCount = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let incomeAmount = 0;
  let expenseAmount = 0;
  let firstFlowDate: Date | null = null;
  let lastFlowDate: Date | null = null;

  if (!hasProductCostSheet) {
    pushException(exceptions, {
      type: '商品成本表未上传',
      level: 'low',
      orderId: '',
      subOrderId: '',
      message: '本次未上传商品成本明细表，产品成本按 0 计算。',
      suggestion: '如需计算产品成本，请上传商品成本明细表后重新结算。',
    });
  }
  if (!hasFreightSheet) {
    pushException(exceptions, {
      type: '运费险表未上传',
      level: 'low',
      orderId: '',
      subOrderId: '',
      message: '本次未上传运费险明细表，运费险费用按 0 计算。',
      suggestion: '如需计算运费险费用，请上传运费险明细表后重新结算。',
    });
  }

  (input.productCostRows || []).forEach((row) => {
    const sku = cleanId(pick(row, ['商家编码', 'SKU编码', '商品编码']));
    if (!sku) return;
    productCostBySku.set(sku, parseMoney(pick(row, ['产品单价', '产品单件成本', '产品成本', '成本', '单件成本', '商品成本', '成本单价'])));
  });

  (input.freightRows || []).forEach((row) => {
    const status = toText(pick(row, ['保费状态']));
    if (status !== '已扣减') return;
    const orderId = cleanId(pick(row, ['订单编号', '子订单编号']));
    if (!orderId) return;
    deductedFreightOrderIds.add(orderId);
    addMoney(freightBySubOrderId, orderId, parseMoney(pick(row, ['支付保费', '保费', '运费险金额'])));
  });

  input.orderRows.forEach((row) => {
    const mainOrderId = cleanId(pick(row, ['主订单编号', '订单编号']));
    const subOrderId = cleanId(pick(row, ['子订单编号', '子订单号']));
    if (subOrderId) rawOrderBySubId.set(subOrderId, row);
    const shell: EcommerceOrderDetailRow = {
      mainOrderId,
      subOrderId,
      orderMonth: monthKey(parseDateValue(pick(row, ['订单提交时间', '下单时间']))),
      submittedAt: '',
      completedAt: '',
      paidAt: '',
      shippedAt: '',
      skuCode: '',
      quantity: 0,
      talentId: '',
      talentName: '',
      productPrice: 0,
      payableAmount: 0,
      platformDiscount: 0,
      merchantDiscount: 0,
      talentDiscount: 0,
      productUnitCost: 0,
      productCost: 0,
      shippingFee: 0,
      freightInsurance: 0,
      flowAmount: 0,
      estimatedProfit: 0,
    };
    if (mainOrderId) orderByMainId.set(mainOrderId, [...(orderByMainId.get(mainOrderId) || []), shell]);
    if (subOrderId) orderBySubId.set(subOrderId, shell);
  });

  input.flowRows.forEach((row) => {
    const direction = toText(pick(row, ['动账方向', '收支方向']));
    const amount = roundMoney(parseMoney(pick(row, ['动账金额', '金额'])));
    const signedAmount = direction.includes('出') || amount < 0 ? -Math.abs(amount) : Math.abs(amount);
    const mainOrderId = cleanId(pick(row, ['订单号', '主订单编号', '订单编号']));
    const subOrderId = cleanId(pick(row, ['子订单号', '子订单编号']));
    const flowDate = parseDateValue(pick(row, ['动账时间', '发生时间', '创建时间']));
    const rawScene = toText(pick(row, ['动账场景', '场景']));
    const remark = toText(pick(row, ['备注', '说明']));
    let scene = rawScene;
    if (!scene) {
      blankSceneCount += 1;
      scene = remark || '未归类';
      if (remark) remarkFallbackCount += 1;
    }
    const flowMonth = monthKey(flowDate);
    if (flowDate) {
      flowMonths.add(flowMonth);
      if (!firstFlowDate || flowDate < firstFlowDate) firstFlowDate = flowDate;
      if (!lastFlowDate || flowDate > lastFlowDate) lastFlowDate = flowDate;
    }
    if (signedAmount >= 0) {
      incomeCount += 1;
      incomeAmount = roundMoney(incomeAmount + signedAmount);
    } else {
      expenseCount += 1;
      expenseAmount = roundMoney(expenseAmount + Math.abs(signedAmount));
    }
    if (!mainOrderId && !subOrderId) {
      noOrderFlowCount += 1;
      pushException(exceptions, {
        type: '无订单号资金流水',
        level: 'medium',
        orderId: '',
        subOrderId: '',
        message: `资金流水缺少子订单号和订单号，动账场景=${scene}。`,
        suggestion: '这类流水会保留在资金流水汇总中，但不会归属到达人结算。',
      });
    }

    let matched = false;
    if (subOrderId) {
      matched = orderBySubId.has(subOrderId);
      addMoney(flowTotalsBySubOrderId, subOrderId, signedAmount);
    } else if (mainOrderId) {
      matched = orderByMainId.has(mainOrderId);
      addMoney(flowTotalsByMainOrderId, mainOrderId, signedAmount);
    }
    if (!matched && (mainOrderId || subOrderId)) {
      pushException(exceptions, {
        type: '资金流水未匹配订单',
        level: 'high',
        orderId: mainOrderId,
        subOrderId,
        message: `资金流水 ${scene} 未匹配到订单`,
        suggestion: subOrderId ? '资金流水有子订单号时只匹配订单明细的子订单编号，请检查该子订单是否在订单明细表中。' : '检查订单明细表是否包含该主订单编号。',
      });
    }

    addFlowSummary(flowSceneSummary, scene, signedAmount);
    addFlowSummary(flowMonthSummary, `${flowMonth} / ${scene}`, signedAmount);

    flowCheckRows.push({
      flowTime: formatDate(flowDate),
      direction,
      amount,
      signedAmount,
      scene,
      mainOrderId,
      subOrderId,
      matchStatus: matched ? 'matched' : 'unmatched',
      remark,
    });
  });

  const orderDetailRows = input.orderRows.map((row) => {
    const mainOrderId = cleanId(pick(row, ['主订单编号', '订单编号']));
    const subOrderId = cleanId(pick(row, ['子订单编号', '子订单号']));
    const skuCode = cleanId(pick(row, ['商家编码', 'SKU编码', '商品编码']));
    const quantity = Math.max(1, Math.round(parseMoney(pick(row, ['商品数量', '数量'])) || 1));
    const submittedAtDate = parseDateValue(pick(row, ['订单提交时间', '下单时间']));
    const completedAtDate = parseDateValue(pick(row, ['订单完成时间', '支付完成时间']));
    const paidAtDate = parseDateValue(pick(row, ['支付完成时间']));
    const shippedAtDate = parseDateValue(pick(row, ['发货时间']));
    const orderMonth = monthKey(submittedAtDate);
    const payableAmount = roundMoney(parseMoney(pick(row, ['订单应付金额', '实付金额', '订单金额'])));
    const productPrice = roundMoney(parseMoney(pick(row, ['商品单价', '单价'])));
    const platformDiscount = roundMoney(parseMoney(pick(row, ['平台实际承担优惠金额', '平台优惠'])));
    const merchantDiscount = roundMoney(parseMoney(pick(row, ['商家实际承担优惠金额', '商家优惠'])));
    const talentDiscount = roundMoney(parseMoney(pick(row, ['达人实际承担优惠金额', '达人优惠'])));
    const productUnitCost = hasProductCostSheet && skuCode ? productCostBySku.get(skuCode) : 0;
    const flowAmount = flowTotalsBySubOrderId.has(subOrderId)
      ? flowTotalsBySubOrderId.get(subOrderId)
      : flowTotalsByMainOrderId.has(mainOrderId)
        ? flowTotalsByMainOrderId.get(mainOrderId)
        : undefined;
    const productCost = flowAmount !== undefined && flowAmount > 5 && productUnitCost !== undefined
      ? roundMoney(productUnitCost * quantity)
      : 0;
    const freightInsurance = hasFreightSheet && freightBySubOrderId.has(subOrderId)
      ? roundMoney(freightBySubOrderId.get(subOrderId) || 0)
      : 0;
    const { talentName, talentId } = talentFromOrder(row);
    const detail: EcommerceOrderDetailRow = {
      mainOrderId,
      subOrderId,
      orderMonth,
      submittedAt: formatDate(submittedAtDate),
      completedAt: formatDate(completedAtDate),
      paidAt: formatDate(paidAtDate),
      shippedAt: formatDate(shippedAtDate),
      skuCode,
      quantity,
      talentId,
      talentName,
      productPrice,
      payableAmount,
      platformDiscount,
      merchantDiscount,
      talentDiscount,
      productUnitCost: productUnitCost || 0,
      productCost,
      shippingFee: 0,
      freightInsurance,
      flowAmount: flowAmount === undefined ? 0 : roundMoney(flowAmount),
      estimatedProfit: roundMoney((flowAmount || 0) - productCost - freightInsurance),
    };

    if (mainOrderId) {
      const rows = orderByMainId.get(mainOrderId) || [];
      const index = rows.findIndex((item) => item.subOrderId === subOrderId);
      if (index >= 0) rows[index] = detail;
    }
    if (subOrderId) orderBySubId.set(subOrderId, detail);
    if (hasProductCostSheet && productUnitCost === undefined && skuCode) {
      pushException(exceptions, {
        type: '商品成本缺失',
        level: 'medium',
        orderId: mainOrderId,
        subOrderId,
        message: `商家编码 ${skuCode} 未匹配到产品成本`,
        suggestion: '补充商品成本明细表后重新结算',
      });
    }
    const summary = ensureTalentSummary(summaryMap, { orderMonth, talentName, talentId });
    if (paidAtDate) {
      summary.payableAmount = roundMoney(summary.payableAmount + payableAmount + platformDiscount + merchantDiscount + talentDiscount);
      if (subOrderId && !paidSubOrderKeys.has(subOrderId)) {
        paidSubOrderKeys.add(subOrderId);
        summary.orderCount += 1;
      }
    }
    if (shippedAtDate && mainOrderId) {
      const packageKey = `${summaryKey({ orderMonth, talentName, talentId })}\u0001${mainOrderId}\u0001${formatDate(shippedAtDate)}`;
      if (!packageKeys.has(packageKey)) {
        packageKeys.add(packageKey);
        summary.packageCount += 1;
      }
    }
    if (flowAmount !== undefined) {
      summary.flowAmount = roundMoney(summary.flowAmount + flowAmount);
      summary.productCost = roundMoney(summary.productCost + productCost);
    }
    if (freightInsurance) {
      summary.freightInsurance = roundMoney(summary.freightInsurance + freightInsurance);
    }
    return detail;
  });

  deductedFreightOrderIds.forEach((orderId) => {
    if (!rawOrderBySubId.has(orderId)) {
      pushException(exceptions, {
        type: '运费险未匹配子订单',
        level: 'medium',
        orderId,
        subOrderId: '',
        message: `已扣减运费险订单 ${orderId} 未匹配到订单明细表子订单编号`,
        suggestion: '运费险只按子订单编号匹配，不使用主订单编号兜底。',
      });
    }
  });

  const talentSummaryRows = Array.from(summaryMap.values()).map((row) => {
    row.shippingFee = roundMoney(row.packageCount * input.shippingFee);
    row.totalCost = roundMoney(row.shippingFee + row.freightInsurance + row.productCost);
    row.estimatedProfit = roundMoney(row.flowAmount - row.totalCost);
    row.grossProfitRate = row.payableAmount === 0 ? '' : Math.round((row.estimatedProfit / row.payableAmount) * 10000) / 10000;
    return row;
  }).sort((a, b) => (
    a.orderMonth.localeCompare(b.orderMonth) || b.payableAmount - a.payableAmount || a.talentName.localeCompare(b.talentName, 'zh-Hans-CN')
  ));
  const flowSceneSummaryRows = Array.from(flowSceneSummary.values()).sort((a, b) => Math.abs(b.netAmount) - Math.abs(a.netAmount) || b.count - a.count);
  const topFlowRows = flowSceneSummaryRows.slice(0, 12);
  const flowOverviewMetrics: Array<{ metric: string; value: string | number; note: string }> = [
    { metric: '流水总笔数', value: flowCheckRows.length, note: '' },
    { metric: '入账笔数', value: incomeCount, note: '' },
    { metric: '入账金额', value: roundMoney(incomeAmount), note: '' },
    { metric: '出账笔数', value: expenseCount, note: '' },
    { metric: '出账金额', value: roundMoney(expenseAmount), note: '' },
    { metric: '净额', value: roundMoney(incomeAmount - expenseAmount), note: '入账-出账' },
    { metric: '动账场景为空', value: blankSceneCount, note: '按备注兜底' },
    { metric: '备注兜底成功', value: remarkFallbackCount, note: '' },
    { metric: '无订单号流水', value: noOrderFlowCount, note: '' },
    { metric: '覆盖月份', value: Array.from(flowMonths).sort().join(', '), note: '' },
    { metric: '最早动账时间', value: formatDate(firstFlowDate), note: '' },
    { metric: '最晚动账时间', value: formatDate(lastFlowDate), note: '' },
  ];
  const flowOverviewRows: EcommerceFlowOverviewRow[] = Array.from({ length: Math.max(flowOverviewMetrics.length, topFlowRows.length) }, (_item, index) => ({
    metric: flowOverviewMetrics[index]?.metric || '',
    value: flowOverviewMetrics[index]?.value ?? '',
    note: flowOverviewMetrics[index]?.note || '',
    topScene: topFlowRows[index]?.dimension || '',
    topNetAmount: topFlowRows[index]?.netAmount ?? '',
  }));
  const stats: EcommerceSettlementStats = {
    orderCount: orderDetailRows.length,
    flowCount: flowCheckRows.length,
    talentCount: new Set(talentSummaryRows.map((row) => row.talentId || row.talentName)).size,
    totalOrderAmount: roundMoney(talentSummaryRows.reduce((sum, row) => sum + row.payableAmount, 0)),
    totalFlowAmount: roundMoney(talentSummaryRows.reduce((sum, row) => sum + row.flowAmount, 0)),
    totalProductCost: roundMoney(talentSummaryRows.reduce((sum, row) => sum + row.productCost, 0)),
    totalShippingFee: roundMoney(talentSummaryRows.reduce((sum, row) => sum + row.shippingFee, 0)),
    totalFreightInsurance: roundMoney(talentSummaryRows.reduce((sum, row) => sum + row.freightInsurance, 0)),
    estimatedProfit: roundMoney(talentSummaryRows.reduce((sum, row) => sum + row.estimatedProfit, 0)),
    exceptionCount: exceptions.length,
  };

  return {
    orderDetailRows,
    talentSummaryRows,
    flowOverviewRows,
    flowSceneSummaryRows,
    flowMonthSummaryRows: Array.from(flowMonthSummary.values()).sort((a, b) => a.dimension.localeCompare(b.dimension)),
    flowCheckRows,
    exceptionRows: exceptions,
    stats,
    coveredMonths: Array.from(new Set(orderDetailRows.map((row) => row.orderMonth))).sort(),
  };
}

function readRecordSummaries(): EcommerceSettlementRecordSummary[] {
  if (typeof localStorage === 'undefined') return [];
  const storedItems = readStoredRecordItems();
  let migratedLegacyFullRecords = false;
  const summaries = storedItems.map((item) => {
    if (isFullSettlementRecord(item)) {
      migratedLegacyFullRecords = true;
      memoryRecordCache.set(item.id, item);
      void putIndexedDbRecord(item);
      return summarizeSettlementRecord(item, 'legacy');
    }
    return item;
  });
  if (migratedLegacyFullRecords) saveRecordSummaries(summaries);
  return summaries;
}

function saveRecordSummaries(records: EcommerceSettlementRecordSummary[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    setStorageData(STORAGE_KEYS.ECOMMERCE_SETTLEMENT_RECORDS, records);
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEYS.ECOMMERCE_SETTLEMENT_RECORDS);
      localStorage.setItem(STORAGE_KEYS.ECOMMERCE_SETTLEMENT_RECORDS, JSON.stringify(records));
    } catch {
      // The current full result is still usable from memory; history persistence is best effort.
    }
  }
}

export function getEcommerceSettlementConfig(): EcommerceSettlementConfig {
  if (typeof localStorage === 'undefined') return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...(getStorageData<EcommerceSettlementConfig>(STORAGE_KEYS.ECOMMERCE_SETTLEMENT_CONFIG) || {}) };
}

export function saveEcommerceSettlementConfig(config: EcommerceSettlementConfig): EcommerceSettlementConfig {
  const next = {
    storeName: config.storeName.trim() || DEFAULT_CONFIG.storeName,
    shippingFee: Number.isFinite(config.shippingFee) && config.shippingFee >= 0 ? config.shippingFee : DEFAULT_CONFIG.shippingFee,
  };
  if (typeof localStorage !== 'undefined') setStorageData(STORAGE_KEYS.ECOMMERCE_SETTLEMENT_CONFIG, next);
  return next;
}

export async function createSettlementFromFiles(input: EcommerceSettlementFileInput): Promise<EcommerceSettlementRecord> {
  const [orderRows, flowGroups, productCostRows, freightGroups] = await Promise.all([
    input.orderFile.arrayBuffer().then(readWorkbookRows),
    Promise.all(input.flowFiles.map(async (file) => readWorkbookRows(await file.arrayBuffer()))),
    input.productCostFile ? input.productCostFile.arrayBuffer().then(readWorkbookRows) : Promise.resolve([]),
    Promise.all((input.freightFiles || []).map(async (file) => readWorkbookRows(await file.arrayBuffer()))),
  ]);
  validateRows('订单明细表', input.orderFile.name, orderRows, ORDER_REQUIRED_FIELDS);
  flowGroups.forEach((rows, index) => validateRows('资金流水明细表', input.flowFiles[index]?.name || `第 ${index + 1} 个文件`, rows, FLOW_REQUIRED_FIELDS));
  if (input.productCostFile) validateRows('商品成本明细表', input.productCostFile.name, productCostRows, PRODUCT_COST_REQUIRED_FIELDS);
  (input.freightFiles || []).forEach((file, index) => validateRows('运费险明细表', file.name, freightGroups[index] || [], FREIGHT_REQUIRED_FIELDS));
  const result = buildEcommerceSettlement({
    storeName: input.storeName,
    shippingFee: input.shippingFee,
    orderRows,
    flowRows: flowGroups.flat(),
    productCostRows,
    freightRows: freightGroups.flat(),
  });
  const record: EcommerceSettlementRecord = {
    id: `ec-settle-${Date.now()}`,
    storeName: input.storeName?.trim() || DEFAULT_CONFIG.storeName,
    generatedAt: new Date().toISOString(),
    version: '1.0',
    shippingFee: input.shippingFee,
    uploadedFileNames: [
      input.orderFile.name,
      ...input.flowFiles.map((file) => file.name),
      ...(input.productCostFile ? [input.productCostFile.name] : []),
      ...(input.freightFiles || []).map((file) => file.name),
    ],
    ...result,
  };
  const indexedDbSaved = await putIndexedDbRecord(record);
  memoryRecordCache.set(record.id, record);
  const summary = summarizeSettlementRecord(record, indexedDbSaved ? 'indexeddb' : 'memory');
  saveRecordSummaries([summary, ...readRecordSummaries().filter((item) => item.id !== record.id)].slice(0, MAX_STORED_RECORD_SUMMARIES));
  return record;
}

function addRowsSheet(workbook: import('exceljs').Workbook, name: string, headers: readonly string[], rows: Array<Record<string, unknown>>): void {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow([...headers]);
  rows.forEach((row) => sheet.addRow(headers.map((header) => row[header] ?? '')));
  sheet.columns = headers.map((header) => ({ width: Math.max(14, Math.min(28, header.length + 8)) }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
}

export async function createSettlementWorkbook(record: EcommerceSettlementRecord): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '极享OS 电商结算中心';
  workbook.created = new Date(record.generatedAt);

  addRowsSheet(workbook, '订单明细融合表', SHEET_HEADERS.orderDetail, record.orderDetailRows.map((row) => ({
    '订单月份': row.orderMonth,
    '主订单编号': row.mainOrderId,
    '子订单编号': row.subOrderId,
    '结算到账金额': row.flowAmount,
    '运费险': row.freightInsurance,
    '商品数量': row.quantity,
    '商家编码': row.skuCode,
    '商品单价': row.productPrice,
    '订单应付金额': row.payableAmount,
    '产品单件成本': row.productUnitCost,
    '产品总成本': row.productCost || '',
    '订单提交时间': row.submittedAt,
    '订单完成时间': row.completedAt,
    '支付完成时间': row.paidAt,
    '达人ID': row.talentId,
    '达人昵称': row.talentName,
    '发货时间': row.shippedAt,
  })));
  addRowsSheet(workbook, '达人结算汇总表', SHEET_HEADERS.talentSummary, record.talentSummaryRows.map((row) => ({
    '订单月份': row.orderMonth,
    '达人昵称': row.talentName,
    '达人ID': row.talentId,
    '实付订单金额': row.payableAmount,
    '实付订单数': row.orderCount,
    '快递包裹数': row.packageCount || 0,
    '快递费用': row.shippingFee,
    '运费险费用': row.freightInsurance,
    '结算到账金额': row.flowAmount,
    '产品成本': row.productCost,
    '成本总额': row.totalCost ?? roundMoney(row.shippingFee + row.freightInsurance + row.productCost),
    '毛利润': row.estimatedProfit,
    '销售额毛利率': row.grossProfitRate ?? (row.payableAmount === 0 ? '' : Math.round((row.estimatedProfit / row.payableAmount) * 10000) / 10000),
  })));
  addRowsSheet(workbook, '资金流水总览', SHEET_HEADERS.flowOverview, (record.flowOverviewRows || []).map((row) => ({
    '指标': row.metric,
    '值': row.value,
    '说明': row.note,
    'Top动账场景': row.topScene,
    'Top净额': row.topNetAmount,
  })));
  addRowsSheet(workbook, '资金流水场景汇总', SHEET_HEADERS.flowSummary, record.flowSceneSummaryRows.map((row) => ({
    '维度': row.dimension,
    '笔数': row.count,
    '入账金额': row.incomeAmount,
    '出账金额': row.expenseAmount,
    '净额': row.netAmount,
  })));
  addRowsSheet(workbook, '资金流水月份汇总', SHEET_HEADERS.flowSummary, record.flowMonthSummaryRows.map((row) => ({
    '维度': row.dimension,
    '笔数': row.count,
    '入账金额': row.incomeAmount,
    '出账金额': row.expenseAmount,
    '净额': row.netAmount,
  })));
  addRowsSheet(workbook, '资金流水明细核对', SHEET_HEADERS.flowCheck, record.flowCheckRows.map((row) => ({
    '动账时间': row.flowTime,
    '动账方向': row.direction,
    '动账金额': row.amount,
    '带符号金额': row.signedAmount,
    '动账场景': row.scene,
    '主订单编号': row.mainOrderId,
    '子订单编号': row.subOrderId,
    '匹配状态': row.matchStatus === 'matched' ? '已匹配' : '未匹配',
    '备注': row.remark,
  })));
  addRowsSheet(workbook, '异常核对表', SHEET_HEADERS.exceptions, record.exceptionRows.map((row) => ({
    '异常类型': row.type,
    '风险等级': row.level,
    '主订单编号': row.orderId,
    '子订单编号': row.subOrderId,
    '异常说明': row.message,
    '处理建议': row.suggestion,
  })));

  return toArrayBuffer(await workbook.xlsx.writeBuffer());
}

export async function createSettlementBatchWorkbook(input: EcommerceSettlementBatchWorkbookInput): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '极享OS 电商结算中心';
  workbook.created = new Date();
  const records = input.records;
  const totalStats = records.reduce((stats, record) => {
    stats.orderCount += record.stats.orderCount;
    stats.flowCount += record.stats.flowCount;
    stats.totalOrderAmount = roundMoney(stats.totalOrderAmount + record.stats.totalOrderAmount);
    stats.totalFlowAmount = roundMoney(stats.totalFlowAmount + record.stats.totalFlowAmount);
    stats.totalProductCost = roundMoney(stats.totalProductCost + record.stats.totalProductCost);
    stats.totalShippingFee = roundMoney(stats.totalShippingFee + record.stats.totalShippingFee);
    stats.totalFreightInsurance = roundMoney(stats.totalFreightInsurance + record.stats.totalFreightInsurance);
    stats.estimatedProfit = roundMoney(stats.estimatedProfit + record.stats.estimatedProfit);
    stats.exceptionCount += record.stats.exceptionCount;
    return stats;
  }, {
    orderCount: 0,
    flowCount: 0,
    talentCount: 0,
    totalOrderAmount: 0,
    totalFlowAmount: 0,
    totalProductCost: 0,
    totalShippingFee: 0,
    totalFreightInsurance: 0,
    estimatedProfit: 0,
    exceptionCount: 0,
  } satisfies EcommerceSettlementStats);
  totalStats.talentCount = new Set(records.flatMap((record) => (
    record.talentSummaryRows.map((row) => `${record.storeName}\u0001${row.talentId || row.talentName}`)
  ))).size;
  const totalCost = roundMoney(totalStats.totalProductCost + totalStats.totalShippingFee + totalStats.totalFreightInsurance);

  addRowsSheet(workbook, '全部店铺利润总览', ['指标', '值', '说明'], [
    { '指标': '批次名称', '值': input.batchName, '说明': '' },
    { '指标': '结算月份', '值': input.month, '说明': '' },
    { '指标': '店铺数量', '值': records.length, '说明': '已生成结算的店铺' },
    { '指标': '订单数量', '值': totalStats.orderCount, '说明': '' },
    { '指标': '达人数量', '值': totalStats.talentCount, '说明': '按店铺+达人去重' },
    { '指标': '实付订单金额', '值': totalStats.totalOrderAmount, '说明': '' },
    { '指标': '结算到账金额', '值': totalStats.totalFlowAmount, '说明': '' },
    { '指标': '成本总额', '值': totalCost, '说明': '产品成本+快递费用+运费险费用' },
    { '指标': '毛利润', '值': totalStats.estimatedProfit, '说明': '' },
    { '指标': '销售额毛利率', '值': totalStats.totalOrderAmount ? Math.round((totalStats.estimatedProfit / totalStats.totalOrderAmount) * 10000) / 10000 : '', '说明': '毛利润/实付订单金额' },
    { '指标': '异常提示数', '值': totalStats.exceptionCount, '说明': '' },
  ]);

  addRowsSheet(workbook, '店铺利润汇总', [
    '店铺名称',
    '订单月份',
    '订单数量',
    '达人数量',
    '实付订单金额',
    '结算到账金额',
    '产品成本',
    '快递费用',
    '运费险费用',
    '成本总额',
    '毛利润',
    '销售额毛利率',
    '异常提示',
  ], records.map((record) => {
    const recordTotalCost = roundMoney(record.stats.totalProductCost + record.stats.totalShippingFee + record.stats.totalFreightInsurance);
    return {
      '店铺名称': record.storeName,
      '订单月份': record.coveredMonths.join('、'),
      '订单数量': record.stats.orderCount,
      '达人数量': record.stats.talentCount,
      '实付订单金额': record.stats.totalOrderAmount,
      '结算到账金额': record.stats.totalFlowAmount,
      '产品成本': record.stats.totalProductCost,
      '快递费用': record.stats.totalShippingFee,
      '运费险费用': record.stats.totalFreightInsurance,
      '成本总额': recordTotalCost,
      '毛利润': record.stats.estimatedProfit,
      '销售额毛利率': record.stats.totalOrderAmount ? Math.round((record.stats.estimatedProfit / record.stats.totalOrderAmount) * 10000) / 10000 : '',
      '异常提示': record.stats.exceptionCount,
    };
  }));

  addRowsSheet(workbook, '全部达人利润明细', ['店铺名称', ...SHEET_HEADERS.talentSummary], records.flatMap((record) => (
    record.talentSummaryRows.map((row) => ({
      '店铺名称': record.storeName,
      '订单月份': row.orderMonth,
      '达人昵称': row.talentName,
      '达人ID': row.talentId,
      '实付订单金额': row.payableAmount,
      '实付订单数': row.orderCount,
      '快递包裹数': row.packageCount || 0,
      '快递费用': row.shippingFee,
      '运费险费用': row.freightInsurance,
      '结算到账金额': row.flowAmount,
      '产品成本': row.productCost,
      '成本总额': row.totalCost ?? roundMoney(row.shippingFee + row.freightInsurance + row.productCost),
      '毛利润': row.estimatedProfit,
      '销售额毛利率': row.grossProfitRate ?? (row.payableAmount === 0 ? '' : Math.round((row.estimatedProfit / row.payableAmount) * 10000) / 10000),
    }))
  )));

  addRowsSheet(workbook, '订单明细融合表', ['店铺名称', ...SHEET_HEADERS.orderDetail], records.flatMap((record) => (
    record.orderDetailRows.map((row) => ({
      '店铺名称': record.storeName,
      '订单月份': row.orderMonth,
      '主订单编号': row.mainOrderId,
      '子订单编号': row.subOrderId,
      '结算到账金额': row.flowAmount,
      '运费险': row.freightInsurance,
      '商品数量': row.quantity,
      '商家编码': row.skuCode,
      '商品单价': row.productPrice,
      '订单应付金额': row.payableAmount,
      '产品单件成本': row.productUnitCost,
      '产品总成本': row.productCost || '',
      '订单提交时间': row.submittedAt,
      '订单完成时间': row.completedAt,
      '支付完成时间': row.paidAt,
      '达人ID': row.talentId,
      '达人昵称': row.talentName,
      '发货时间': row.shippedAt,
    }))
  )));

  addRowsSheet(workbook, '达人结算汇总表', ['店铺名称', ...SHEET_HEADERS.talentSummary], records.flatMap((record) => (
    record.talentSummaryRows.map((row) => ({
      '店铺名称': record.storeName,
      '订单月份': row.orderMonth,
      '达人昵称': row.talentName,
      '达人ID': row.talentId,
      '实付订单金额': row.payableAmount,
      '实付订单数': row.orderCount,
      '快递包裹数': row.packageCount || 0,
      '快递费用': row.shippingFee,
      '运费险费用': row.freightInsurance,
      '结算到账金额': row.flowAmount,
      '产品成本': row.productCost,
      '成本总额': row.totalCost ?? roundMoney(row.shippingFee + row.freightInsurance + row.productCost),
      '毛利润': row.estimatedProfit,
      '销售额毛利率': row.grossProfitRate ?? (row.payableAmount === 0 ? '' : Math.round((row.estimatedProfit / row.payableAmount) * 10000) / 10000),
    }))
  )));

  addRowsSheet(workbook, '异常核对表', ['店铺名称', ...SHEET_HEADERS.exceptions], records.flatMap((record) => (
    record.exceptionRows.map((row) => ({
      '店铺名称': record.storeName,
      '异常类型': row.type,
      '风险等级': row.level,
      '主订单编号': row.orderId,
      '子订单编号': row.subOrderId,
      '异常说明': row.message,
      '处理建议': row.suggestion,
    }))
  )));

  return toArrayBuffer(await workbook.xlsx.writeBuffer());
}

export const ecommerceSettlementApi = {
  getConfig: getEcommerceSettlementConfig,
  saveConfig: saveEcommerceSettlementConfig,
  fetchRecords: readRecordSummaries,
  fetchRecord: async (id: string) => {
    const cachedRecord = memoryRecordCache.get(id);
    if (cachedRecord) return cachedRecord;
    const indexedDbRecord = await getIndexedDbRecord(id);
    if (indexedDbRecord) return indexedDbRecord;
    return readStoredRecordItems().find((item): item is EcommerceSettlementRecord => isFullSettlementRecord(item) && item.id === id) || null;
  },
  createFromFiles: createSettlementFromFiles,
  createWorkbook: createSettlementWorkbook,
  createBatchWorkbook: createSettlementBatchWorkbook,
  buildSettlement: buildEcommerceSettlement,
  summarizeRecord: summarizeSettlementRecord,
};
