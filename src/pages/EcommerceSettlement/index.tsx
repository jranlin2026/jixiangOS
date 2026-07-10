import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CalculateIcon from '@mui/icons-material/Calculate';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { ecommerceSettlementApi } from '../../api/ecommerceSettlementApi';
import type {
  EcommerceExceptionRow,
  EcommerceSettlementRecord,
  EcommerceSettlementRecordSummary,
  EcommerceSettlementStats,
  EcommerceTalentSummaryRow,
} from '../../types/ecommerceSettlement';
import { ModuleHeader, ModulePage, moduleTablePaperSx, moduleTableSx, moduleTokens } from '../../shared/components/ModuleShell';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import useAuthStore from '../../store/useAuthStore';

type StoreDraft = {
  id: string;
  storeName: string;
  shippingFee: number;
  orderFiles: File[];
  flowFiles: File[];
  productCostFiles: File[];
  freightFiles: File[];
  processing: boolean;
  record: EcommerceSettlementRecord | null;
  error: string | null;
  warning: string | null;
};

type StoreTalentSummaryRow = EcommerceTalentSummaryRow & {
  storeName: string;
};

type StoreExceptionRow = EcommerceExceptionRow & {
  storeName: string;
};

type ResultView = 'stores' | 'talents' | 'exceptions' | 'history';

const resultViews: Array<{ value: ResultView; label: string }> = [
  { value: 'stores', label: '店铺利润' },
  { value: 'talents', label: '达人利润' },
  { value: 'exceptions', label: '异常核对' },
  { value: 'history', label: '最近生成' },
];

const money = (value: number) => `¥${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
const dateText = (value: string) => (value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-');
const percent = (value: number) => (Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '-');
const metricSx = {
  border: `1px solid ${moduleTokens.line}`,
  borderRadius: 1,
  bgcolor: '#fff',
  p: 1.5,
  minHeight: 88,
} as const;

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function makeStoreDraft(index: number, shippingFee: number): StoreDraft {
  return {
    id: `store-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    storeName: `店铺${index}`,
    shippingFee,
    orderFiles: [],
    flowFiles: [],
    productCostFiles: [],
    freightFiles: [],
    processing: false,
    record: null,
    error: null,
    warning: null,
  };
}

function hasStoreRequiredFiles(store: StoreDraft): boolean {
  return store.orderFiles.length > 0 && store.flowFiles.length > 0;
}

function splitMonths(value: string | number | undefined): string[] {
  return String(value || '')
    .split(/[,，、\s]+/)
    .map((item) => item.trim())
    .filter((item) => /^\d{4}-\d{2}$/.test(item));
}

function getRecordFlowMonths(record: EcommerceSettlementRecord): string[] {
  const overviewRow = record.flowOverviewRows.find((row) => row.metric === '覆盖月份');
  return splitMonths(overviewRow?.value);
}

function monthText(months: string[]): string {
  return months.length ? months.join('、') : '未识别';
}

function buildMonthWarning(record: EcommerceSettlementRecord, targetMonth: string): string | null {
  const orderMonths = record.coveredMonths.filter((month) => month && month !== '未识别月份');
  const flowMonths = getRecordFlowMonths(record);
  const mismatches: string[] = [];
  if (!orderMonths.includes(targetMonth)) mismatches.push(`订单明细月份：${monthText(orderMonths)}`);
  if (!flowMonths.includes(targetMonth)) mismatches.push(`资金流水月份：${monthText(flowMonths)}`);
  if (!mismatches.length) return null;
  return `目标结算月份 ${targetMonth} 与上传数据月份不一致，${mismatches.join('；')}。请确认是否上传了正确月份的订单明细和资金流水。`;
}

