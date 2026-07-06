import type { Row } from 'exceljs';
import excelJsBrowserUrl from 'exceljs/dist/exceljs.min.js?url';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { getStorageData, setStorageData } from './mock/storage';
import type {
  EcommerceExceptionRow,
  EcommerceFlowCheckRow,
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

const DEFAULT_CONFIG: EcommerceSettlementConfig = {
  storeName: '抖音店铺',
  shippingFee: 2.4,
};

const SETTLEMENT_DB_NAME = 'aaos_ecommerce_settlement';
const SETTLEMENT_DB_VERSION = 1;
const SETTLEMENT_RECORD_STORE = 'records';
const MAX_STORED_RECORD_SUMMARIES = 30;
const PREVIEW_ROW_LIMIT = 12;

const SHEET_HEADERS = {
  orderDetail: [
    '主订单编号',
    '子订单编号',
    '订单月份',
    '订单提交时间',
    '达人昵称',
    '达人ID',
    '商家编码',
    '商品数量',
    '订单应付金额',
    '产品成本',
    '快递成本',
    '运费险',
    '资金流水净额',
    '预估利润',
  ],
  talentSummary: [
    '订单月份',
    '达人昵称',
    '达人ID',
    '订单数',
    '订单应付金额',
    '资金流水净额',
    '产品成本',
    '快递成本',
    '运费险',
    '预估利润',
  ],
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
  return toText(value).replace(/\.0$/, '').trim();
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

function addMoney<T extends string>(map: Map<T, number>, key: T, value: number): void {
  map.set(key, roundMoney((map.get(key) || 0) + value));
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
  const productCostBySku = new Map<string, number>();
  const freightByOrderId = new Map<string, number>();
  const freightOrderIds = new Set<string>();
  const flowSceneSummary = new Map<string, EcommerceFlowSummaryRow>();
  const flowMonthSummary = new Map<string, EcommerceFlowSummaryRow>();
  const flowCheckRows: EcommerceFlowCheckRow[] = [];

  (input.productCostRows || []).forEach((row) => {
    const sku = cleanId(pick(row, ['商家编码', 'SKU编码', '商品编码']));
    if (!sku) return;
    productCostBySku.set(sku, parseMoney(pick(row, ['产品成本', '成本', '单件成本', '商品成本'])));
  });

  (input.freightRows || []).forEach((row) => {
    const orderId = cleanId(pick(row, ['订单编号', '主订单编号', '子订单编号']));
    if (!orderId) return;
    freightOrderIds.add(orderId);
    addMoney(freightByOrderId, orderId, parseMoney(pick(row, ['支付保费', '保费', '运费险金额'])));
  });

  const orderDetailRows = input.orderRows.map((row) => {
    const mainOrderId = cleanId(pick(row, ['主订单编号', '订单编号']));
    const subOrderId = cleanId(pick(row, ['子订单编号', '子订单号']));
    const skuCode = cleanId(pick(row, ['商家编码', 'SKU编码', '商品编码']));
    const quantity = Math.max(1, Math.round(parseMoney(pick(row, ['商品数量', '数量'])) || 1));
    const submittedAtDate = parseDateValue(pick(row, ['订单提交时间', '下单时间']));
    const completedAtDate = parseDateValue(pick(row, ['订单完成时间', '支付完成时间']));
    const orderMonth = monthKey(completedAtDate || submittedAtDate);
    const payableAmount = roundMoney(parseMoney(pick(row, ['订单应付金额', '实付金额', '订单金额'])));
    const productUnitCost = skuCode ? (productCostBySku.get(skuCode) || 0) : 0;
    const productCost = roundMoney(productUnitCost * quantity);
    const shippingFee = roundMoney(input.shippingFee * quantity);
    const freightInsurance = roundMoney((freightByOrderId.get(subOrderId) || 0) + (subOrderId === mainOrderId ? 0 : freightByOrderId.get(mainOrderId) || 0));
    const detail: EcommerceOrderDetailRow = {
      mainOrderId,
      subOrderId,
      orderMonth,
      submittedAt: formatDate(submittedAtDate),
      completedAt: formatDate(completedAtDate),
      skuCode,
      quantity,
      talentId: cleanId(pick(row, ['达人ID', '达人id', '作者ID'])),
      talentName: toText(pick(row, ['达人昵称', '达人名称', '作者昵称'])) || '未识别达人',
      payableAmount,
      platformDiscount: roundMoney(parseMoney(pick(row, ['平台实际承担优惠金额', '平台优惠']))),
      merchantDiscount: roundMoney(parseMoney(pick(row, ['商家实际承担优惠金额', '商家优惠']))),
      talentDiscount: roundMoney(parseMoney(pick(row, ['达人实际承担优惠金额', '达人优惠']))),
      productUnitCost,
      productCost,
      shippingFee,
      freightInsurance,
      flowAmount: 0,
      estimatedProfit: 0,
    };
    detail.estimatedProfit = roundMoney(detail.payableAmount - detail.productCost - detail.shippingFee - detail.freightInsurance);

    if (mainOrderId) orderByMainId.set(mainOrderId, [...(orderByMainId.get(mainOrderId) || []), detail]);
    if (subOrderId) orderBySubId.set(subOrderId, detail);
    if (!productUnitCost && skuCode) {
      pushException(exceptions, {
        type: '商品成本缺失',
        level: 'medium',
        orderId: mainOrderId,
        subOrderId,
        message: `商家编码 ${skuCode} 未匹配到产品成本`,
        suggestion: '补充商品成本明细表后重新结算',
      });
    }
    if (!detail.talentId && detail.talentName === '未识别达人') {
      pushException(exceptions, {
        type: '达人信息缺失',
        level: 'low',
        orderId: mainOrderId,
        subOrderId,
        message: '订单未识别到达人ID或达人昵称',
        suggestion: '核对订单明细表字段是否完整',
      });
    }
    return detail;
  });

  input.flowRows.forEach((row) => {
    const direction = toText(pick(row, ['动账方向', '收支方向']));
    const amount = roundMoney(parseMoney(pick(row, ['动账金额', '金额'])));
    const signedAmount = direction.includes('出') || amount < 0 ? -Math.abs(amount) : Math.abs(amount);
    const mainOrderId = cleanId(pick(row, ['订单号', '主订单编号', '订单编号']));
    const subOrderId = cleanId(pick(row, ['子订单号', '子订单编号']));
    const flowDate = parseDateValue(pick(row, ['动账时间', '发生时间', '创建时间']));
    const scene = toText(pick(row, ['动账场景', '场景'])) || toText(pick(row, ['备注'])) || '未归类';
    const matched = (subOrderId && orderBySubId.get(subOrderId))
      || (mainOrderId && orderByMainId.get(mainOrderId)?.[0])
      || undefined;
    if (matched) {
      matched.flowAmount = roundMoney(matched.flowAmount + signedAmount);
      matched.estimatedProfit = roundMoney(matched.payableAmount + matched.flowAmount - matched.productCost - matched.shippingFee - matched.freightInsurance);
    } else if (mainOrderId || subOrderId) {
      pushException(exceptions, {
        type: '资金流水未匹配订单',
        level: 'high',
        orderId: mainOrderId,
        subOrderId,
        message: `资金流水 ${scene} 未匹配到订单`,
        suggestion: '检查订单明细表是否覆盖该订单，或确认流水订单号字段',
      });
    }

    const addSummary = (map: Map<string, EcommerceFlowSummaryRow>, dimension: string) => {
      const current = map.get(dimension) || { dimension, count: 0, incomeAmount: 0, expenseAmount: 0, netAmount: 0 };
      current.count += 1;
      if (signedAmount >= 0) current.incomeAmount = roundMoney(current.incomeAmount + signedAmount);
      else current.expenseAmount = roundMoney(current.expenseAmount + Math.abs(signedAmount));
      current.netAmount = roundMoney(current.incomeAmount - current.expenseAmount);
      map.set(dimension, current);
    };
    addSummary(flowSceneSummary, scene);
    addSummary(flowMonthSummary, monthKey(flowDate));

    flowCheckRows.push({
      flowTime: formatDate(flowDate),
      direction,
      amount,
      signedAmount,
      scene,
      mainOrderId,
      subOrderId,
      matchStatus: matched ? 'matched' : 'unmatched',
      remark: toText(pick(row, ['备注', '说明'])),
    });
  });

  freightOrderIds.forEach((orderId) => {
    if (!orderByMainId.has(orderId) && !orderBySubId.has(orderId)) {
      pushException(exceptions, {
        type: '运费险未匹配订单',
        level: 'medium',
        orderId,
        subOrderId: '',
        message: `运费险订单 ${orderId} 未匹配到订单明细`,
        suggestion: '检查运费险明细是否跨月，或补充对应订单明细',
      });
    }
  });

  const summaryMap = new Map<string, EcommerceTalentSummaryRow>();
  orderDetailRows.forEach((row) => {
    const key = `${row.orderMonth}::${row.talentId || row.talentName}`;
    const current = summaryMap.get(key) || {
      orderMonth: row.orderMonth,
      talentId: row.talentId,
      talentName: row.talentName,
      orderCount: 0,
      payableAmount: 0,
      flowAmount: 0,
      productCost: 0,
      shippingFee: 0,
      freightInsurance: 0,
      estimatedProfit: 0,
    };
    current.orderCount += 1;
    current.payableAmount = roundMoney(current.payableAmount + row.payableAmount);
    current.flowAmount = roundMoney(current.flowAmount + row.flowAmount);
    current.productCost = roundMoney(current.productCost + row.productCost);
    current.shippingFee = roundMoney(current.shippingFee + row.shippingFee);
    current.freightInsurance = roundMoney(current.freightInsurance + row.freightInsurance);
    current.estimatedProfit = roundMoney(current.estimatedProfit + row.estimatedProfit);
    summaryMap.set(key, current);
  });

  const talentSummaryRows = Array.from(summaryMap.values()).sort((a, b) => (
    a.orderMonth.localeCompare(b.orderMonth) || b.estimatedProfit - a.estimatedProfit
  ));
  const stats: EcommerceSettlementStats = {
    orderCount: orderDetailRows.length,
    flowCount: flowCheckRows.length,
    talentCount: new Set(talentSummaryRows.map((row) => row.talentId || row.talentName)).size,
    totalOrderAmount: roundMoney(orderDetailRows.reduce((sum, row) => sum + row.payableAmount, 0)),
    totalFlowAmount: roundMoney(orderDetailRows.reduce((sum, row) => sum + row.flowAmount, 0)),
    totalProductCost: roundMoney(orderDetailRows.reduce((sum, row) => sum + row.productCost, 0)),
    totalShippingFee: roundMoney(orderDetailRows.reduce((sum, row) => sum + row.shippingFee, 0)),
    totalFreightInsurance: roundMoney(orderDetailRows.reduce((sum, row) => sum + row.freightInsurance, 0)),
    estimatedProfit: roundMoney(orderDetailRows.reduce((sum, row) => sum + row.estimatedProfit, 0)),
    exceptionCount: exceptions.length,
  };

  return {
    orderDetailRows,
    talentSummaryRows,
    flowSceneSummaryRows: Array.from(flowSceneSummary.values()).sort((a, b) => Math.abs(b.netAmount) - Math.abs(a.netAmount)),
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
    '主订单编号': row.mainOrderId,
    '子订单编号': row.subOrderId,
    '订单月份': row.orderMonth,
    '订单提交时间': row.submittedAt,
    '达人昵称': row.talentName,
    '达人ID': row.talentId,
    '商家编码': row.skuCode,
    '商品数量': row.quantity,
    '订单应付金额': row.payableAmount,
    '产品成本': row.productCost,
    '快递成本': row.shippingFee,
    '运费险': row.freightInsurance,
    '资金流水净额': row.flowAmount,
    '预估利润': row.estimatedProfit,
  })));
  addRowsSheet(workbook, '达人结算汇总表', SHEET_HEADERS.talentSummary, record.talentSummaryRows.map((row) => ({
    '订单月份': row.orderMonth,
    '达人昵称': row.talentName,
    '达人ID': row.talentId,
    '订单数': row.orderCount,
    '订单应付金额': row.payableAmount,
    '资金流水净额': row.flowAmount,
    '产品成本': row.productCost,
    '快递成本': row.shippingFee,
    '运费险': row.freightInsurance,
    '预估利润': row.estimatedProfit,
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
  buildSettlement: buildEcommerceSettlement,
  summarizeRecord: summarizeSettlementRecord,
};
