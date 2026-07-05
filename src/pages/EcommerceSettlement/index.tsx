import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
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
import CalculateIcon from '@mui/icons-material/Calculate';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import StorefrontIcon from '@mui/icons-material/Storefront';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { ecommerceSettlementApi } from '../../api/ecommerceSettlementApi';
import type {
  EcommerceExceptionRow,
  EcommerceFlowSummaryRow,
  EcommerceSettlementConfig,
  EcommerceSettlementRecord,
  EcommerceSettlementRecordSummary,
  EcommerceTalentSummaryRow,
} from '../../types/ecommerceSettlement';
import { ModuleHeader, ModulePage, ModuleTabs, ModuleToolbar, Tab, moduleTablePaperSx, moduleTableSx, moduleTokens } from '../../shared/components/ModuleShell';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import useAuthStore from '../../store/useAuthStore';

type EcommerceSettlementTab = 'workbench' | 'history' | 'exceptions' | 'talents' | 'settings' | 'rules';

const tabs: Array<{ value: EcommerceSettlementTab; label: string; permissionKey: string }> = [
  { value: 'workbench', label: '结算工作台', permissionKey: PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_WORKBENCH },
  { value: 'history', label: '结算历史', permissionKey: PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_HISTORY },
  { value: 'exceptions', label: '异常核对', permissionKey: PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_EXCEPTIONS },
  { value: 'talents', label: '达人结算汇总', permissionKey: PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_TALENTS },
  { value: 'settings', label: '店铺与参数', permissionKey: PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_SETTINGS },
  { value: 'rules', label: '结算规则', permissionKey: PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_RULES },
];