function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function downloadBlob(filename: string, buffer: ArrayBuffer): void {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function FilePicker({
  label,
  files,
  multiple,
  onChange,
  required,
  hint,
  disabled,
}: {
  label: string;
  files: File[];
  multiple?: boolean;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
  onChange: (files: File[]) => void;
}) {
  return (
    <Box sx={{ border: `1px solid ${moduleTokens.line}`, borderRadius: 1, bgcolor: '#fff', p: 1.25 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1.25}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: moduleTokens.ink }}>
            {label}
            <Chip
              size="small"
              label={required ? '必填' : '可选'}
              sx={{
                ml: 1,
                height: 20,
                fontWeight: 800,
                color: required ? moduleTokens.red : moduleTokens.gray,
                bgcolor: required ? '#FEF3F2' : '#F2F4F7',
              }}
            />
          </Typography>
          <Typography
            variant="caption"
            title={files.length ? files.map((file) => file.name).join('、') : hint}
            sx={{
              color: moduleTokens.muted,
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 360,
            }}
          >
            {files.length ? files.map((file) => file.name).join('、') : hint || '支持 .xlsx 文件'}
          </Typography>
        </Box>
        <Button component="label" variant="outlined" size="small" startIcon={<CloudUploadIcon />} disabled={disabled}>
          选择
          <input
            hidden
            type="file"
            multiple={multiple}
            accept=".xlsx,.xls"
            onChange={(event) => {
              onChange(Array.from(event.target.files || []));
              event.currentTarget.value = '';
            }}
          />
        </Button>
      </Stack>
    </Box>
  );
}

function MetricCard({ label, value, tone = moduleTokens.ink }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <Box sx={metricSx}>
      <Typography variant="caption" sx={{ color: moduleTokens.muted, fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ mt: 0.5, color: tone, fontWeight: 900, lineHeight: 1.25 }}>
        {value}
      </Typography>
    </Box>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Box sx={{ py: 4, textAlign: 'center', color: moduleTokens.muted, border: `1px dashed ${moduleTokens.line}`, borderRadius: 1, bgcolor: '#fff' }}>
      {text}
    </Box>
  );
}

function StoreStatusChip({ store }: { store: StoreDraft }) {
  if (store.processing) return <Chip size="small" label="生成中" color="primary" />;
  if (store.error) return <Chip size="small" label="表格有误" color="error" />;
  if (store.warning) return <Chip size="small" label="月份待核对" color="warning" />;
  if (store.record) return <Chip size="small" label="已生成" color="success" />;
  if (hasStoreRequiredFiles(store)) return <Chip size="small" label="可生成" color="warning" />;
  return <Chip size="small" label="待上传" />;
}

function FileStateChip({ label, ready, required }: { label: string; ready: boolean; required?: boolean }) {
  return (
    <Chip
      size="small"
      label={`${label}${ready ? '✓' : required ? '缺失' : '-'}`}
      sx={{
        height: 22,
        fontWeight: 800,
        color: ready ? moduleTokens.green : required ? moduleTokens.red : moduleTokens.gray,
        bgcolor: ready ? '#ECFDF3' : required ? '#FEF3F2' : '#F2F4F7',
        '& .MuiChip-label': { px: 0.8 },
      }}
    />
  );
}

function CombinedProfitPanel({ stats, storeCount }: { stats: EcommerceSettlementStats; storeCount: number }) {
  const totalCost = roundMoney(stats.totalProductCost + stats.totalShippingFee + stats.totalFreightInsurance);
  const grossMargin = stats.totalOrderAmount ? stats.estimatedProfit / stats.totalOrderAmount : Number.NaN;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(5, 1fr)' }, gap: 1.5 }}>
      <MetricCard label="已生成店铺" value={storeCount} tone={moduleTokens.blue} />
      <MetricCard label="实付订单金额" value={money(stats.totalOrderAmount)} />
      <MetricCard label="结算到账金额" value={money(stats.totalFlowAmount)} />
      <MetricCard label="成本总额" value={money(totalCost)} />
      <MetricCard label="全部店铺毛利润" value={money(stats.estimatedProfit)} tone={stats.estimatedProfit >= 0 ? moduleTokens.green : moduleTokens.red} />
      <MetricCard label="销售额毛利率" value={percent(grossMargin)} />
      <MetricCard label="订单数量" value={stats.orderCount} />
      <MetricCard label="达人数量" value={stats.talentCount} />
      <MetricCard label="资金流水笔数" value={stats.flowCount} />
      <MetricCard label="异常提示" value={stats.exceptionCount} tone={stats.exceptionCount ? moduleTokens.red : moduleTokens.green} />
    </Box>
  );
}

