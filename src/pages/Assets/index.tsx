import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import BlockIcon from '@mui/icons-material/Block';
import { assetApi } from '../../api';
import useAssetStore from '../../store/useAssetStore';
import {
  ModuleHeader,
  ModulePage,
  ModuleTabs,
  ModuleToolbar,
  Tab,
  moduleTablePaperSx,
  moduleTableSx,
  moduleTokens,
} from '../../shared/components/ModuleShell';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import type {
  AssetDevice,
  AssetDeviceInput,
  AssetFilters,
  AssetInternetAccount,
  AssetInternetAccountInput,
  AssetPhoneNumber,
  AssetPhoneNumberInput,
  AssetRisk,
  AssetRiskLevel,
  AssetRiskStatus,
  AssetType,
} from '../../types/asset';

type AssetTab = 'overview' | 'devices' | 'phones' | 'accounts' | 'risks' | 'logs' | 'offboarding';

type AssetFormType = 'device' | 'phone' | 'account';

type AssetFormState = {
  open: boolean;
  type: AssetFormType;
  mode: 'create' | 'edit';
  id?: string;
  values: Record<string, string>;
};

const ASSET_TABS: Array<{ value: AssetTab; label: string }> = [
  { value: 'overview', label: '资产总览' },
  { value: 'devices', label: '设备资产' },
  { value: 'phones', label: '手机号资产' },
  { value: 'accounts', label: '互联网账号' },
  { value: 'risks', label: '风险提醒' },
  { value: 'logs', label: '操作日志' },
  { value: 'offboarding', label: '离职回收' },
];

const VALID_TABS = new Set(ASSET_TABS.map((tab) => tab.value));

const shell = {
  ...moduleTokens,
  tableLink: '#1E6BFF',
};

const emptyForm: AssetFormState = {
  open: false,
  type: 'account',
  mode: 'create',
  values: {},
};

function getTabFromSearch(value: string | null): AssetTab {
  return value && VALID_TABS.has(value as AssetTab) ? (value as AssetTab) : 'overview';
}

function riskTone(level?: AssetRiskLevel) {
  if (level === '高') return { color: shell.red, bgcolor: '#FEF3F2', borderColor: '#FECACA' };
  if (level === '中') return { color: shell.amber, bgcolor: '#FFFAEB', borderColor: '#FEDF89' };
  return { color: shell.green, bgcolor: '#ECFDF3', borderColor: '#ABEFC6' };
}

function chipSx(tone: { color: string; bgcolor: string; borderColor: string }) {
  return {
    height: 24,
    borderRadius: '6px',
    fontWeight: 800,
    color: tone.color,
    bgcolor: tone.bgcolor,
    border: `1px solid ${tone.borderColor}`,
    '& .MuiChip-label': { px: 0.75 },
  };
}

function statusTone(value?: string) {
  if (value?.includes('待') || value?.includes('异常')) return riskTone('中');
  if (value?.includes('注销') || value?.includes('停用') || value?.includes('回收')) return riskTone('高');
  return riskTone('低');
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.join(','), ...rows.map((row) => columns.map((column) => escape(row[column])).join(','))].join('\n');
}