const money = (value: number) => `¥${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
const dateText = (value: string) => (value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-');

const metricSx = {
  border: `1px solid ${moduleTokens.line}`,
  borderRadius: 1,
  bgcolor: '#fff',
  p: 1.5,
  minHeight: 92,
} as const;

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
}: {
  label: string;
  files: File[];
  multiple?: boolean;
  required?: boolean;
  onChange: (files: File[]) => void;
}) {
  return (
    <Box sx={{ border: `1px solid ${moduleTokens.line}`, borderRadius: 1, bgcolor: '#fff', p: 1.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1.5}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: moduleTokens.ink }}>
            {label}{required ? <Box component="span" sx={{ color: moduleTokens.red }}> *</Box> : null}
          </Typography>
          <Typography variant="caption" sx={{ color: moduleTokens.muted }}>
            {files.length ? files.map((file) => file.name).join('、') : '支持 .xlsx 文件'}
          </Typography>
        </Box>
        <Button component="label" variant="outlined" size="small" startIcon={<CloudUploadIcon />}>
          选择
          <input
            hidden
            type="file"
            multiple={multiple}
            accept=".xlsx,.xls"
            onChange={(event) => onChange(Array.from(event.target.files || []))}
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
      <Typography variant="h6" sx={{ mt: 0.5, color: tone, fontWeight: 900 }}>
        {value}
      </Typography>
    </Box>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Box sx={{ py: 5, textAlign: 'center', color: moduleTokens.muted, border: `1px dashed ${moduleTokens.line}`, borderRadius: 1, bgcolor: '#fff' }}>
      {text}
    </Box>
  );
}

function TalentTable({ rows }: { rows: EcommerceTalentSummaryRow[] }) {
  if (!rows.length) return <EmptyState text="暂无达人结算汇总，请先生成一批结算。" />;
  return (
    <TableContainer component={Paper} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            <TableCell>月份</TableCell>
            <TableCell>达人</TableCell>
            <TableCell>订单数</TableCell>
            <TableCell>订单金额</TableCell>
            <TableCell>流水净额</TableCell>
            <TableCell>产品成本</TableCell>
            <TableCell>快递成本</TableCell>
            <TableCell>预估利润</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.slice(0, 12).map((row) => (
            <TableRow hover key={`${row.orderMonth}-${row.talentId}-${row.talentName}`}>
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
              <TableCell sx={{ fontWeight: 900, color: row.estimatedProfit >= 0 ? moduleTokens.green : moduleTokens.red }}>{money(row.estimatedProfit)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ExceptionTable({ rows }: { rows: EcommerceExceptionRow[] }) {
  if (!rows.length) return <EmptyState text="当前批次没有异常。" />;
  return (
    <TableContainer component={Paper} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            <TableCell>异常类型</TableCell>
            <TableCell>等级</TableCell>
            <TableCell>订单</TableCell>
            <TableCell>说明</TableCell>
            <TableCell>处理建议</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.slice(0, 16).map((row, index) => (
            <TableRow hover key={`${row.type}-${row.orderId}-${row.subOrderId}-${index}`}>
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

function FlowSummary({ rows }: { rows: EcommerceFlowSummaryRow[] }) {
  if (!rows.length) return <EmptyState text="暂无资金流水汇总。" />;
  return (
    <TableContainer component={Paper} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            <TableCell>场景</TableCell>
            <TableCell>笔数</TableCell>
            <TableCell>入账</TableCell>
            <TableCell>出账</TableCell>
            <TableCell>净额</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.slice(0, 8).map((row) => (
            <TableRow hover key={row.dimension}>
              <TableCell>{row.dimension}</TableCell>
              <TableCell>{row.count}</TableCell>
              <TableCell>{money(row.incomeAmount)}</TableCell>
              <TableCell>{money(row.expenseAmount)}</TableCell>
              <TableCell sx={{ fontWeight: 900 }}>{money(row.netAmount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

const EcommerceSettlement: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const visibleTabs = tabs.filter((tab) => hasPermission(currentUser, tab.permissionKey));
  const [activeTab, setActiveTab] = useState<EcommerceSettlementTab>(visibleTabs[0]?.value || 'workbench');
  const [records, setRecords] = useState<EcommerceSettlementRecordSummary[]>([]);
  const [currentSummary, setCurrentSummary] = useState<EcommerceSettlementRecordSummary | null>(null);
  const [currentRecord, setCurrentRecord] = useState<EcommerceSettlementRecord | null>(null);
  const [config, setConfig] = useState<EcommerceSettlementConfig>(() => ecommerceSettlementApi.getConfig());
  const [orderFiles, setOrderFiles] = useState<File[]>([]);
  const [flowFiles, setFlowFiles] = useState<File[]>([]);
  const [productCostFiles, setProductCostFiles] = useState<File[]>([]);
  const [freightFiles, setFreightFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const canRunSettlement = hasPermission(currentUser, PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_WORKBENCH, 'write');
  const canEditSettings = hasPermission(currentUser, PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_SETTINGS, 'write');

  useEffect(() => {
    const nextRecords = ecommerceSettlementApi.fetchRecords();
    setRecords(nextRecords);
    setCurrentSummary((summary) => summary || nextRecords[0] || null);
  }, []);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.value === activeTab) && visibleTabs[0]) {
      setActiveTab(visibleTabs[0].value);
    }
  }, [activeTab, visibleTabs]);

  const stats = currentRecord?.stats || currentSummary?.stats;
  const hasRequiredFiles = orderFiles.length > 0 && flowFiles.length > 0;
  const topRecords = useMemo(() => records.slice(0, 8), [records]);
  const visibleFlowSummaryRows = currentRecord?.flowSceneSummaryRows || currentSummary?.previewFlowSceneSummaryRows || [];
  const visibleTalentRows = currentRecord?.talentSummaryRows || currentSummary?.previewTalentSummaryRows || [];
  const visibleExceptionRows = currentRecord?.exceptionRows || currentSummary?.previewExceptionRows || [];

  const refreshRecords = (selected?: EcommerceSettlementRecord) => {
    const nextRecords = ecommerceSettlementApi.fetchRecords();
    const selectedSummary = selected ? ecommerceSettlementApi.summarizeRecord(selected, 'memory') : nextRecords[0] || null;
    setRecords(nextRecords);
    setCurrentSummary(selectedSummary);
    setCurrentRecord(selected || null);
  };

  const loadFullRecord = async (summary: EcommerceSettlementRecordSummary): Promise<EcommerceSettlementRecord | null> => {
    const record = await ecommerceSettlementApi.fetchRecord(summary.id);
    setCurrentSummary(summary);
    setCurrentRecord(record);
    if (!record) {
      setMessage({
        type: 'error',
        text: '这条历史只有摘要，完整明细没有保存在浏览器数据库中。请重新上传原始表生成后下载。',
      });
    }
    return record;
  };

  const handleGenerate = async () => {
    if (!hasRequiredFiles || !orderFiles[0]) {
      setMessage({ type: 'error', text: '请先上传订单明细表和资金流水明细表。' });
      return;
    }
    setProcessing(true);
    setMessage(null);
    try {
      const record = await ecommerceSettlementApi.createFromFiles({
        storeName: config.storeName,
        shippingFee: config.shippingFee,
        orderFile: orderFiles[0],
        flowFiles,
        productCostFile: productCostFiles[0] || null,
        freightFiles,
      });
      refreshRecords(record);
      setActiveTab('workbench');
      setMessage({ type: 'success', text: '结算已生成，可在结算历史中下载结果工作簿。' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '结算生成失败' });
    } finally {
      setProcessing(false);
    }
  };

  const handleDownload = async (recordOrSummary: EcommerceSettlementRecord | EcommerceSettlementRecordSummary) => {
    const record = 'orderDetailRows' in recordOrSummary
      ? recordOrSummary
      : await loadFullRecord(recordOrSummary);
    if (!record) return;
    const buffer = await ecommerceSettlementApi.createWorkbook(record);
    const month = record.coveredMonths.join('_') || '未识别月份';
    downloadBlob(`${record.storeName}_${month}_电商结算.xlsx`, buffer);
  };

  const handleSaveConfig = () => {
    const next = ecommerceSettlementApi.saveConfig(config);
    setConfig(next);
    setMessage({ type: 'success', text: '店铺参数已保存。' });
  };

  return (
    <ModulePage>
      <ModuleHeader
        title="电商结算中心"
        description="用于抖音店铺订单、资金流水、商品成本和运费险核对，生成订单融合明细、达人结算汇总和异常核对表。"
        actions={(
          <Button
            variant="contained"
            startIcon={<CalculateIcon />}
            disabled={!canRunSettlement || !hasRequiredFiles || processing}
            onClick={handleGenerate}
          >
            生成结算
          </Button>
        )}
      />
      <ModuleTabs value={activeTab} onChange={(_event, value) => setActiveTab(value)}>
        {visibleTabs.map((tab) => <Tab key={tab.value} value={tab.value} label={tab.label} />)}
      </ModuleTabs>

      {message && <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}
      {processing && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}

      {activeTab === 'workbench' && (
        <Stack spacing={2}>
          <Paper sx={{ border: `1px solid ${moduleTokens.line}`, borderRadius: 1, boxShadow: 'none', p: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <StorefrontIcon color="primary" />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>上传结算资料</Typography>
                <Typography variant="caption" sx={{ color: moduleTokens.muted }}>订单明细和资金流水为必填，商品成本和运费险用于提升核算准确度。</Typography>
              </Box>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
              <FilePicker label="抖店订单明细表" files={orderFiles} required onChange={(files) => setOrderFiles(files.slice(0, 1))} />
              <FilePicker label="资金流水明细表" files={flowFiles} required multiple onChange={setFlowFiles} />
              <FilePicker label="商品成本明细表" files={productCostFiles} onChange={(files) => setProductCostFiles(files.slice(0, 1))} />
              <FilePicker label="运费险明细表" files={freightFiles} multiple onChange={setFreightFiles} />
            </Box>
          </Paper>

          {stats ? (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(6, 1fr)' }, gap: 1.5 }}>
                <MetricCard label="订单数" value={stats.orderCount} tone={moduleTokens.blue} />
                <MetricCard label="流水笔数" value={stats.flowCount} />
                <MetricCard label="达人数量" value={stats.talentCount} />
                <MetricCard label="订单金额" value={money(stats.totalOrderAmount)} />
                <MetricCard label="异常数" value={stats.exceptionCount} tone={stats.exceptionCount ? moduleTokens.red : moduleTokens.green} />
                <MetricCard label="预估利润" value={money(stats.estimatedProfit)} tone={stats.estimatedProfit >= 0 ? moduleTokens.green : moduleTokens.red} />
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' }, gap: 2 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1 }}>资金流水场景汇总</Typography>
                  <FlowSummary rows={visibleFlowSummaryRows} />
                </Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1 }}>达人结算预览</Typography>
                  <TalentTable rows={visibleTalentRows} />
                </Box>
              </Box>
            </>
          ) : (
            <EmptyState text="还没有结算结果。上传订单和流水后点击生成结算。" />
          )}
        </Stack>
      )}

      {activeTab === 'history' && (
        <Stack spacing={1.5}>
          {topRecords.length ? topRecords.map((record) => (
            <Paper key={record.id} sx={{ border: `1px solid ${moduleTokens.line}`, borderRadius: 1, boxShadow: 'none', p: 2 }}>
              <Stack direction={{ xs: 'column', lg: 'row' }} alignItems={{ xs: 'stretch', lg: 'center' }} justifyContent="space-between" gap={1.5}>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <HistoryIcon fontSize="small" color="primary" />
                    <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>{record.storeName}</Typography>
                    <Chip size="small" label={record.coveredMonths.join('、') || '未识别月份'} />
                  </Stack>
                  <Typography variant="body2" sx={{ color: moduleTokens.muted }}>
                    {dateText(record.generatedAt)} · {record.stats.orderCount} 笔订单 · {record.stats.exceptionCount} 个异常 · 文件：{record.uploadedFileNames.join('、')}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" onClick={() => void loadFullRecord(record)}>查看</Button>
                  <Button variant="contained" startIcon={<FileDownloadIcon />} onClick={() => handleDownload(record)}>下载</Button>
                </Stack>
              </Stack>
            </Paper>
          )) : <EmptyState text="暂无结算历史。" />}
        </Stack>
      )}

      {activeTab === 'exceptions' && (
        <Stack spacing={1.5}>
          <ModuleToolbar sx={{ mb: 0 }}>
            <Chip icon={<WarningAmberIcon />} label={`${stats?.exceptionCount || 0} 个异常`} color={(stats?.exceptionCount || 0) > 0 ? 'warning' : 'success'} />
            <Typography variant="body2" sx={{ color: moduleTokens.muted }}>{currentSummary ? `${currentSummary.storeName} · ${currentSummary.coveredMonths.join('、')}` : '请选择结算批次'}</Typography>
          </ModuleToolbar>
          <ExceptionTable rows={visibleExceptionRows} />
        </Stack>
      )}

      {activeTab === 'talents' && (
        <Stack spacing={1.5}>
          <ModuleToolbar sx={{ mb: 0 }}>
            <Chip label={`${stats?.talentCount || 0} 个达人`} color="primary" />
            {(currentRecord || currentSummary) && <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={() => handleDownload(currentRecord || currentSummary!)}>下载当前批次</Button>}
          </ModuleToolbar>
          <TalentTable rows={visibleTalentRows} />
        </Stack>
      )}

      {activeTab === 'settings' && (
        <Paper sx={{ border: `1px solid ${moduleTokens.line}`, borderRadius: 1, boxShadow: 'none', p: 2.5, maxWidth: 760 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <SettingsIcon color="primary" />
            <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>店铺与结算参数</Typography>
          </Stack>
          <Stack spacing={2}>
            <TextField label="默认店铺名称" value={config.storeName} disabled={!canEditSettings} onChange={(event) => setConfig({ ...config, storeName: event.target.value })} />
            <TextField
              label="单件快递成本"
              type="number"
              value={config.shippingFee}
              disabled={!canEditSettings}
              onChange={(event) => setConfig({ ...config, shippingFee: Number(event.target.value) })}
              inputProps={{ min: 0, step: 0.1 }}
            />
            <Button variant="contained" disabled={!canEditSettings} onClick={handleSaveConfig} sx={{ alignSelf: 'flex-start' }}>保存参数</Button>
          </Stack>
        </Paper>
      )}

      {activeTab === 'rules' && (
        <Paper sx={{ border: `1px solid ${moduleTokens.line}`, borderRadius: 1, boxShadow: 'none', p: 2.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1 }}>当前结算口径</Typography>
          <Divider sx={{ mb: 2 }} />
          {[
            '订单明细表和资金流水明细表为必传，系统按子订单号优先匹配流水，匹配不到再回退主订单号。',
            '商品成本表按商家编码匹配，缺失成本会进入异常核对。',
            '运费险按订单编号匹配，未匹配到订单的保费会进入异常核对。',
            '达人结算汇总按订单月份、达人ID/昵称聚合，输出订单金额、流水净额、成本和预估利润。',
            '导出的工作簿包含订单明细融合表、达人结算汇总表、资金流水场景汇总、资金流水月份汇总、资金流水明细核对和异常核对表。',
          ].map((item) => (
            <Typography key={item} variant="body2" sx={{ color: moduleTokens.ink, mb: 1.25 }}>
              {item}
            </Typography>
          ))}
        </Paper>
      )}
    </ModulePage>
  );
};

export default EcommerceSettlement;