function StoreProfitTable({ records }: { records: EcommerceSettlementRecord[] }) {
  if (!records.length) return <EmptyState text="生成店铺结算后，这里会展示每个店铺的数据和利润。" />;
  return (
    <TableContainer component={Paper} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            <TableCell>店铺</TableCell>
            <TableCell>月份</TableCell>
            <TableCell>订单数</TableCell>
            <TableCell>达人数</TableCell>
            <TableCell>实付订单金额</TableCell>
            <TableCell>结算到账金额</TableCell>
            <TableCell>成本总额</TableCell>
            <TableCell>毛利润</TableCell>
            <TableCell>毛利率</TableCell>
            <TableCell>异常</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {records.map((record) => {
            const totalCost = roundMoney(record.stats.totalProductCost + record.stats.totalShippingFee + record.stats.totalFreightInsurance);
            const margin = record.stats.totalOrderAmount ? record.stats.estimatedProfit / record.stats.totalOrderAmount : Number.NaN;
            return (
              <TableRow hover key={record.id}>
                <TableCell sx={{ fontWeight: 900 }}>{record.storeName}</TableCell>
                <TableCell>{record.coveredMonths.join('、') || '-'}</TableCell>
                <TableCell>{record.stats.orderCount}</TableCell>
                <TableCell>{record.stats.talentCount}</TableCell>
                <TableCell>{money(record.stats.totalOrderAmount)}</TableCell>
                <TableCell>{money(record.stats.totalFlowAmount)}</TableCell>
                <TableCell>{money(totalCost)}</TableCell>
                <TableCell sx={{ fontWeight: 900, color: record.stats.estimatedProfit >= 0 ? moduleTokens.green : moduleTokens.red }}>{money(record.stats.estimatedProfit)}</TableCell>
                <TableCell>{percent(margin)}</TableCell>
                <TableCell>{record.stats.exceptionCount}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function MonthProfitTable({ rows }: { rows: StoreTalentSummaryRow[] }) {
  const summaries = Array.from(rows.reduce((map, row) => {
    const current = map.get(row.orderMonth) || {
      month: row.orderMonth,
      storeNames: new Set<string>(),
      talentCount: new Set<string>(),
      payableAmount: 0,
      flowAmount: 0,
      totalCost: 0,
      estimatedProfit: 0,
    };
    current.storeNames.add(row.storeName);
    current.talentCount.add(`${row.storeName}\u0001${row.talentId || row.talentName}`);
    current.payableAmount = roundMoney(current.payableAmount + row.payableAmount);
    current.flowAmount = roundMoney(current.flowAmount + row.flowAmount);
    current.totalCost = roundMoney(current.totalCost + (row.totalCost || row.productCost + row.shippingFee + row.freightInsurance));
    current.estimatedProfit = roundMoney(current.estimatedProfit + row.estimatedProfit);
    map.set(row.orderMonth, current);
    return map;
  }, new Map<string, {
    month: string;
    storeNames: Set<string>;
    talentCount: Set<string>;
    payableAmount: number;
    flowAmount: number;
    totalCost: number;
    estimatedProfit: number;
  }>()).values()).sort((a, b) => a.month.localeCompare(b.month));

  if (!summaries.length) return <EmptyState text="生成结算后会展示该月份所有达人利润明细和总汇。" />;
  return (
    <TableContainer component={Paper} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            <TableCell>月份</TableCell>
            <TableCell>店铺数</TableCell>
            <TableCell>达人数量</TableCell>
            <TableCell>实付订单金额</TableCell>
            <TableCell>结算到账金额</TableCell>
            <TableCell>成本总额</TableCell>
            <TableCell>毛利润</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {summaries.map((row) => (
            <TableRow hover key={row.month}>
              <TableCell sx={{ fontWeight: 900 }}>{row.month}</TableCell>
              <TableCell>{row.storeNames.size}</TableCell>
              <TableCell>{row.talentCount.size}</TableCell>
              <TableCell>{money(row.payableAmount)}</TableCell>
              <TableCell>{money(row.flowAmount)}</TableCell>
              <TableCell>{money(row.totalCost)}</TableCell>
              <TableCell sx={{ fontWeight: 900, color: row.estimatedProfit >= 0 ? moduleTokens.green : moduleTokens.red }}>{money(row.estimatedProfit)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function TalentTable({ rows }: { rows: StoreTalentSummaryRow[] }) {
  if (!rows.length) return <EmptyState text="暂无达人结算汇总，请先生成店铺结算。" />;
  return (
    <TableContainer component={Paper} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            <TableCell>店铺</TableCell>
            <TableCell>月份</TableCell>
            <TableCell>达人</TableCell>
            <TableCell>订单数</TableCell>
            <TableCell>实付订单金额</TableCell>
            <TableCell>结算到账金额</TableCell>
            <TableCell>产品成本</TableCell>
            <TableCell>快递费用</TableCell>
            <TableCell>运费险</TableCell>
            <TableCell>成本总额</TableCell>
            <TableCell>毛利润</TableCell>
            <TableCell>毛利率</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.slice(0, 80).map((row) => (
            <TableRow hover key={`${row.storeName}-${row.orderMonth}-${row.talentId}-${row.talentName}`}>
              <TableCell sx={{ fontWeight: 800 }}>{row.storeName}</TableCell>
              <TableCell>{row.orderMonth}</TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>{row.talentName}</Typography>
                <Typography variant="caption" sx={{ color: moduleTokens.muted }}>{row.talentId || '-'}</Typography>
              </TableCell>
              <TableCell>{row.orderCount}</TableCell>
              <TableCell>{money(row.payableAmount)}</TableCell>
              <TableCell>{money(row.flowAmount)}</TableCell>
              <TableCell>{money(row.productCost)}</TableCell>
              <TableCell>{money(row.shippingFee)}</TableCell>
              <TableCell>{money(row.freightInsurance)}</TableCell>
              <TableCell>{money(row.totalCost || row.productCost + row.shippingFee + row.freightInsurance)}</TableCell>
              <TableCell sx={{ fontWeight: 900, color: row.estimatedProfit >= 0 ? moduleTokens.green : moduleTokens.red }}>{money(row.estimatedProfit)}</TableCell>
              <TableCell>{typeof row.grossProfitRate === 'number' ? percent(row.grossProfitRate) : '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ExceptionTable({ rows }: { rows: StoreExceptionRow[] }) {
  if (!rows.length) return <EmptyState text="当前已生成店铺没有异常提示。" />;
  return (
    <TableContainer component={Paper} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            <TableCell>店铺</TableCell>
            <TableCell>异常类型</TableCell>
            <TableCell>等级</TableCell>
            <TableCell>订单</TableCell>
            <TableCell>说明</TableCell>
            <TableCell>处理建议</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.slice(0, 80).map((row, index) => (
            <TableRow hover key={`${row.storeName}-${row.type}-${row.orderId}-${row.subOrderId}-${index}`}>
              <TableCell sx={{ fontWeight: 800 }}>{row.storeName}</TableCell>
              <TableCell>{row.type}</TableCell>
              <TableCell>
                <Chip size="small" label={row.level === 'high' ? '高' : row.level === 'medium' ? '中' : '低'} color={row.level === 'high' ? 'error' : row.level === 'medium' ? 'warning' : 'default'} />
              </TableCell>
              <TableCell>
                <Typography variant="body2">{row.orderId || '-'}</Typography>
                <Typography variant="caption" sx={{ color: moduleTokens.muted }}>{row.subOrderId || '-'}</Typography>
              </TableCell>
              <TableCell>{row.message}</TableCell>
              <TableCell>{row.suggestion}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

const EcommerceSettlement: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const [config, setConfig] = useState(() => ecommerceSettlementApi.getConfig());
  const [settlementMonth, setSettlementMonth] = useState(currentMonthValue);
  const [stores, setStores] = useState<StoreDraft[]>(() => [makeStoreDraft(1, ecommerceSettlementApi.getConfig().shippingFee)]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [resultView, setResultView] = useState<ResultView>('stores');
  const [recentRecords, setRecentRecords] = useState<EcommerceSettlementRecordSummary[]>(() => ecommerceSettlementApi.fetchRecords().slice(0, 6));
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const canRunSettlement = hasPermission(currentUser, PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_WORKBENCH, 'write');

  const activeStoreId = selectedStoreId || stores[0]?.id || null;
  const selectedStore = stores.find((store) => store.id === activeStoreId) || stores[0] || null;
  const generatedRecords = useMemo(() => stores.map((store) => store.record).filter((record): record is EcommerceSettlementRecord => Boolean(record)), [stores]);
  const allTalentRows = useMemo<StoreTalentSummaryRow[]>(() => generatedRecords.flatMap((record) => (
    record.talentSummaryRows.map((row) => ({ ...row, storeName: record.storeName }))
  )), [generatedRecords]);
  const allExceptionRows = useMemo<StoreExceptionRow[]>(() => generatedRecords.flatMap((record) => (
    record.exceptionRows.map((row) => ({ ...row, storeName: record.storeName }))
  )), [generatedRecords]);
  const combinedStats = useMemo<EcommerceSettlementStats>(() => {
    const stats = generatedRecords.reduce((acc, record) => {
      acc.orderCount += record.stats.orderCount;
      acc.flowCount += record.stats.flowCount;
      acc.totalOrderAmount = roundMoney(acc.totalOrderAmount + record.stats.totalOrderAmount);
      acc.totalFlowAmount = roundMoney(acc.totalFlowAmount + record.stats.totalFlowAmount);
      acc.totalProductCost = roundMoney(acc.totalProductCost + record.stats.totalProductCost);
      acc.totalShippingFee = roundMoney(acc.totalShippingFee + record.stats.totalShippingFee);
      acc.totalFreightInsurance = roundMoney(acc.totalFreightInsurance + record.stats.totalFreightInsurance);
      acc.estimatedProfit = roundMoney(acc.estimatedProfit + record.stats.estimatedProfit);
      acc.exceptionCount += record.stats.exceptionCount;
      return acc;
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
    });
    stats.talentCount = new Set(allTalentRows.map((row) => `${row.storeName}\u0001${row.talentId || row.talentName}`)).size;
    return stats;
  }, [allTalentRows, generatedRecords]);

  const updateStore = (id: string, patch: Partial<StoreDraft>) => {
    setStores((prev) => prev.map((store) => (store.id === id ? { ...store, ...patch } : store)));
  };

  const refreshRecentRecords = () => {
    setRecentRecords(ecommerceSettlementApi.fetchRecords().slice(0, 6));
  };

  const handleSettlementMonthChange = (month: string) => {
    setSettlementMonth(month);
    setStores((prev) => prev.map((store) => (
      store.record ? { ...store, warning: buildMonthWarning(store.record, month) } : store
    )));
  };

  const createRecordForStore = async (store: StoreDraft): Promise<EcommerceSettlementRecord> => {
    if (!store.orderFiles[0] || !store.flowFiles.length) {
      throw new Error('请先上传订单明细表和资金流水明细表。');
    }
    return ecommerceSettlementApi.createFromFiles({
      storeName: store.storeName,
      shippingFee: store.shippingFee,
      orderFile: store.orderFiles[0],
      flowFiles: store.flowFiles,
      productCostFile: store.productCostFiles[0] || null,
      freightFiles: store.freightFiles,
    });
  };

  const handleGenerateStore = async (storeId: string) => {
    const store = stores.find((item) => item.id === storeId);
    if (!store) return;
    updateStore(storeId, { processing: true, error: null, warning: null });
    setMessage(null);
    try {
      const savedConfig = ecommerceSettlementApi.saveConfig({ storeName: store.storeName, shippingFee: store.shippingFee });
      setConfig(savedConfig);
      const record = await createRecordForStore(store);
      const monthWarning = buildMonthWarning(record, settlementMonth);
      updateStore(storeId, { processing: false, record, error: null, warning: monthWarning });
      refreshRecentRecords();
      setMessage({ type: monthWarning ? 'warning' : 'success', text: monthWarning || `${record.storeName} 已生成结算。` });
    } catch (error) {
      updateStore(storeId, {
        processing: false,
        record: null,
        error: error instanceof Error ? error.message : '结算生成失败',
        warning: null,
      });
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '结算生成失败' });
    }
  };

  const handleGenerateAll = async () => {
    const targets = stores.filter(hasStoreRequiredFiles);
    if (!targets.length) {
      setMessage({ type: 'error', text: '至少需要一个店铺上传订单明细表和资金流水明细表。' });
      return;
    }
    setBatchProcessing(true);
    setMessage(null);
    let successCount = 0;
    let errorCount = 0;
    let warningCount = 0;
    for (const store of targets) {
      updateStore(store.id, { processing: true, error: null, warning: null });
      try {
        const record = await createRecordForStore(store);
        const monthWarning = buildMonthWarning(record, settlementMonth);
        successCount += 1;
        if (monthWarning) warningCount += 1;
        updateStore(store.id, { processing: false, record, error: null, warning: monthWarning });
      } catch (error) {
        errorCount += 1;
        updateStore(store.id, {
          processing: false,
          record: null,
          error: error instanceof Error ? error.message : '结算生成失败',
          warning: null,
        });
      }
    }
    refreshRecentRecords();
    setBatchProcessing(false);
    setMessage({
      type: errorCount || warningCount ? 'warning' : 'success',
      text: errorCount
        ? `已生成 ${successCount} 个店铺，${errorCount} 个店铺表格有误，请看店铺卡片提示。`
        : warningCount
          ? `已生成 ${successCount} 个店铺，其中 ${warningCount} 个店铺月份需要核对。`
          : `已生成 ${successCount} 个店铺结算。`,
    });
  };

  const handleAddStore = () => {
    const nextStore = makeStoreDraft(stores.length + 1, config.shippingFee);
    setStores((prev) => [...prev, nextStore]);
    setSelectedStoreId(nextStore.id);
  };

  const handleRemoveStore = (id: string) => {
    setStores((prev) => {
      if (prev.length <= 1) return prev;
      const nextStores = prev.filter((store) => store.id !== id);
      if (!nextStores.some((store) => store.id === activeStoreId)) {
        setSelectedStoreId(nextStores[0]?.id || null);
      }
      return nextStores;
    });
  };

  const handleDownloadStore = async (record: EcommerceSettlementRecord | EcommerceSettlementRecordSummary) => {
    const fullRecord = 'orderDetailRows' in record ? record : await ecommerceSettlementApi.fetchRecord(record.id);
    if (!fullRecord) {
      setMessage({ type: 'error', text: '这条历史只有摘要，完整明细没有保存在浏览器数据库中。请重新上传原始表生成。' });
      return;
    }
    const buffer = await ecommerceSettlementApi.createWorkbook(fullRecord);
    const month = fullRecord.coveredMonths.join('_') || settlementMonth || '未识别月份';
    downloadBlob(`${fullRecord.storeName}_${month}_电商结算.xlsx`, buffer);
  };

  const handleDownloadBatch = async () => {
    if (!generatedRecords.length) {
      setMessage({ type: 'error', text: '请先生成至少一个店铺结算，再下载全部汇总。' });
      return;
    }
    const batchName = `${settlementMonth} 电商结算`;
    const buffer = await ecommerceSettlementApi.createBatchWorkbook({
      batchName,
      month: settlementMonth,
      records: generatedRecords,
    });
    downloadBlob(`${batchName}_${settlementMonth}_全部店铺汇总.xlsx`, buffer);
  };

  return (
    <ModulePage>
      <ModuleHeader
        title="电商结算中心"
        description="v1 聚焦多店铺月度结算：每个店铺必须上传订单明细和资金流水，商品成本与运费险可选；系统逐店计算，再汇总全部店铺利润和达人利润。"
        actions={(
          <>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddStore} disabled={!canRunSettlement || batchProcessing}>
              添加店铺
            </Button>
            <Button variant="contained" startIcon={<CalculateIcon />} onClick={handleGenerateAll} disabled={!canRunSettlement || batchProcessing}>
              生成全部
            </Button>
            <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={handleDownloadBatch} disabled={!generatedRecords.length || batchProcessing}>
              下载全部汇总
            </Button>
          </>
        )}
      />

      {message && <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}
      {batchProcessing && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}

      <Stack spacing={2}>
        <Paper sx={{ border: `1px solid ${moduleTokens.line}`, borderRadius: 1, boxShadow: 'none', px: 1.5, py: 1.25 }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', lg: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900, color: moduleTokens.ink, minWidth: 72 }}>
              结算参数
            </Typography>
            <TextField
              label="目标月份"
              type="month"
              size="small"
              value={settlementMonth}
              onChange={(event) => handleSettlementMonthChange(event.target.value)}
              sx={{ width: { xs: '100%', lg: 180 }, bgcolor: '#fff' }}
            />
            <TextField
              label="新增店铺默认运费"
              type="number"
              size="small"
              value={config.shippingFee}
              onChange={(event) => {
                const shippingFee = Number(event.target.value);
                setConfig({ ...config, shippingFee });
              }}
              inputProps={{ min: 0, step: 0.1 }}
              sx={{ width: { xs: '100%', lg: 190 }, bgcolor: '#fff' }}
            />
            <Typography variant="caption" sx={{ color: moduleTokens.muted }}>
              生成时会核对订单明细月份和资金流水月份；每个店铺运费可在店铺卡片单独改。
            </Typography>
          </Stack>
        </Paper>

        {generatedRecords.length ? (
          <CombinedProfitPanel stats={combinedStats} storeCount={generatedRecords.length} />
        ) : null}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '360px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
          <Paper sx={{ border: `1px solid ${moduleTokens.line}`, borderRadius: 1, boxShadow: 'none', overflow: 'hidden' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1.5, py: 1.25, borderBottom: `1px solid ${moduleTokens.softLine}` }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <StorefrontIcon color="primary" />
                <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>店铺对账</Typography>
              </Stack>
              <Chip size="small" label={`${stores.length} 个店铺`} />
            </Stack>
            <Stack>
              {stores.map((store, index) => {
                const active = store.id === activeStoreId;
                return (
                  <Button
                    key={store.id}
                    onClick={() => setSelectedStoreId(store.id)}
                    sx={{
                      justifyContent: 'stretch',
                      textAlign: 'left',
                      color: moduleTokens.ink,
                      borderRadius: 0,
                      px: 1.5,
                      py: 1.25,
                      bgcolor: active ? '#EEF4FF' : '#fff',
                      borderLeft: `4px solid ${active ? moduleTokens.blue : 'transparent'}`,
                      borderBottom: `1px solid ${moduleTokens.softLine}`,
                      '&:hover': { bgcolor: active ? '#EEF4FF' : moduleTokens.subtle },
                    }}
                  >
                    <Box sx={{ width: '100%', minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                        <Typography variant="body2" sx={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {store.storeName || `店铺${index + 1}`}
                        </Typography>
                        <StoreStatusChip store={store} />
                      </Stack>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                        <FileStateChip label="订单" ready={store.orderFiles.length > 0} required />
                        <FileStateChip label="流水" ready={store.flowFiles.length > 0} required />
                        <FileStateChip label="成本" ready={store.productCostFiles.length > 0} />
                        <FileStateChip label="运险" ready={store.freightFiles.length > 0} />
                      </Stack>
                      {store.record ? (
                        <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.75 }}>
                          <Typography variant="caption" sx={{ color: moduleTokens.muted }}>
                            {store.record.coveredMonths.join('、') || '未识别月份'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: store.record.stats.estimatedProfit >= 0 ? moduleTokens.green : moduleTokens.red, fontWeight: 900 }}>
                            {money(store.record.stats.estimatedProfit)}
                          </Typography>
                        </Stack>
                      ) : null}
                    </Box>
                  </Button>
                );
              })}
            </Stack>
          </Paper>

          <Paper sx={{ border: `1px solid ${selectedStore?.error ? moduleTokens.red : selectedStore?.warning ? moduleTokens.amber : moduleTokens.line}`, borderRadius: 1, boxShadow: 'none', p: 2 }}>
            {selectedStore ? (
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', lg: 'center' }}>
                  <TextField
                    label="店铺名称"
                    size="small"
                    value={selectedStore.storeName}
                    onChange={(event) => updateStore(selectedStore.id, { storeName: event.target.value, record: null, error: null, warning: null })}
                    sx={{ width: { xs: '100%', lg: 240 }, bgcolor: '#fff' }}
                  />
                  <TextField
                    label="单件快递费用"
                    size="small"
                    type="number"
                    value={selectedStore.shippingFee}
                    onChange={(event) => updateStore(selectedStore.id, { shippingFee: Number(event.target.value), record: null, error: null, warning: null })}
                    inputProps={{ min: 0, step: 0.1 }}
                    sx={{ width: { xs: '100%', lg: 170 }, bgcolor: '#fff' }}
                  />
                  <Box sx={{ flex: 1 }} />
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button size="small" variant="contained" startIcon={<CalculateIcon />} disabled={!canRunSettlement || selectedStore.processing || !hasStoreRequiredFiles(selectedStore)} onClick={() => void handleGenerateStore(selectedStore.id)}>
                      生成当前店铺
                    </Button>
                    {selectedStore.record ? (
                      <Button size="small" variant="outlined" startIcon={<FileDownloadIcon />} onClick={() => void handleDownloadStore(selectedStore.record!)}>
                        下载单店
                      </Button>
                    ) : null}
                    <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} disabled={stores.length <= 1 || selectedStore.processing} onClick={() => handleRemoveStore(selectedStore.id)}>
                      删除
                    </Button>
                  </Stack>
                </Stack>

                {selectedStore.record ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1 }}>
                    <MetricCard label="订单数" value={selectedStore.record.stats.orderCount} />
                    <MetricCard label="达人数" value={selectedStore.record.stats.talentCount} />
                    <MetricCard label="结算到账金额" value={money(selectedStore.record.stats.totalFlowAmount)} />
                    <MetricCard label="毛利润" value={money(selectedStore.record.stats.estimatedProfit)} tone={selectedStore.record.stats.estimatedProfit >= 0 ? moduleTokens.green : moduleTokens.red} />
                  </Box>
                ) : null}

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
                  <FilePicker label="订单明细表" files={selectedStore.orderFiles} required hint="包含主订单编号、子订单编号、订单提交时间、订单应付金额" disabled={selectedStore.processing} onChange={(files) => updateStore(selectedStore.id, { orderFiles: files.slice(0, 1), record: null, error: null, warning: null })} />
                  <FilePicker label="资金流水明细表" files={selectedStore.flowFiles} required multiple hint="包含动账时间、方向、金额、订单号或子订单号" disabled={selectedStore.processing} onChange={(files) => updateStore(selectedStore.id, { flowFiles: files, record: null, error: null, warning: null })} />
                  <FilePicker label="商品成本明细表" files={selectedStore.productCostFiles} hint="可选，按商家编码匹配产品成本" disabled={selectedStore.processing} onChange={(files) => updateStore(selectedStore.id, { productCostFiles: files.slice(0, 1), record: null, error: null, warning: null })} />
                  <FilePicker label="运费险明细表" files={selectedStore.freightFiles} multiple hint="可选，只统计保费状态为已扣减" disabled={selectedStore.processing} onChange={(files) => updateStore(selectedStore.id, { freightFiles: files, record: null, error: null, warning: null })} />
                </Box>
                {selectedStore.error ? <Alert severity="error">{selectedStore.error}</Alert> : null}
                {selectedStore.warning ? <Alert severity="warning">{selectedStore.warning}</Alert> : null}
              </Stack>
            ) : <EmptyState text="请先添加店铺。" />}
          </Paper>
        </Box>

        <Box>
          <Stack direction={{ xs: 'column', lg: 'row' }} alignItems={{ xs: 'stretch', lg: 'center' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>结算结果</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {resultViews.map((item) => (
                <Button
                  key={item.value}
                  size="small"
                  variant={resultView === item.value ? 'contained' : 'outlined'}
                  onClick={() => setResultView(item.value)}
                  sx={{ fontWeight: 800 }}
                >
                  {item.label}
                </Button>
              ))}
            </Stack>
          </Stack>
          {resultView === 'stores' ? <StoreProfitTable records={generatedRecords} /> : null}
          {resultView === 'talents' ? (
            <Stack spacing={1.5}>
              <MonthProfitTable rows={allTalentRows} />
              <TalentTable rows={allTalentRows} />
            </Stack>
          ) : null}
          {resultView === 'exceptions' ? <ExceptionTable rows={allExceptionRows} /> : null}
          {resultView === 'history' ? (
            recentRecords.length ? (
              <TableContainer component={Paper} sx={moduleTablePaperSx}>
                <Table size="small" sx={moduleTableSx}>
                  <TableHead>
                    <TableRow>
                      <TableCell>店铺</TableCell>
                      <TableCell>月份</TableCell>
                      <TableCell>生成时间</TableCell>
                      <TableCell>订单数</TableCell>
                      <TableCell>毛利润</TableCell>
                      <TableCell>操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentRecords.map((record) => (
                      <TableRow hover key={record.id}>
                        <TableCell sx={{ fontWeight: 900 }}>{record.storeName}</TableCell>
                        <TableCell>{record.coveredMonths.join('、') || '-'}</TableCell>
                        <TableCell>{dateText(record.generatedAt)}</TableCell>
                        <TableCell>{record.stats.orderCount}</TableCell>
                        <TableCell sx={{ fontWeight: 900, color: record.stats.estimatedProfit >= 0 ? moduleTokens.green : moduleTokens.red }}>{money(record.stats.estimatedProfit)}</TableCell>
                        <TableCell>
                          <Button size="small" variant="outlined" startIcon={<FileDownloadIcon />} onClick={() => void handleDownloadStore(record)}>
                            下载
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : <EmptyState text="暂无最近生成记录。" />
          ) : null}
        </Box>

        <Alert severity="info">
          导出的单店工作簿保留订单明细融合表、达人结算汇总表、资金流水明细核对和异常核对表；全部汇总工作簿会额外添加全部店铺利润总览、店铺利润汇总和全部达人利润明细。
        </Alert>
      </Stack>
    </ModulePage>
  );
};

export default EcommerceSettlement;