const AssetManagement: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = getTabFromSearch(searchParams.get('tab'));
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('');
  const [permissionStatus, setPermissionStatus] = useState('');
  const [riskLevel, setRiskLevel] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [snackbar, setSnackbar] = useState('');
  const [platformOptions, setPlatformOptions] = useState<string[]>([]);
  const [lookupDevices, setLookupDevices] = useState<AssetDevice[]>([]);
  const [lookupPhones, setLookupPhones] = useState<AssetPhoneNumber[]>([]);
  const [formState, setFormState] = useState<AssetFormState>(emptyForm);
  const {
    dashboard,
    devices,
    phones,
    accounts,
    risks,
    logs,
    offboardingTasks,
    detail,
    pagination,
    fetchDashboard,
    fetchDevices,
    fetchPhones,
    fetchAccounts,
    fetchRisks,
    fetchLogs,
    fetchOffboardingTasks,
    fetchDetail,
    createDevice,
    updateDevice,
    createPhone,
    updatePhone,
    createAccount,
    updateAccount,
    updateRiskStatus,
    completeOffboardingTask,
    clearDetail,
  } = useAssetStore();

  const filters = useMemo<AssetFilters>(() => ({
    search,
    platform,
    permissionStatus,
    riskLevel,
    status,
    page: page + 1,
    pageSize: rowsPerPage,
  }), [page, permissionStatus, platform, riskLevel, rowsPerPage, search, status]);

  const deviceById = useMemo(() => new Map(lookupDevices.map((device) => [device.id, device])), [lookupDevices]);
  const phoneById = useMemo(() => new Map(lookupPhones.map((phone) => [phone.id, phone])), [lookupPhones]);

  useEffect(() => {
    fetchDashboard();
    assetApi.fetchDevices({ pageSize: 200 }).then((res) => {
      if (res.code === 0) setLookupDevices(res.data.items);
    });
    assetApi.fetchPhoneNumbers({ pageSize: 200 }).then((res) => {
      if (res.code === 0) setLookupPhones(res.data.items);
    });
    setPlatformOptions(assetApi.getAccountPlatformOptions());
  }, [fetchDashboard]);

  useEffect(() => {
    clearDetail();
    setPage(0);
  }, [activeTab, clearDetail]);

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchDashboard();
      fetchRisks({ pageSize: 5, status: 'open' });
      fetchLogs({ pageSize: 5 });
      return;
    }
    if (activeTab === 'devices') fetchDevices(filters);
    if (activeTab === 'phones') fetchPhones(filters);
    if (activeTab === 'accounts') fetchAccounts(filters);
    if (activeTab === 'risks') fetchRisks(filters);
    if (activeTab === 'logs') fetchLogs(filters);
    if (activeTab === 'offboarding') fetchOffboardingTasks(filters);
  }, [activeTab, fetchAccounts, fetchDashboard, fetchDevices, fetchLogs, fetchOffboardingTasks, fetchPhones, fetchRisks, filters]);

  useEffect(() => {
    setPage(0);
  }, [search, platform, permissionStatus, riskLevel, status]);

  const handleTabChange = (_: React.SyntheticEvent, value: AssetTab) => {
    setPlatform('');
    setPermissionStatus('');
    setRiskLevel('');
    setStatus('');
    setPage(0);
    setSearchParams({ tab: value });
  };

  const refreshLookupData = async () => {
    const [deviceRes, phoneRes] = await Promise.all([
      assetApi.fetchDevices({ pageSize: 200 }),
      assetApi.fetchPhoneNumbers({ pageSize: 200 }),
    ]);
    if (deviceRes.code === 0) setLookupDevices(deviceRes.data.items);
    if (phoneRes.code === 0) setLookupPhones(phoneRes.data.items);
    setPlatformOptions(assetApi.getAccountPlatformOptions());
  };

  const refreshActiveTab = async () => {
    await fetchDashboard();
    if (activeTab === 'devices') await fetchDevices(filters);
    if (activeTab === 'phones') await fetchPhones(filters);
    if (activeTab === 'accounts') await fetchAccounts(filters);
    if (activeTab === 'risks') await fetchRisks(filters);
    if (activeTab === 'logs') await fetchLogs(filters);
    if (activeTab === 'offboarding') await fetchOffboardingTasks(filters);
    await refreshLookupData();
  };

  const defaultCreateType = (): AssetFormType => {
    if (activeTab === 'devices') return 'device';
    if (activeTab === 'phones') return 'phone';
    return 'account';
  };

  const updateFormValue = (field: string, value: string) => {
    setFormState((current) => ({
      ...current,
      values: { ...current.values, [field]: value },
    }));
  };

  const openCreateForm = (type: AssetFormType = defaultCreateType()) => {
    const defaults: Record<AssetFormType, Record<string, string>> = {
      device: {
        simType: '双卡',
        ownerSubject: '公司',
        status: '正常',
        riskLevel: '低',
        monthlyCost: '0',
      },
      phone: {
        operator: '移动',
        deviceId: lookupDevices[0]?.id || '',
        slotType: '卡槽1',
        monthlyFee: '0',
        status: '使用中',
      },
      account: {
        platform: '',
        phoneId: '',
        ownerSubject: '公司',
        permissionStatus: '正常',
        accountStatus: '正常',
        riskLevel: '低',
        monthlyFee: '0',
      },
    };
    setFormState({ open: true, type, mode: 'create', values: defaults[type] });
  };

  const openEditForm = (type: AssetFormType, item: AssetDevice | AssetPhoneNumber | AssetInternetAccount) => {
    const values = Object.entries(item).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = String(value ?? '');
      return acc;
    }, {});
    setFormState({ open: true, type, mode: 'edit', id: item.id, values });
  };

  const closeForm = () => setFormState(emptyForm);

  const submitForm = async () => {
    let saved: AssetDevice | AssetPhoneNumber | AssetInternetAccount | null = null;
    if (formState.type === 'device') {
      const input = formState.values as Partial<AssetDeviceInput>;
      saved = formState.mode === 'edit' && formState.id
        ? await updateDevice(formState.id, input)
        : await createDevice(input);
      if (saved) await fetchDetail('device', saved.id);
    }
    if (formState.type === 'phone') {
      const input = formState.values as Partial<AssetPhoneNumberInput>;
      saved = formState.mode === 'edit' && formState.id
        ? await updatePhone(formState.id, input)
        : await createPhone(input);
      if (saved) await fetchDetail('phone', saved.id);
    }
    if (formState.type === 'account') {
      const input = formState.values as Partial<AssetInternetAccountInput>;
      saved = formState.mode === 'edit' && formState.id
        ? await updateAccount(formState.id, input)
        : await createAccount(input);
      if (saved) await fetchDetail('account', saved.id);
    }
    if (!saved) {
      setSnackbar(useAssetStore.getState().error || '保存失败');
      return;
    }
    closeForm();
    setSnackbar(formState.mode === 'edit' ? '资产资料已更新' : '资产已新增');
    await refreshActiveTab();
  };

  const openDetail = (type: AssetType, id: string) => {
    fetchDetail(type, id);
  };

  const openAccountPhoneDetail = (phoneId?: string) => {
    if (!phoneId) return;
    fetchDetail('phone', phoneId);
  };

  const exportCurrentRows = () => {
    const rowMap: Record<AssetTab, Array<Record<string, unknown>>> = {
      overview: [],
      devices: devices.map((device) => ({
        设备编号: device.deviceCode,
        设备名称: device.deviceName,
        品牌型号: device.brandModel,
        IMEI: device.imeiMasked,
        所属部门: device.department,
        负责人: device.owner,
        当前使用人: device.currentUser,
        状态: device.status,
        风险等级: device.riskLevel,
      })),
      phones: phones.map((phone) => {
        const device = deviceById.get(phone.deviceId);
        return {
          手机号: phone.phoneNumberMasked,
          运营商: phone.operator,
          所属设备: device?.deviceCode || '-',
          卡槽: phone.slotType,
          套餐: phone.packageName,
          月费用: phone.monthlyFee,
          负责人: phone.owner,
          状态: phone.status,
        };
      }),
      accounts: accounts.map((account) => {
        const phone = phoneById.get(account.phoneId || '');
        const device = deviceById.get(phone?.deviceId || '');
        return {
          账号编号: account.accountNo,
          平台: account.platform,
          账号名称: account.accountName,
          登录账号: account.loginAccountMasked,
          绑定手机号: phone?.phoneNumberMasked || '未绑定',
          所属设备: device?.deviceCode || '-',
          负责人: account.owner,
          权限状态: account.permissionStatus,
          风险等级: account.riskLevel,
        };
      }),
      risks: risks.map((risk) => ({
        风险类型: risk.type,
        对象: risk.targetName,
        等级: risk.level,
        状态: risk.status,
        说明: risk.description,
      })),
      logs: logs.map((log) => ({
        时间: log.time,
        动作: log.action,
        对象: `${log.targetType}/${log.targetName}`,
        操作人: log.operator,
        详情: log.detail,
      })),
      offboarding: offboardingTasks.map((task) => ({
        员工: task.employeeName,
        部门: task.department,
        资产类型: task.assetType,
        资产名称: task.assetName,
        状态: task.status,
        截止时间: task.dueAt,
      })),
    };
    const csv = toCsv(rowMap[activeTab]);
    if (!csv) {
      setSnackbar('当前工作区暂无可导出的数据');
      return;
    }
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `资产管理-${ASSET_TABS.find((tab) => tab.value === activeTab)?.label || '台账'}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const renderOverview = () => {
    const cards = [
      { label: '设备资产', value: dashboard?.deviceCount || 0, tone: shell.blue },
      { label: '手机号资产', value: dashboard?.phoneCount || 0, tone: shell.green },
      { label: '互联网账号', value: dashboard?.accountCount || 0, tone: shell.ink },
      { label: '未处理风险', value: dashboard?.openRiskCount || 0, tone: shell.red },
      { label: '离职待回收', value: dashboard?.offboardingCount || 0, tone: shell.amber },
      { label: '月度费用', value: formatCurrency(dashboard?.monthlyCost || 0), tone: shell.blue },
    ];
    return (
      <Box sx={{ display: 'grid', gap: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 1.5 }}>
          {cards.map((card) => (
            <Paper key={card.label} elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 1.75 }}>
              <Typography variant="caption" sx={{ color: shell.muted, fontWeight: 800 }}>
                {card.label}
              </Typography>
              <Typography sx={{ color: card.tone, fontWeight: 900, fontSize: 24, lineHeight: 1.35, mt: 0.5 }}>
                {card.value}
              </Typography>
            </Paper>
          ))}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' }, gap: 2 }}>
          <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 2 }}>
            <Typography sx={{ fontWeight: 900, mb: 1.5 }}>待处理风险</Typography>
            {risks.slice(0, 5).map((risk) => (
              <Stack key={risk.id} direction="row" spacing={1.25} alignItems="center" sx={{ py: 1, borderTop: `1px solid ${shell.softLine}` }}>
                <Chip size="small" label={risk.level} sx={chipSx(riskTone(risk.level))} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{risk.type}</Typography>
                  <Typography variant="caption" sx={{ color: shell.muted }}>{risk.targetName}</Typography>
                </Box>
              </Stack>
            ))}
          </Paper>
          <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 2 }}>
            <Typography sx={{ fontWeight: 900, mb: 1.5 }}>最近操作日志</Typography>
            {logs.slice(0, 5).map((log) => (
              <Box key={log.id} sx={{ py: 1, borderTop: `1px solid ${shell.softLine}` }}>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>{log.action} · {log.targetName}</Typography>
                <Typography variant="caption" sx={{ color: shell.muted }}>{formatDate(log.time, 'yyyy-MM-dd HH:mm')} / {log.operator}</Typography>
              </Box>
            ))}
          </Paper>
        </Box>
      </Box>
    );
  };

  const renderToolbar = () => {
    if (activeTab === 'overview') return null;
    return (
      <ModuleToolbar>
        <TextField
          size="small"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索平台、账号名称、负责人"
          sx={{ minWidth: 280 }}
        />
        {activeTab === 'accounts' && (
          <>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>平台</InputLabel>
              <Select value={platform} label="平台" onChange={(event) => setPlatform(event.target.value)}>
                <MenuItem value="">全部</MenuItem>
                {platformOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>权限状态</InputLabel>
              <Select value={permissionStatus} label="权限状态" onChange={(event) => setPermissionStatus(event.target.value)}>
                <MenuItem value="">全部</MenuItem>
                {['正常', '离职待回收', '已回收'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
              </Select>
            </FormControl>
          </>
        )}
        {(activeTab === 'devices' || activeTab === 'accounts' || activeTab === 'risks') && (
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>风险等级</InputLabel>
            <Select value={riskLevel} label="风险等级" onChange={(event) => setRiskLevel(event.target.value)}>
              <MenuItem value="">全部</MenuItem>
              {['低', '中', '高'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
            </Select>
          </FormControl>
        )}
        {(activeTab === 'risks' || activeTab === 'offboarding') && (
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>处理状态</InputLabel>
            <Select value={status} label="处理状态" onChange={(event) => setStatus(event.target.value)}>
              <MenuItem value="">全部</MenuItem>
              {(activeTab === 'risks' ? ['open', 'resolved', 'ignored'] : ['待回收', '已回收']).map((item) => (
                <MenuItem key={item} value={item}>{item}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <Tooltip title="列设置">
          <IconButton sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, bgcolor: '#fff' }} onClick={() => setSnackbar('列设置会在下一步接入')}>
            <ViewColumnIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </ModuleToolbar>
    );
  };

  const renderDevicesTable = () => (
    <TableContainer component={Paper} elevation={0} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            {['设备编号', '设备名称', '品牌型号', 'IMEI', 'SIM类型', '所属部门', '负责人', '当前使用人', '状态', '风险', '操作'].map((column) => (
              <TableCell key={column}>{column}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {devices.map((device) => (
            <TableRow hover key={device.id} onClick={() => openDetail('device', device.id)} sx={{ cursor: 'pointer' }}>
              <TableCell sx={{ color: shell.tableLink, fontWeight: 900 }}>{device.deviceCode}</TableCell>
              <TableCell>{device.deviceName}</TableCell>
              <TableCell>{device.brandModel}</TableCell>
              <TableCell>{device.imeiMasked}</TableCell>
              <TableCell>{device.simType}</TableCell>
              <TableCell>{device.department}</TableCell>
              <TableCell>{device.owner || '-'}</TableCell>
              <TableCell>{device.currentUser || '-'}</TableCell>
              <TableCell><Chip size="small" label={device.status} sx={chipSx(statusTone(device.status))} /></TableCell>
              <TableCell><Chip size="small" label={device.riskLevel} sx={chipSx(riskTone(device.riskLevel))} /></TableCell>
              <TableCell>
                <Tooltip title="查看详情"><IconButton size="small"><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="编辑资料">
                  <IconButton size="small" onClick={(event) => { event.stopPropagation(); openEditForm('device', device); }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {renderPagination()}
    </TableContainer>
  );

  const renderPhonesTable = () => (
    <TableContainer component={Paper} elevation={0} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            {['手机号', '运营商', '所属设备', '卡槽', '套餐', '月费用', '负责人', '状态', '操作'].map((column) => (
              <TableCell key={column}>{column}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {phones.map((phone) => {
            const device = deviceById.get(phone.deviceId);
            return (
              <TableRow hover key={phone.id} onClick={() => openDetail('phone', phone.id)} sx={{ cursor: 'pointer' }}>
                <TableCell sx={{ color: shell.tableLink, fontWeight: 900 }}>{phone.phoneNumberMasked}</TableCell>
                <TableCell>{phone.operator}</TableCell>
                <TableCell sx={{ color: shell.tableLink }}>{device ? `${device.deviceCode} / ${device.deviceName}` : '-'}</TableCell>
                <TableCell>{phone.slotType}</TableCell>
                <TableCell>{phone.packageName}</TableCell>
                <TableCell>{formatCurrency(phone.monthlyFee)}</TableCell>
                <TableCell>{phone.owner || '-'}</TableCell>
                <TableCell><Chip size="small" label={phone.status} sx={chipSx(statusTone(phone.status))} /></TableCell>
                <TableCell>
                  <Tooltip title="查看详情"><IconButton size="small"><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="编辑资料">
                    <IconButton size="small" onClick={(event) => { event.stopPropagation(); openEditForm('phone', phone); }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {renderPagination()}
    </TableContainer>
  );

  const renderAccountsTable = () => (
    <TableContainer component={Paper} elevation={0} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            {['账号编号', '平台', '账号名称', '登录账号', '绑定手机号', '所属设备', '负责人', '权限状态', '风险等级', '月费用', '到期时间', '操作'].map((column) => (
              <TableCell key={column}>{column}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {accounts.map((account) => {
            const phone = phoneById.get(account.phoneId || '');
            const device = deviceById.get(phone?.deviceId || '');
            return (
              <TableRow hover key={account.id} onClick={() => openDetail('account', account.id)} sx={{ cursor: 'pointer' }}>
                <TableCell sx={{ color: shell.tableLink, fontWeight: 900 }}>{account.accountNo}</TableCell>
                <TableCell>{account.platform}</TableCell>
                <TableCell>{account.accountName}</TableCell>
                <TableCell>{account.loginAccountMasked}</TableCell>
                <TableCell
                  sx={{ color: phone ? shell.tableLink : shell.amber, fontWeight: 800 }}
                  onClick={(event) => {
                    event.stopPropagation();
                    openAccountPhoneDetail(account.phoneId);
                  }}
                >
                  {phone?.phoneNumberMasked || '未绑定'}
                </TableCell>
                <TableCell sx={{ color: device ? shell.tableLink : shell.muted }}>
                  {device ? `${device.deviceCode} / ${device.deviceName}` : '-'}
                </TableCell>
                <TableCell>{account.owner || '-'}</TableCell>
                <TableCell><Chip size="small" label={account.permissionStatus} sx={chipSx(statusTone(account.permissionStatus))} /></TableCell>
                <TableCell><Chip size="small" label={account.riskLevel} sx={chipSx(riskTone(account.riskLevel))} /></TableCell>
                <TableCell>{formatCurrency(account.monthlyFee)}</TableCell>
                <TableCell>{account.expiresAt || '-'}</TableCell>
                <TableCell>
                  <Tooltip title="查看详情"><IconButton size="small"><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="编辑资料"><IconButton size="small" onClick={(event) => { event.stopPropagation(); openEditForm('account', account); }}><EditIcon fontSize="small" /></IconButton></Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {renderPagination()}
    </TableContainer>
  );

  const renderRisksTable = () => (
    <TableContainer component={Paper} elevation={0} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            {['风险类型', '关联对象', '等级', '状态', '说明', '创建时间', '操作'].map((column) => <TableCell key={column}>{column}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {risks.map((risk) => (
            <TableRow hover key={risk.id} onClick={() => openDetail(risk.targetType, risk.targetId)} sx={{ cursor: 'pointer' }}>
              <TableCell>{risk.type}</TableCell>
              <TableCell sx={{ color: shell.tableLink, fontWeight: 800 }}>{risk.targetName}</TableCell>
              <TableCell><Chip size="small" label={risk.level} sx={chipSx(riskTone(risk.level))} /></TableCell>
              <TableCell>{risk.status}</TableCell>
              <TableCell>{risk.description}</TableCell>
              <TableCell>{formatDate(risk.createdAt, 'yyyy-MM-dd HH:mm')}</TableCell>
              <TableCell>
                <Tooltip title="标记解决">
                  <IconButton size="small" onClick={(event) => { event.stopPropagation(); updateRiskStatus(risk.id, 'resolved'); }}>
                    <CheckCircleOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="忽略">
                  <IconButton size="small" onClick={(event) => { event.stopPropagation(); updateRiskStatus(risk.id, 'ignored'); }}>
                    <BlockIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {renderPagination()}
    </TableContainer>
  );

  const renderLogsTable = () => (
    <TableContainer component={Paper} elevation={0} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            {['时间', '动作', '对象类型', '对象名称', '操作人', '详情'].map((column) => <TableCell key={column}>{column}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {logs.map((log) => (
            <TableRow hover key={log.id}>
              <TableCell>{formatDate(log.time, 'yyyy-MM-dd HH:mm:ss')}</TableCell>
              <TableCell>{log.action}</TableCell>
              <TableCell>{log.targetType}</TableCell>
              <TableCell>{log.targetName}</TableCell>
              <TableCell>{log.operator}</TableCell>
              <TableCell>{log.detail}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {renderPagination()}
    </TableContainer>
  );

  const renderOffboardingTable = () => (
    <TableContainer component={Paper} elevation={0} sx={moduleTablePaperSx}>
      <Table size="small" sx={moduleTableSx}>
        <TableHead>
          <TableRow>
            {['员工', '部门', '资产类型', '资产名称', '权限状态', '回收状态', '截止时间', '操作'].map((column) => <TableCell key={column}>{column}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {offboardingTasks.map((task) => (
            <TableRow hover key={task.id} onClick={() => openDetail('account', task.assetId)} sx={{ cursor: 'pointer' }}>
              <TableCell>{task.employeeName}</TableCell>
              <TableCell>{task.department}</TableCell>
              <TableCell>{task.assetType}</TableCell>
              <TableCell sx={{ color: shell.tableLink, fontWeight: 800 }}>{task.assetName}</TableCell>
              <TableCell><Chip size="small" label={task.permissionStatus} sx={chipSx(statusTone(task.permissionStatus))} /></TableCell>
              <TableCell>{task.status}</TableCell>
              <TableCell>{task.dueAt}</TableCell>
              <TableCell>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={task.status === '已回收'}
                  onClick={(event) => {
                    event.stopPropagation();
                    completeOffboardingTask(task.id);
                  }}
                >
                  标记已回收
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {renderPagination()}
    </TableContainer>
  );

  const renderPagination = () => (
    <TablePagination
      component="div"
      count={pagination.total}
      page={Math.max(0, pagination.page - 1)}
      onPageChange={(_, nextPage) => setPage(nextPage)}
      rowsPerPage={pagination.pageSize}
      onRowsPerPageChange={(event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
      }}
      labelRowsPerPage="每页行数"
      labelDisplayedRows={formatPaginationRows}
    />
  );

  const renderActiveTable = () => {
    if (activeTab === 'overview') return renderOverview();
    if (activeTab === 'devices') return renderDevicesTable();
    if (activeTab === 'phones') return renderPhonesTable();
    if (activeTab === 'accounts') return renderAccountsTable();
    if (activeTab === 'risks') return renderRisksTable();
    if (activeTab === 'logs') return renderLogsTable();
    return renderOffboardingTable();
  };

  const primaryDevice = detail?.device || detail?.relatedDevice;
  const primaryPhone = detail?.phone || detail?.relatedPhones[0];
  const primaryAccount = detail?.account || detail?.relatedAccounts[0];

  const renderDetailPanel = () => {
    if (!detail || activeTab === 'overview' || activeTab === 'logs') return null;
    return (
      <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, mt: 2, bgcolor: '#fff', overflow: 'hidden' }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', lg: 'center' }} justifyContent="space-between" sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${shell.softLine}` }}>
          <Box>
            <Typography sx={{ fontWeight: 900 }}>关联追溯</Typography>
            <Typography variant="caption" sx={{ color: shell.muted }}>
              当前资产 + 关联手机号 + 关联账号 + 风险 + 最近操作日志
            </Typography>
          </Box>
          <Button
            size="small"
            variant="contained"
            startIcon={<EditIcon />}
            onClick={() => {
              if (detail.device) openEditForm('device', detail.device);
              else if (detail.phone) openEditForm('phone', detail.phone);
              else if (detail.account) openEditForm('account', detail.account);
            }}
          >
            编辑资料
          </Button>
        </Stack>
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1.4fr 1fr' }, gap: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 28px 1fr 28px 1fr' }, gap: 1, alignItems: 'stretch' }}>
            {renderTraceNode('设备资产', primaryDevice ? `${primaryDevice.deviceCode} ${primaryDevice.deviceName}` : '未关联设备', primaryDevice?.department || '-')}
            {renderTraceArrow()}
            {renderTraceNode('手机号资产', primaryPhone ? `${primaryPhone.phoneNumberMasked} / ${primaryPhone.slotType}` : '未绑定手机号', primaryPhone?.operator || '-')}
            {renderTraceArrow()}
            {renderTraceNode('互联网账号', primaryAccount ? `${primaryAccount.platform} ${primaryAccount.accountName}` : '未关联账号', primaryAccount?.accountNo || '-')}
          </Box>
          <Box sx={{ display: 'grid', gap: 1 }}>
            <Paper elevation={0} sx={{ border: `1px solid ${shell.softLine}`, borderRadius: 1, p: 1.25 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                <Typography variant="body2" sx={{ fontWeight: 900 }}>风险提示</Typography>
                {detail.risks.length ? <Chip size="small" label={`${detail.risks.length}项`} sx={chipSx(riskTone('中'))} /> : <Chip size="small" label="暂无" sx={chipSx(riskTone('低'))} />}
              </Stack>
              {detail.risks.length ? detail.risks.map((risk) => (
                <Typography key={risk.id} variant="caption" sx={{ color: shell.muted, display: 'block' }}>
                  {risk.type}：{risk.description}
                </Typography>
              )) : (
                <Typography variant="caption" sx={{ color: shell.muted }}>当前关联链路没有未处理风险。</Typography>
              )}
            </Paper>
            <Paper elevation={0} sx={{ border: `1px solid ${shell.softLine}`, borderRadius: 1, p: 1.25 }}>
              <Typography variant="body2" sx={{ fontWeight: 900, mb: 0.75 }}>最近操作日志</Typography>
              {detail.logs.slice(0, 3).map((log) => (
                <Typography key={log.id} variant="caption" sx={{ color: shell.muted, display: 'block', mb: 0.25 }}>
                  {formatDate(log.time, 'MM-dd HH:mm')} {log.operator} {log.action}：{log.targetName}
                </Typography>
              ))}
            </Paper>
          </Box>
        </Box>
      </Paper>
    );
  };

  const renderTraceNode = (label: string, title: string, description: string) => (
    <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 1.5, bgcolor: '#FBFCFE' }}>
      <Typography variant="caption" sx={{ color: shell.muted, fontWeight: 800 }}>{label}</Typography>
      <Typography variant="body2" sx={{ color: shell.ink, fontWeight: 900, mt: 0.75 }}>{title}</Typography>
      <Typography variant="caption" sx={{ color: shell.muted }}>{description}</Typography>
    </Paper>
  );

  const renderTraceArrow = () => (
    <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', justifyContent: 'center', color: shell.muted, fontWeight: 900 }}>
      →
    </Box>
  );

  const renderTextField = (name: string, label: string, props: { required?: boolean; type?: string; multiline?: boolean } = {}) => (
    <TextField
      size="small"
      label={label}
      value={formState.values[name] || ''}
      onChange={(event) => updateFormValue(name, event.target.value)}
      required={props.required}
      type={props.type}
      multiline={props.multiline}
      minRows={props.multiline ? 2 : undefined}
      fullWidth
    />
  );

  const renderSelectField = (name: string, label: string, options: string[], props: { required?: boolean } = {}) => (
    <FormControl size="small" fullWidth required={props.required}>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={formState.values[name] || ''}
        onChange={(event) => updateFormValue(name, event.target.value)}
      >
        <MenuItem value="">未选择</MenuItem>
        {options.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
      </Select>
    </FormControl>
  );

  const renderDeviceFields = () => (
    <>
      {renderTextField('deviceName', '设备名称', { required: true })}
      {renderTextField('brandModel', '品牌型号', { required: true })}
      {renderTextField('imei', 'IMEI', { required: true })}
      {renderSelectField('simType', 'SIM类型', ['单卡', '双卡'], { required: true })}
      {renderSelectField('ownerSubject', '所属主体', ['公司', '法人', '员工个人'], { required: true })}
      {renderTextField('department', '所属部门')}
      {renderTextField('owner', '负责人')}
      {renderTextField('currentUser', '当前使用人')}
      {renderSelectField('status', '状态', ['正常', '使用中', '闲置', '已注销'], { required: true })}
      {renderSelectField('riskLevel', '风险等级', ['低', '中', '高'], { required: true })}
      {renderTextField('monthlyCost', '月费用', { type: 'number' })}
      {renderTextField('remark', '备注', { multiline: true })}
    </>
  );

  const renderPhoneFields = () => (
    <>
      {renderTextField('phoneNumber', '完整手机号', { required: true })}
      {renderSelectField('operator', '运营商', ['移动', '联通', '电信', '广电'], { required: true })}
      <FormControl size="small" fullWidth required>
        <InputLabel>所属设备</InputLabel>
        <Select
          label="所属设备"
          value={formState.values.deviceId || ''}
          onChange={(event) => updateFormValue('deviceId', event.target.value)}
        >
          <MenuItem value="">未选择</MenuItem>
          {lookupDevices.map((device) => (
            <MenuItem key={device.id} value={device.id}>{device.deviceCode} / {device.deviceName}</MenuItem>
          ))}
        </Select>
      </FormControl>
      {renderSelectField('slotType', 'SIM卡槽', ['卡槽1', '卡槽2'], { required: true })}
      {renderTextField('packageName', '套餐')}
      {renderTextField('monthlyFee', '月费用', { type: 'number' })}
      {renderTextField('owner', '负责人')}
      {renderSelectField('status', '状态', ['使用中', '闲置', '已停用'], { required: true })}
    </>
  );

  const renderAccountFields = () => (
    <>
      {renderTextField('platform', '平台', { required: true })}
      {renderTextField('accountName', '账号名称', { required: true })}
      {renderTextField('loginAccount', '登录账号', { required: true })}
      <FormControl size="small" fullWidth>
        <InputLabel>绑定手机号</InputLabel>
        <Select
          label="绑定手机号"
          value={formState.values.phoneId || ''}
          onChange={(event) => updateFormValue('phoneId', event.target.value)}
        >
          <MenuItem value="">暂不绑定</MenuItem>
          {lookupPhones.map((phone) => {
            const device = deviceById.get(phone.deviceId);
            return (
              <MenuItem key={phone.id} value={phone.id}>
                {phone.phoneNumberMasked} / {device?.deviceCode || '未关联设备'} / {phone.slotType}
              </MenuItem>
            );
          })}
        </Select>
      </FormControl>
      {renderTextField('boundEmail', '绑定邮箱')}
      {renderSelectField('ownerSubject', '所属主体', ['公司', '法人', '员工个人'], { required: true })}
      {renderTextField('department', '所属部门')}
      {renderTextField('owner', '负责人')}
      {renderTextField('currentUser', '当前使用人')}
      {renderSelectField('permissionStatus', '权限状态', ['正常', '离职待回收', '已回收'], { required: true })}
      {renderSelectField('accountStatus', '账号状态', ['使用中', '正常', '闲置', '异常', '已注销'], { required: true })}
      {renderSelectField('riskLevel', '风险等级', ['低', '中', '高'], { required: true })}
      {renderTextField('serviceProvider', '服务商')}
      {renderTextField('monthlyFee', '月费用', { type: 'number' })}
      {renderTextField('expiresAt', '到期时间', { type: 'date' })}
      {renderTextField('purpose', '用途', { multiline: true })}
    </>
  );

  const renderFormDialog = () => {
    const title = formState.mode === 'edit' ? '编辑资产资料' : '新增资产';
    return (
      <Dialog open={formState.open} onClose={closeForm} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 900, pb: 1 }}>
          {title}
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: '#FBFCFE' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, pt: 0.5 }}>
            <FormControl size="small" fullWidth disabled={formState.mode === 'edit'}>
              <InputLabel>资产类型</InputLabel>
              <Select
                label="资产类型"
                value={formState.type}
                onChange={(event) => openCreateForm(event.target.value as AssetFormType)}
              >
                <MenuItem value="device">设备资产</MenuItem>
                <MenuItem value="phone">手机号资产</MenuItem>
                <MenuItem value="account">互联网账号</MenuItem>
              </Select>
            </FormControl>
            <Box sx={{ display: { xs: 'none', md: 'block' } }} />
            {formState.type === 'device' && renderDeviceFields()}
            {formState.type === 'phone' && renderPhoneFields()}
            {formState.type === 'account' && renderAccountFields()}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={closeForm}>取消</Button>
          <Button variant="contained" onClick={submitForm}>保存</Button>
        </DialogActions>
      </Dialog>
    );
  };

  return (
    <ModulePage>
      <ModuleHeader
        title="资产管理"
        description="管理设备、手机号与互联网账号，追溯归属、风险与离职回收。"
        actions={(
          <>
            <Button variant="outlined" startIcon={<FileUploadIcon />} onClick={() => setSnackbar('导入模板与失败行反馈会在下一步接入')}>
              导入
            </Button>
            <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={exportCurrentRows}>
              导出
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => openCreateForm()}>
              新增资产
            </Button>
          </>
        )}
      />
      <ModuleTabs value={activeTab} onChange={handleTabChange}>
        {ASSET_TABS.map((tab) => <Tab key={tab.value} value={tab.value} label={tab.label} />)}
      </ModuleTabs>
      {renderToolbar()}
      {renderActiveTable()}
      {renderDetailPanel()}
      {renderFormDialog()}
      <Snackbar
        open={Boolean(snackbar)}
        autoHideDuration={2200}
        onClose={() => setSnackbar('')}
        message={snackbar}
      />
    </ModulePage>
  );
};

export default AssetManagement;
