import React, { useEffect, useMemo, useState } from 'react';
import {
  useSearchParams } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import TablePagination from '../../shared/components/TablePagination';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { assetApi } from '../../api';
import { departmentApi, settingsApi } from '../../api';
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
import TableViewSettingsDialog from '../../shared/components/TableViewSettingsDialog';
import type { TableViewColumnConfig } from '../../shared/components/TableViewSettingsDialog';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import { useTableViewConfig } from '../../shared/hooks/useTableViewConfig';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import type {
  AssetDevice,
  AssetDeviceInput,
  AssetFilters,
  AssetImportResult,
  AssetImportType,
  AssetInternetAccount,
  AssetInternetAccountInput,
  AssetMatrixPublishTaskInput,
  AssetPhoneNumber,
  AssetPhoneNumberInput,
  AssetSensitiveField,
  AssetType,
} from '../../types/asset';
import type { Department } from '../../types/department';
import type { User } from '../../types/settings';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';

type AssetTab = 'overview' | 'devices' | 'phones' | 'accounts' | 'matrix' | 'logs' | 'offboarding';

type AssetFormType = 'device' | 'phone' | 'account';

type ConfigurableAssetTab = Extract<AssetTab, 'devices' | 'phones' | 'accounts'>;

type AssetColumnConfig = TableViewColumnConfig & {
  width: number;
};

type AssetFormState = {
  open: boolean;
  type: AssetFormType;
  mode: 'create' | 'edit';
  id?: string;
  values: Record<string, string>;
};

type AssetImportState = {
  open: boolean;
  type: AssetImportType;
  csvText: string;
  fileName: string;
  result: AssetImportResult | null;
};

type AssetDeleteTarget = {
  type: AssetFormType;
  id: string;
  label: string;
} | null;

type MatrixPublishFormState = {
  open: boolean;
  values: AssetMatrixPublishTaskInput;
};

const ASSET_TABS: Array<{ value: AssetTab; label: string; permissionKey: string }> = [
  { value: 'overview', label: '资产总览', permissionKey: PERMISSION_KEYS.ASSETS_OVERVIEW },
  { value: 'devices', label: '设备资产', permissionKey: PERMISSION_KEYS.ASSETS_DEVICES },
  { value: 'phones', label: '手机号资产', permissionKey: PERMISSION_KEYS.ASSETS_PHONES },
  { value: 'accounts', label: '互联网账号', permissionKey: PERMISSION_KEYS.ASSETS_ACCOUNTS },
  { value: 'matrix', label: '矩阵发布', permissionKey: PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH },
  { value: 'logs', label: '操作日志', permissionKey: PERMISSION_KEYS.ASSETS_LOGS },
  { value: 'offboarding', label: '离职回收', permissionKey: PERMISSION_KEYS.ASSETS_OFFBOARDING },
];

const CONFIGURABLE_ASSET_TABS = new Set<AssetTab>(['devices', 'phones', 'accounts']);

const ASSET_ACTION_COLUMN_WIDTH = 132;
const ASSET_LOOKUP_PAGE_SIZE = 200;

const readAssetText = (asset: unknown, keys: string[], fallback: string): string => {
  const row = asset as Record<string, unknown>;
  const value = keys.map((key) => row[key]).find((item) => String(item || '').trim());
  return value === undefined || value === null ? fallback : String(value);
};

const deviceDeleteLabel = (device: AssetDevice) => {
  const code = readAssetText(device, ['deviceCode', 'assetCode', 'code', 'deviceNo'], device.id);
  const name = readAssetText(device, ['deviceName', 'assetName', 'name', 'brandModel'], '设备资产');
  return `${code} / ${name}`;
};

const phoneDeleteLabel = (phone: AssetPhoneNumber) => (
  readAssetText(phone, ['phoneNumberMasked', 'phoneNumber', 'assetName', 'name'], phone.id)
);

const accountDeleteLabel = (account: AssetInternetAccount) => {
  const platform = readAssetText(account, ['platform'], '互联网账号');
  const name = readAssetText(account, ['accountName', 'assetName', 'name', 'loginAccountMasked'], account.id);
  return `${platform} / ${name}`;
};

const PLATFORM_LOGOS = [
  { keyword: '快手', label: '快', color: '#FF5B22' },
  { keyword: '抖音', label: '抖', color: '#111827' },
  { keyword: '微信', label: '微', color: '#18B566' },
  { keyword: '视频号', label: '视', color: '#18B566' },
  { keyword: '美团', label: '美', color: '#F6C343' },
  { keyword: '饿了么', label: '饿', color: '#1677FF' },
  { keyword: '小红书', label: '红', color: '#FF2442' },
  { keyword: '百度', label: '百', color: '#315EFB' },
  { keyword: '高德', label: '高', color: '#1677FF' },
  { keyword: '58', label: '58', color: '#19A463' },
];

const platformLogoMeta = (platform: string) => {
  const matched = PLATFORM_LOGOS.find((item) => platform.includes(item.keyword));
  if (matched) return matched;
  return {
    label: platform.trim().slice(0, 1) || '账',
    color: '#64748B',
  };
};

const DEVICE_COLUMNS: AssetColumnConfig[] = [
  { id: 'deviceCode', label: '设备编号', width: 130 },
  { id: 'deviceName', label: '设备名称', width: 130 },
  { id: 'brandModel', label: '品牌型号', width: 130 },
  { id: 'imei', label: 'IMEI', width: 130 },
  { id: 'simType', label: '手机号', width: 190 },
  { id: 'accountCount', label: '账号数', width: 100 },
  { id: 'department', label: '所属部门', width: 130 },
  { id: 'owner', label: '负责人', width: 120 },
  { id: 'currentUser', label: '当前使用人', width: 130 },
  { id: 'status', label: '状态', width: 100 },
];
const DEFAULT_DEVICE_VISIBLE_COLUMN_IDS = DEVICE_COLUMNS.map((column) => column.id);

const PHONE_COLUMNS: AssetColumnConfig[] = [
  { id: 'phoneNumber', label: '手机号', width: 140 },
  { id: 'realName', label: '实名信息', width: 110 },
  { id: 'operator', label: '运营商', width: 100 },
  { id: 'attributionLocation', label: '归属地', width: 110 },
  { id: 'device', label: '所属设备', width: 180 },
  { id: 'accounts', label: '关联账号', width: 150 },
  { id: 'slotType', label: '卡槽', width: 100 },
  { id: 'packageName', label: '套餐', width: 140 },
  { id: 'monthlyFee', label: '月费用', width: 110 },
  { id: 'department', label: '所属部门', width: 130 },
  { id: 'owner', label: '负责人', width: 120 },
  { id: 'currentUser', label: '当前使用人', width: 130 },
  { id: 'status', label: '状态', width: 110 },
];
const DEFAULT_PHONE_VISIBLE_COLUMN_IDS = PHONE_COLUMNS.map((column) => column.id);

const ACCOUNT_COLUMNS: AssetColumnConfig[] = [
  { id: 'accountNo', label: '账号编号', width: 130 },
  { id: 'platform', label: '平台', width: 120 },
  { id: 'accountName', label: '账号名称', width: 150 },
  { id: 'loginAccount', label: '登录账号', width: 150 },
  { id: 'realName', label: '实名信息', width: 110 },
  { id: 'phone', label: '绑定手机号', width: 150 },
  { id: 'device', label: '所属设备', width: 180 },
  { id: 'owner', label: '负责人', width: 120 },
  { id: 'permissionStatus', label: '权限状态', width: 130 },
];
const DEFAULT_ACCOUNT_VISIBLE_COLUMN_IDS = ACCOUNT_COLUMNS.map((column) => column.id);

const ASSET_VIEW_STORAGE_KEYS: Record<ConfigurableAssetTab, string> = {
  devices: 'aaos_asset_devices_table_view_v4',
  phones: 'aaos_asset_phones_table_view_v6',
  accounts: 'aaos_asset_accounts_table_view_v6',
};

const ASSET_VIEW_TITLES: Record<ConfigurableAssetTab, string> = {
  devices: '设备资产视图设置',
  phones: '手机号资产视图设置',
  accounts: '互联网账号视图设置',
};

const ASSET_VIEW_DESCRIPTIONS: Record<ConfigurableAssetTab, string> = {
  devices: '设置设备资产表格的显示字段、字段顺序和固定列。',
  phones: '设置手机号资产表格的显示字段、字段顺序和固定列。',
  accounts: '设置互联网账号表格的显示字段、字段顺序和固定列。',
};

const assetTableContainerSx = {
  ...moduleTablePaperSx,
  borderRadius: '6px 6px 0 0',
  overflowX: 'auto',
  bgcolor: '#fff',
};

const assetTableSx = {
  ...moduleTableSx,
  '& .MuiTableHead-root .MuiTableCell-root': {
    ...moduleTableSx['& .MuiTableHead-root .MuiTableCell-root'],
    height: 44,
    px: 1.5,
    py: 1,
    whiteSpace: 'nowrap',
    lineHeight: 1.35,
  },
  '& .MuiTableBody-root .MuiTableCell-root': {
    height: 52,
    px: 1.5,
    py: 1,
    verticalAlign: 'middle',
  },
  '& .MuiTableCell-root': {
    ...moduleTableSx['& .MuiTableCell-root'],
    color: moduleTokens.ink,
  },
  '& .MuiTableRow-root:last-of-type .MuiTableCell-root': {
    borderBottom: 0,
  },
};

const assetActionCellSx = {
  width: ASSET_ACTION_COLUMN_WIDTH,
  minWidth: ASSET_ACTION_COLUMN_WIDTH,
  textAlign: 'center',
  bgcolor: '#fff',
};

const assetPaginationSx = {
  border: `1px solid ${moduleTokens.line}`,
  borderTop: 0,
  borderRadius: '0 0 6px 6px',
  bgcolor: '#fff',
  color: moduleTokens.ink,
  '& .MuiTablePagination-toolbar': {
    minHeight: 48,
    px: 2,
  },
  '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
    my: 0,
    color: moduleTokens.ink,
  },
  '& .MuiTablePagination-actions': {
    ml: 1,
  },
};

const renderAssetEmptyRow = (colSpan: number, label: string) => (
  <TableRow>
    <TableCell colSpan={colSpan} align="center" sx={{ py: 6, color: '#9ca3af' }}>
      {label}
    </TableCell>
  </TableRow>
);

const ASSET_CREATE_LABELS: Record<ConfigurableAssetTab, string> = {
  devices: '新增设备',
  phones: '新增手机号',
  accounts: '新增账号',
};

const ASSET_CREATE_TYPES: Record<ConfigurableAssetTab, AssetFormType> = {
  devices: 'device',
  phones: 'phone',
  accounts: 'account',
};

function isConfigurableAssetTab(tab: AssetTab): tab is ConfigurableAssetTab {
  return CONFIGURABLE_ASSET_TABS.has(tab);
}

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

const emptyImportState: AssetImportState = {
  open: false,
  type: 'devices',
  csvText: '',
  fileName: '',
  result: null,
};

const emptyMatrixPublishForm: MatrixPublishFormState = {
  open: false,
  values: {
    title: '',
    videoUrl: '',
    videoFileName: '',
    copywriting: '',
    remark: '',
    dueAt: '',
    accountIds: [],
  },
};

function getTabFromSearch(value: string | null): AssetTab {
  return value && VALID_TABS.has(value as AssetTab) ? (value as AssetTab) : 'overview';
}

function toneSx(level?: 'low' | 'medium' | 'high') {
  if (level === 'high') return { color: shell.red, bgcolor: '#FEF3F2', borderColor: '#FECACA' };
  if (level === 'medium') return { color: shell.amber, bgcolor: '#FFFAEB', borderColor: '#FEDF89' };
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
  if (value?.includes('待') || value?.includes('异常')) return toneSx('medium');
  if (value?.includes('注销') || value?.includes('停用') || value?.includes('回收')) return toneSx('high');
  return toneSx('low');
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

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

const AssetManagement: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = getTabFromSearch(searchParams.get('tab'));
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('');
  const [permissionStatus, setPermissionStatus] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const { alert: showSystemAlert, dialog: feedbackDialog } = useAppFeedback();
  const showFeedback = (message: React.ReactNode, title = '提示') => {
    void showSystemAlert(message, title);
  };
  const [platformOptions, setPlatformOptions] = useState<string[]>([]);
  const [lookupDevices, setLookupDevices] = useState<AssetDevice[]>([]);
  const [lookupPhones, setLookupPhones] = useState<AssetPhoneNumber[]>([]);
  const [lookupAccounts, setLookupAccounts] = useState<AssetInternetAccount[]>([]);
  const [lookupUsers, setLookupUsers] = useState<User[]>([]);
  const [lookupDepartments, setLookupDepartments] = useState<Department[]>([]);
  const [formState, setFormState] = useState<AssetFormState>(emptyForm);
  const [importState, setImportState] = useState<AssetImportState>(emptyImportState);
  const [matrixForm, setMatrixForm] = useState<MatrixPublishFormState>(emptyMatrixPublishForm);
  const [deleteTarget, setDeleteTarget] = useState<AssetDeleteTarget>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [viewSettingsOpen, setViewSettingsOpen] = useState<ConfigurableAssetTab | null>(null);
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const currentUser = useAuthStore((state) => state.currentUser);
  const {
    dashboard,
    devices,
    phones,
    accounts,
    matrixPublishTasks,
    matrixPublishStats,
    logs,
    offboardingTasks,
    detail,
    pagination,
    loading,
    fetchDashboard,
    fetchDevices,
    fetchPhones,
    fetchAccounts,
    fetchMatrixPublishTasks,
    fetchMatrixPublishStats,
    fetchLogs,
    fetchOffboardingTasks,
    fetchDetail,
    createDevice,
    updateDevice,
    deleteDevice,
    createPhone,
    updatePhone,
    deletePhone,
    createAccount,
    updateAccount,
    deleteAccount,
    createMatrixPublishTask,
    completeMatrixPublishTarget,
    completeOffboardingTask,
    revealSensitiveField,
    importAssetsFromCsv,
    clearDetail,
  } = useAssetStore();
  const canRevealSensitive = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_SENSITIVE_VIEW, 'read');
  const canImportExport = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_IMPORT_EXPORT, 'write');
  const canEditAssets = hasPermission(currentUser, PERMISSION_KEYS.ASSETS, 'write');
  const canDeleteAssets = canEditAssets || hasPermission(currentUser, PERMISSION_KEYS.ASSETS, 'delete');
  const canHandleOffboarding = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_OFFBOARDING, 'write');
  const canManageMatrixPublish = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH, 'write');
  const visibleTabs = useMemo(
    () => ASSET_TABS.filter((tab) => hasPermission(currentUser, tab.permissionKey)),
    [currentUser],
  );
  const activeTabVisible = visibleTabs.some((tab) => tab.value === activeTab);

  const filters = useMemo<AssetFilters>(() => ({
    search,
    platform,
    permissionStatus,
    status,
    page: page + 1,
    pageSize: rowsPerPage,
  }), [page, permissionStatus, platform, rowsPerPage, search, status]);

  const deviceById = useMemo(() => new Map(lookupDevices.map((device) => [device.id, device])), [lookupDevices]);
  const phoneById = useMemo(() => new Map(lookupPhones.map((phone) => [phone.id, phone])), [lookupPhones]);
  const userById = useMemo(() => new Map(lookupUsers.map((user) => [user.id, user])), [lookupUsers]);
  const departmentById = useMemo(() => new Map(lookupDepartments.map((department) => [department.id, department])), [lookupDepartments]);
  const phonesByDeviceId = useMemo(() => {
    const map = new Map<string, AssetPhoneNumber[]>();
    lookupPhones.forEach((phone) => {
      const list = map.get(phone.deviceId) || [];
      list.push(phone);
      map.set(phone.deviceId, list);
    });
    map.forEach((list) => list.sort((a, b) => a.slotType.localeCompare(b.slotType, 'zh-CN')));
    return map;
  }, [lookupPhones]);
  const accountsByPhoneId = useMemo(() => {
    const map = new Map<string, AssetInternetAccount[]>();
    lookupAccounts.forEach((account) => {
      if (!account.phoneId) return;
      const list = map.get(account.phoneId) || [];
      list.push(account);
      map.set(account.phoneId, list);
    });
    map.forEach((list) => list.sort((a, b) => a.platform.localeCompare(b.platform, 'zh-CN')));
    return map;
  }, [lookupAccounts]);
  const accountsByDeviceId = useMemo(() => {
    const map = new Map<string, AssetInternetAccount[]>();
    lookupAccounts.forEach((account) => {
      const phone = phoneById.get(account.phoneId || '');
      if (!phone?.deviceId) return;
      const list = map.get(phone.deviceId) || [];
      list.push(account);
      map.set(phone.deviceId, list);
    });
    return map;
  }, [lookupAccounts, phoneById]);
  const assetRelationshipSummary = useMemo(() => {
    const boundPhoneCount = lookupPhones.filter((phone) => Boolean(deviceById.get(phone.deviceId))).length;
    const boundAccountCount = lookupAccounts.filter((account) => Boolean(account.phoneId && phoneById.get(account.phoneId))).length;
    const devicesWithPhones = lookupDevices.filter((device) => (phonesByDeviceId.get(device.id) || []).length).length;
    return {
      devicesWithPhones,
      boundPhoneCount,
      unboundPhoneCount: Math.max(0, lookupPhones.length - boundPhoneCount),
      boundAccountCount,
      unboundAccountCount: Math.max(0, lookupAccounts.length - boundAccountCount),
    };
  }, [deviceById, lookupAccounts, lookupDevices, lookupPhones, phoneById, phonesByDeviceId]);
  const deviceView = useTableViewConfig(ASSET_VIEW_STORAGE_KEYS.devices, DEVICE_COLUMNS, DEFAULT_DEVICE_VISIBLE_COLUMN_IDS);
  const phoneView = useTableViewConfig(ASSET_VIEW_STORAGE_KEYS.phones, PHONE_COLUMNS, DEFAULT_PHONE_VISIBLE_COLUMN_IDS);
  const accountView = useTableViewConfig(ASSET_VIEW_STORAGE_KEYS.accounts, ACCOUNT_COLUMNS, DEFAULT_ACCOUNT_VISIBLE_COLUMN_IDS);
  const activeAssetView = viewSettingsOpen === 'devices'
    ? { columns: DEVICE_COLUMNS, view: deviceView }
    : viewSettingsOpen === 'phones'
      ? { columns: PHONE_COLUMNS, view: phoneView }
      : viewSettingsOpen === 'accounts'
        ? { columns: ACCOUNT_COLUMNS, view: accountView }
        : null;

  useEffect(() => {
    fetchDashboard();
    assetApi.fetchDevices({ pageSize: ASSET_LOOKUP_PAGE_SIZE }).then((res) => {
      if (res.code === 0) setLookupDevices(res.data.items);
    });
    assetApi.fetchPhoneNumbers({ pageSize: ASSET_LOOKUP_PAGE_SIZE }).then((res) => {
      if (res.code === 0) setLookupPhones(res.data.items);
    });
    assetApi.fetchInternetAccounts({ pageSize: ASSET_LOOKUP_PAGE_SIZE }).then((res) => {
      if (res.code === 0) setLookupAccounts(res.data.items);
    });
    settingsApi.fetchUsers({ isActive: true, employmentStatus: 'active' }).then((res) => {
      if (res.code === 0) setLookupUsers(res.data);
    });
    departmentApi.getDepartments({ isActive: true }).then((res) => {
      if (res.code === 0) setLookupDepartments(res.data);
    });
    setPlatformOptions(assetApi.getAccountPlatformOptions());
  }, [fetchDashboard]);

  useEffect(() => {
    setDetailDialogOpen(false);
    setViewSettingsOpen(null);
    clearDetail();
    setPage(0);
  }, [activeTab, clearDetail]);

  useEffect(() => {
    if (!visibleTabs.length || activeTabVisible) return;
    setSearchParams({ tab: visibleTabs[0].value });
  }, [activeTabVisible, setSearchParams, visibleTabs]);

  useEffect(() => {
    if (!activeTabVisible) return;
    if (activeTab === 'overview') {
      fetchDashboard();
      return;
    }
    if (activeTab === 'devices') fetchDevices(filters);
    if (activeTab === 'phones') fetchPhones(filters);
    if (activeTab === 'accounts') fetchAccounts(filters);
    if (activeTab === 'matrix') {
      fetchMatrixPublishTasks(filters);
      fetchMatrixPublishStats();
    }
    if (activeTab === 'logs') fetchLogs(filters);
    if (activeTab === 'offboarding') fetchOffboardingTasks(filters);
  }, [activeTab, activeTabVisible, fetchAccounts, fetchDashboard, fetchDevices, fetchLogs, fetchMatrixPublishStats, fetchMatrixPublishTasks, fetchOffboardingTasks, fetchPhones, filters]);

  useEffect(() => {
    setPage(0);
  }, [search, platform, permissionStatus, status]);

  const handleTabChange = (_: React.SyntheticEvent, value: AssetTab) => {
    setPlatform('');
    setPermissionStatus('');
    setStatus('');
    setPage(0);
    setSearchParams({ tab: value });
  };

  const refreshLookupData = async () => {
    const [deviceRes, phoneRes, accountRes] = await Promise.all([
      assetApi.fetchDevices({ pageSize: ASSET_LOOKUP_PAGE_SIZE }),
      assetApi.fetchPhoneNumbers({ pageSize: ASSET_LOOKUP_PAGE_SIZE }),
      assetApi.fetchInternetAccounts({ pageSize: ASSET_LOOKUP_PAGE_SIZE }),
    ]);
    if (deviceRes.code === 0) setLookupDevices(deviceRes.data.items);
    if (phoneRes.code === 0) setLookupPhones(phoneRes.data.items);
    if (accountRes.code === 0) setLookupAccounts(accountRes.data.items);
    const [userRes, departmentRes] = await Promise.all([
      settingsApi.fetchUsers({ isActive: true, employmentStatus: 'active' }),
      departmentApi.getDepartments({ isActive: true }),
    ]);
    if (userRes.code === 0) setLookupUsers(userRes.data);
    if (departmentRes.code === 0) setLookupDepartments(departmentRes.data);
    setPlatformOptions(assetApi.getAccountPlatformOptions());
  };

  const refreshActiveTab = async () => {
    await fetchDashboard();
    if (activeTab === 'devices') await fetchDevices(filters);
    if (activeTab === 'phones') await fetchPhones(filters);
    if (activeTab === 'accounts') await fetchAccounts(filters);
    if (activeTab === 'matrix') {
      await fetchMatrixPublishTasks(filters);
      await fetchMatrixPublishStats();
    }
    if (activeTab === 'logs') await fetchLogs(filters);
    if (activeTab === 'offboarding') await fetchOffboardingTasks(filters);
    await refreshLookupData();
  };

  const defaultCreateType = (): AssetFormType => {
    if (activeTab === 'devices') return 'device';
    if (activeTab === 'phones') return 'phone';
    return 'account';
  };

  const defaultImportType = (): AssetImportType => {
    if (activeTab === 'phones') return 'phones';
    if (activeTab === 'accounts') return 'accounts';
    return 'devices';
  };

  const openImportDialog = () => {
    if (!canImportExport) {
      showFeedback('当前账号没有资产导入导出权限');
      return;
    }
    setImportState({ ...emptyImportState, open: true, type: defaultImportType() });
  };

  const closeImportDialog = () => setImportState(emptyImportState);

  const openMatrixPublishDialog = () => {
    if (!canManageMatrixPublish) {
      showFeedback('当前账号没有矩阵发布权限');
      return;
    }
    setMatrixForm({
      open: true,
      values: {
        ...emptyMatrixPublishForm.values,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      },
    });
  };

  const closeMatrixPublishDialog = () => setMatrixForm(emptyMatrixPublishForm);

  const updateMatrixPublishValue = <K extends keyof AssetMatrixPublishTaskInput>(
    key: K,
    value: AssetMatrixPublishTaskInput[K],
  ) => {
    setMatrixForm((current) => ({
      ...current,
      values: {
        ...current.values,
        [key]: value,
      },
    }));
  };

  const submitMatrixPublishTask = async () => {
    if (!canManageMatrixPublish) {
      showFeedback('当前账号没有矩阵发布权限');
      return;
    }
    const result = await createMatrixPublishTask({
      ...matrixForm.values,
      dueAt: matrixForm.values.dueAt ? new Date(matrixForm.values.dueAt).toISOString() : '',
    });
    if (!result) {
      showFeedback(useAssetStore.getState().error || '创建矩阵发布任务失败');
      return;
    }
    closeMatrixPublishDialog();
    showFeedback('矩阵发布任务已创建');
    await refreshActiveTab();
  };

  const handleCompleteMatrixTarget = async (taskId: string, accountId: string) => {
    if (!canManageMatrixPublish) {
      showFeedback('当前账号没有矩阵发布权限');
      return;
    }
    const result = await completeMatrixPublishTarget(taskId, accountId);
    if (!result) {
      showFeedback(useAssetStore.getState().error || '标记完成失败');
      return;
    }
    showFeedback('账号发布任务已完成');
    await refreshActiveTab();
  };

  const updateImportType = (type: AssetImportType) => {
    setImportState((current) => ({ ...current, type, result: null }));
  };

  const downloadImportTemplate = () => {
    if (!canImportExport) {
      showFeedback('当前账号没有资产导入导出权限');
      return;
    }
    const labelMap: Record<AssetImportType, string> = {
      devices: '设备资产',
      phones: '手机号资产',
      accounts: '互联网账号',
    };
    downloadCsv(`资产管理-${labelMap[importState.type]}导入模板.csv`, assetApi.getImportTemplateCsv(importState.type));
  };

  const downloadFailedRows = () => {
    if (!canImportExport) {
      showFeedback('当前账号没有资产导入导出权限');
      return;
    }
    if (!importState.result?.failedRows.length) return;
    downloadCsv(`资产管理-导入失败行-${new Date().toISOString().slice(0, 10)}.csv`, assetApi.getImportFailureCsv(importState.result));
  };

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setImportState((current) => ({
      ...current,
      csvText: text,
      fileName: file.name,
      result: null,
    }));
    event.target.value = '';
  };

  const submitImport = async () => {
    if (!canImportExport) {
      showFeedback('当前账号没有资产导入导出权限');
      return;
    }
    if (!importState.csvText.trim()) {
      showFeedback('请先选择或粘贴 CSV 内容');
      return;
    }
    const result = await importAssetsFromCsv(importState.type, importState.csvText);
    if (!result) {
      showFeedback(useAssetStore.getState().error || '导入失败');
      return;
    }
    setImportState((current) => ({ ...current, result }));
    showFeedback(`导入完成：成功${result.successCount}行，失败${result.failedCount}行`);
    await refreshActiveTab();
  };

  const updateFormValue = (field: string, value: string) => {
    setFormState((current) => ({
      ...current,
      values: { ...current.values, [field]: value },
    }));
  };

  const buildUserFields = (prefix: 'owner' | 'currentUser', userId: string) => {
    const user = userById.get(userId);
    return {
      [`${prefix}Id`]: user?.id || '',
      [prefix]: user?.name || '',
    };
  };

  const buildDepartmentFields = (departmentId?: string) => {
    const department = departmentId ? departmentById.get(departmentId) : undefined;
    return {
      departmentId: department?.id || '',
      department: department?.name || '',
    };
  };

  const updateAssetUser = (prefix: 'owner' | 'currentUser', userId: string) => {
    const user = userById.get(userId);
    setFormState((current) => {
      const nextValues = {
        ...current.values,
        ...buildUserFields(prefix, userId),
      };
      if (user?.departmentId && (prefix === 'currentUser' || !nextValues.departmentId)) {
        Object.assign(nextValues, buildDepartmentFields(user.departmentId));
      }
      return { ...current, values: nextValues };
    });
  };

  const updateAssetDepartment = (departmentId: string) => {
    setFormState((current) => ({
      ...current,
      values: {
        ...current.values,
        ...buildDepartmentFields(departmentId),
      },
    }));
  };

  const updatePhoneNumberValue = (value: string) => {
    const inferredOperator = assetApi.inferPhoneOperator(value);
    const inferredLocation = assetApi.inferPhoneAttributionLocation(value);
    setFormState((current) => ({
      ...current,
      values: (() => {
        const previousInferredLocation = assetApi.inferPhoneAttributionLocation(current.values.phoneNumber);
        const shouldUpdateLocation = !current.values.attributionLocation || current.values.attributionLocation === previousInferredLocation;
        return {
          ...current.values,
          phoneNumber: value,
          operator: inferredOperator === '未知' && current.values.operator ? current.values.operator : inferredOperator,
          attributionLocation: shouldUpdateLocation ? inferredLocation : current.values.attributionLocation,
        };
      })(),
    }));
  };

  const openCreateForm = (type: AssetFormType = defaultCreateType()) => {
    if (!canEditAssets) {
      showFeedback('当前账号没有编辑资产权限');
      return;
    }
    const defaults: Record<AssetFormType, Record<string, string>> = {
      device: {
        simType: '双卡',
        ownerSubject: '公司',
        status: '正常',
        monthlyCost: '0',
      },
      phone: {
        operator: '',
        attributionLocation: '',
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
      },
    };
    setFormState({ open: true, type, mode: 'create', values: defaults[type] });
  };

  const normalizeAssetFormValues = (values: Record<string, string>) => {
    const owner = userById.get(values.ownerId) || lookupUsers.find((user) => user.name === values.owner);
    const currentAssetUser = userById.get(values.currentUserId) || lookupUsers.find((user) => user.name === values.currentUser);
    const department = departmentById.get(values.departmentId)
      || lookupDepartments.find((item) => item.name === values.department)
      || (currentAssetUser?.departmentId ? departmentById.get(currentAssetUser.departmentId) : undefined)
      || (owner?.departmentId ? departmentById.get(owner.departmentId) : undefined);
    return {
      ...values,
      ownerId: owner?.id || values.ownerId || '',
      owner: owner?.name || values.owner || '',
      currentUserId: currentAssetUser?.id || values.currentUserId || '',
      currentUser: currentAssetUser?.name || values.currentUser || '',
      departmentId: department?.id || values.departmentId || '',
      department: department?.name || values.department || '',
    };
  };

  const openEditForm = (type: AssetFormType, item: AssetDevice | AssetPhoneNumber | AssetInternetAccount) => {
    if (!canEditAssets) {
      showFeedback('当前账号没有编辑资产权限');
      return;
    }
    const values = Object.entries(item).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = String(value ?? '');
      return acc;
    }, {});
    setFormState({ open: true, type, mode: 'edit', id: item.id, values: normalizeAssetFormValues(values) });
  };

  const closeForm = () => setFormState(emptyForm);

  const submitForm = async () => {
    if (!canEditAssets) {
      showFeedback('当前账号没有编辑资产权限');
      return;
    }
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
      showFeedback(useAssetStore.getState().error || '保存失败');
      return;
    }
    closeForm();
    showFeedback(formState.mode === 'edit' ? '资产资料已更新' : '资产已新增');
    await refreshActiveTab();
  };

  const openDeleteConfirm = (type: AssetFormType, id: string, label: string) => {
    if (!canDeleteAssets) {
      showFeedback('当前账号没有删除资产权限');
      return;
    }
    setDeleteTarget({ type, id, label });
  };

  const closeDeleteConfirm = () => setDeleteTarget(null);

  const submitDelete = async () => {
    if (!deleteTarget) return;
    if (!canDeleteAssets) {
      showFeedback('当前账号没有删除资产权限');
      closeDeleteConfirm();
      return;
    }
    const deleted = deleteTarget.type === 'device'
      ? await deleteDevice(deleteTarget.id)
      : deleteTarget.type === 'phone'
        ? await deletePhone(deleteTarget.id)
        : await deleteAccount(deleteTarget.id);
    if (!deleted) {
      showFeedback(useAssetStore.getState().error || '删除失败');
      return;
    }
    if (
      detail?.device?.id === deleteTarget.id
      || detail?.phone?.id === deleteTarget.id
      || detail?.account?.id === deleteTarget.id
    ) {
      closeDetailDialog();
    }
    closeDeleteConfirm();
    showFeedback('资产已删除');
    await refreshActiveTab();
  };

  const openDetail = (type: AssetType, id: string) => {
    setDetailDialogOpen(true);
    fetchDetail(type, id);
  };

  const openAccountPhoneDetail = (phoneId?: string) => {
    if (!phoneId) return;
    setDetailDialogOpen(true);
    fetchDetail('phone', phoneId);
  };

  const closeDetailDialog = () => {
    setDetailDialogOpen(false);
    clearDetail();
  };

  const revealedKey = (type: AssetType, id: string, field: AssetSensitiveField) => `${type}:${id}:${field}`;

  const revealField = async (type: AssetType, id: string, field: AssetSensitiveField) => {
    if (!canRevealSensitive) {
      showFeedback('当前账号没有查看敏感字段权限');
      return;
    }
    const result = await revealSensitiveField(type, id, field);
    if (!result) {
      showFeedback(useAssetStore.getState().error || '查看失败');
      return;
    }
    setRevealedValues((current) => ({
      ...current,
      [revealedKey(type, id, field)]: result.value,
    }));
    showFeedback('已显示明文');
  };

  const handleCompleteOffboarding = async (taskId: string) => {
    if (!canHandleOffboarding) {
      showFeedback('当前账号没有处理离职回收权限');
      return;
    }
    await completeOffboardingTask(taskId);
    await refreshActiveTab();
  };

  const exportCurrentRows = () => {
    if (!canImportExport) {
      showFeedback('当前账号没有资产导入导出权限');
      return;
    }
    const rowMap: Record<AssetTab, Array<Record<string, unknown>>> = {
      overview: [],
      devices: devices.map((device) => ({
        设备编号: device.deviceCode,
        设备名称: device.deviceName,
        品牌型号: device.brandModel,
        IMEI: device.imeiMasked,
        手机号: (phonesByDeviceId.get(device.id) || []).map((phone) => `${phone.slotType}:${phone.phoneNumberMasked}`).join(' / '),
        账号数: (accountsByDeviceId.get(device.id) || []).length,
        所属部门: device.department,
        负责人: device.owner,
        当前使用人: device.currentUser,
        状态: device.status,
      })),
      phones: phones.map((phone) => {
        const device = deviceById.get(phone.deviceId);
        return {
          手机号: phone.phoneNumberMasked,
          实名信息: phone.realNameMasked || '',
          运营商: phone.operator,
          归属地: phone.attributionLocation || '',
          所属设备: device?.deviceCode || '-',
          关联账号: (accountsByPhoneId.get(phone.id) || []).map((account) => `${account.platform}/${account.accountName}`).join(' / '),
          卡槽: phone.slotType,
          套餐: phone.packageName,
          月费用: phone.monthlyFee,
          所属部门: phone.department || '',
          负责人: phone.owner,
          当前使用人: phone.currentUser || '',
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
          实名信息: account.realNameMasked || '',
          绑定手机号: phone?.phoneNumberMasked || '未绑定',
          所属设备: device?.deviceCode || '-',
          负责人: account.owner,
          权限状态: account.permissionStatus,
        };
      }),
      matrix: matrixPublishTasks.flatMap((task) => task.targets.map((target) => ({
        任务: task.title,
        平台: target.platform,
        账号: target.accountName,
        执行人: target.assignee,
        部门: target.department,
        设备: target.deviceCode || '',
        截止时间: task.dueAt,
        状态: target.status,
        完成时间: target.completedAt || '',
      }))),
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
      showFeedback('当前工作区暂无可导出的数据');
      return;
    }
    downloadCsv(`资产管理-${ASSET_TABS.find((tab) => tab.value === activeTab)?.label || '台账'}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const renderOverview = () => {
    const cards = [
      { label: '设备资产', value: dashboard?.deviceCount || 0, tone: shell.blue },
      { label: '手机号资产', value: dashboard?.phoneCount || 0, tone: shell.green },
      { label: '互联网账号', value: dashboard?.accountCount || 0, tone: shell.ink },
      { label: '离职待回收', value: dashboard?.offboardingCount || 0, tone: shell.amber },
      { label: '月度费用', value: formatCurrency(dashboard?.monthlyCost || 0), tone: shell.blue },
    ];
    const relationCards = [
      { label: '已挂手机号的设备', value: assetRelationshipSummary.devicesWithPhones, tab: 'devices' as AssetTab },
      { label: '已绑定设备的手机号', value: assetRelationshipSummary.boundPhoneCount, tab: 'phones' as AssetTab },
      { label: '已绑定手机号的账号', value: assetRelationshipSummary.boundAccountCount, tab: 'accounts' as AssetTab },
      { label: '未绑定手机号的账号', value: assetRelationshipSummary.unboundAccountCount, tab: 'accounts' as AssetTab, tone: assetRelationshipSummary.unboundAccountCount ? shell.amber : shell.green },
    ];
    const deviceRelationRows = lookupDevices.slice(0, 6).map((device) => {
      const linkedPhones = phonesByDeviceId.get(device.id) || [];
      const linkedAccounts = accountsByDeviceId.get(device.id) || [];
      return { device, linkedPhones, linkedAccounts };
    });
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
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '360px minmax(0, 1fr)' }, gap: 2 }}>
          <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 2 }}>
            <Typography sx={{ fontWeight: 950, mb: 0.5 }}>关系总览</Typography>
            <Typography variant="body2" sx={{ color: shell.muted, mb: 1.5 }}>
              设备通过手机号连接互联网账号。
            </Typography>
            <Box sx={{ display: 'grid', gap: 1 }}>
              {relationCards.map((card) => (
                <Box
                  key={card.label}
                  component="button"
                  type="button"
                  onClick={() => setSearchParams({ tab: card.tab })}
                  sx={{
                    border: `1px solid ${shell.softLine}`,
                    borderRadius: 1,
                    bgcolor: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 1.25,
                    py: 1,
                    cursor: 'pointer',
                    textAlign: 'left',
                    '&:hover': { borderColor: shell.blue, bgcolor: '#F8FBFF' },
                  }}
                >
                  <Typography sx={{ color: shell.muted, fontWeight: 800 }}>{card.label}</Typography>
                  <Typography sx={{ color: card.tone || shell.ink, fontSize: 20, fontWeight: 950 }}>{card.value}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
          <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ mb: 1.5 }}>
              <Box>
                <Typography sx={{ fontWeight: 950 }}>设备关系链</Typography>
                <Typography variant="body2" sx={{ color: shell.muted }}>从设备往下看手机号，再看到绑定的互联网账号。</Typography>
              </Box>
              <Button size="small" endIcon={<ChevronRightIcon />} onClick={() => setSearchParams({ tab: 'devices' })}>
                查看设备
              </Button>
            </Stack>
            <Box sx={{ display: 'grid', gap: 0.75 }}>
              {deviceRelationRows.map(({ device, linkedPhones, linkedAccounts }) => (
                <Box
                  key={device.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1.2fr 1.4fr 0.8fr' },
                    gap: 1,
                    alignItems: 'center',
                    borderTop: `1px solid ${shell.softLine}`,
                    pt: 0.9,
                  }}
                >
                  <Stack spacing={0.15} sx={{ minWidth: 0 }}>
                    {renderRelationLink(`${device.deviceCode} / ${device.deviceName}`, () => openDetail('device', device.id))}
                    <Typography variant="caption" sx={{ color: shell.muted }}>{device.owner || '未填负责人'} / {device.department || '未填部门'}</Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {linkedPhones.length ? linkedPhones.map((phone) => (
                      <Chip
                        key={phone.id}
                        size="small"
                        label={`${phone.slotType} ${phone.phoneNumberMasked}`}
                        onClick={() => openDetail('phone', phone.id)}
                        sx={{ ...chipSx(toneSx('low')), cursor: 'pointer' }}
                      />
                    )) : (
                      <Typography variant="body2" sx={{ color: shell.muted }}>未绑定手机号</Typography>
                    )}
                  </Stack>
                  <Typography sx={{ color: linkedAccounts.length ? shell.ink : shell.muted, fontWeight: 850 }}>
                    {linkedAccounts.length ? `${linkedAccounts.length}个互联网账号` : '暂无账号'}
                  </Typography>
                </Box>
              ))}
              {!deviceRelationRows.length ? (
                <Typography sx={{ color: shell.muted, textAlign: 'center', py: 3 }}>暂无设备关系数据</Typography>
              ) : null}
            </Box>
          </Paper>
        </Box>
      </Box>
    );
  };

  const renderToolbar = () => {
    if (activeTab === 'overview') return null;
    const searchPlaceholderMap: Partial<Record<AssetTab, string>> = {
      devices: '搜索设备编号、设备名称、IMEI、负责人',
      phones: '搜索手机号、实名信息、归属地、所属设备',
      accounts: '搜索平台、账号名称、实名信息、绑定手机号',
      matrix: '搜索任务、账号、执行人',
      logs: '搜索操作、对象、操作人',
      offboarding: '搜索员工、资产名称',
    };
    const statusOptionsMap: Partial<Record<AssetTab, string[]>> = {
      devices: ['正常', '使用中', '闲置', '已注销'],
      phones: ['使用中', '闲置', '已停用'],
      accounts: ['使用中', '正常', '闲置', '异常', '已注销'],
      matrix: ['pending', 'completed'],
      offboarding: ['待回收', '已回收'],
    };
    return (
      <ModuleToolbar>
        <TextField
          size="small"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={searchPlaceholderMap[activeTab] || '搜索资产'}
          sx={{ minWidth: 280 }}
        />
        {(activeTab === 'accounts' || activeTab === 'matrix') && (
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
        {statusOptionsMap[activeTab] && (
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>{activeTab === 'matrix' || activeTab === 'offboarding' ? '处理状态' : '状态'}</InputLabel>
            <Select value={status} label={activeTab === 'matrix' || activeTab === 'offboarding' ? '处理状态' : '状态'} onChange={(event) => setStatus(event.target.value)}>
              <MenuItem value="">全部</MenuItem>
              {statusOptionsMap[activeTab]?.map((item) => (
                <MenuItem key={item} value={item}>{item}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </ModuleToolbar>
    );
  };

  const getTableMinWidth = (columns: AssetColumnConfig[]) => (
    columns.reduce((sum, column) => sum + column.width, 0) + ASSET_ACTION_COLUMN_WIDTH
  );

  const getFrozenColumnSx = (columns: AssetColumnConfig[], columnIndex: number, frozenColumnCount: number, isHeader = false) => {
    const width = columns[columnIndex]?.width || 120;
    const base = {
      width,
      minWidth: width,
      maxWidth: width,
    };
    if (columnIndex >= frozenColumnCount) return base;
    const left = columns.slice(0, columnIndex).reduce((sum, column) => sum + column.width, 0);
    return {
      ...base,
      position: 'sticky',
      left,
      zIndex: isHeader ? 4 : 3,
      bgcolor: isHeader ? '#F1F5F9' : '#fff',
      boxShadow: columnIndex === frozenColumnCount - 1 ? `1px 0 0 ${shell.softLine}` : 'none',
    };
  };

  const relationLinkSx = {
    border: 0,
    bgcolor: 'transparent',
    color: shell.tableLink,
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 13,
    fontWeight: 900,
    lineHeight: 1.35,
    p: 0,
    textAlign: 'left',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    '&:hover': { textDecoration: 'underline' },
  };

  const renderRelationLink = (label: string, onClick: () => void) => (
    <Box
      component="button"
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      sx={relationLinkSx}
    >
      {label}
    </Box>
  );

  const renderDeviceCell = (device: AssetDevice, columnId: string) => {
    switch (columnId) {
      case 'deviceCode':
        return <Box sx={{ color: shell.tableLink, fontWeight: 900 }}>{device.deviceCode}</Box>;
      case 'deviceName':
        return device.deviceName;
      case 'brandModel':
        return device.brandModel;
      case 'imei':
        return device.imeiMasked;
      case 'simType':
        return renderDevicePhones(device);
      case 'accountCount': {
        const count = (accountsByDeviceId.get(device.id) || []).length;
        return count ? `${count}个账号` : '-';
      }
      case 'department':
        return device.department;
      case 'owner':
        return device.owner || '-';
      case 'currentUser':
        return device.currentUser || '-';
      case 'status':
        return <Chip size="small" label={device.status} sx={chipSx(statusTone(device.status))} />;
      default:
        return null;
    }
  };

  const renderDevicePhones = (device: AssetDevice) => {
    const linkedPhones = phonesByDeviceId.get(device.id) || [];
    const expectedSlots = device.simType === '双卡' ? ['卡槽1', '卡槽2'] : ['卡槽1'];
    const slotLabelMap: Record<string, string> = {
      卡槽1: 'A',
      卡槽2: 'B',
    };
    return (
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0, whiteSpace: 'nowrap' }}>
        {expectedSlots.map((slot, index) => {
          const phone = linkedPhones.find((item) => item.slotType === slot);
          const slotLabel = slotLabelMap[slot] || slot;
          const prefix = `${slotLabel} `;
          if (!phone) {
            return (
              <React.Fragment key={slot}>
                {index > 0 ? <Typography variant="caption" sx={{ color: shell.muted }}>/</Typography> : null}
                <Typography variant="caption" sx={{ color: shell.muted, lineHeight: 1.3 }}>
                  {prefix}未绑定
                </Typography>
              </React.Fragment>
            );
          }
          return (
            <React.Fragment key={phone.id}>
              {index > 0 ? <Typography variant="caption" sx={{ color: shell.muted }}>/</Typography> : null}
              <Tooltip title="查看手机号资料">
                {renderRelationLink(`${prefix}${phone.phoneNumberMasked}`, () => openDetail('phone', phone.id))}
              </Tooltip>
            </React.Fragment>
          );
        })}
      </Stack>
    );
  };

  const phoneSlotOptionsForDevice = (deviceId?: string) => {
    const device = deviceId ? deviceById.get(deviceId) : undefined;
    return device?.simType === '双卡' ? ['卡槽1', '卡槽2'] : ['卡槽1'];
  };

  const renderPhoneCell = (phone: AssetPhoneNumber, columnId: string) => {
    const device = deviceById.get(phone.deviceId);
    switch (columnId) {
      case 'phoneNumber':
        return <Box sx={{ color: shell.tableLink, fontWeight: 900 }}>{phone.phoneNumberMasked}</Box>;
      case 'realName':
        return phone.realNameMasked || '-';
      case 'operator':
        return phone.operator;
      case 'attributionLocation':
        return phone.attributionLocation || '-';
      case 'device':
        return device
          ? renderRelationLink(`${device.deviceCode} / ${device.deviceName}`, () => openDetail('device', device.id))
          : <Box sx={{ color: shell.muted }}>-</Box>;
      case 'accounts': {
        const linkedAccounts = accountsByPhoneId.get(phone.id) || [];
        if (!linkedAccounts.length) return <Box sx={{ color: shell.muted }}>-</Box>;
        const firstAccount = linkedAccounts[0];
        return (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
            {renderRelationLink(`${firstAccount.platform} / ${firstAccount.accountName}`, () => openDetail('account', firstAccount.id))}
            {linkedAccounts.length > 1 ? (
              <Typography variant="caption" sx={{ color: shell.muted, fontWeight: 800, whiteSpace: 'nowrap' }}>
                +{linkedAccounts.length - 1}
              </Typography>
            ) : null}
          </Stack>
        );
      }
      case 'slotType':
        return phone.slotType;
      case 'packageName':
        return phone.packageName;
      case 'monthlyFee':
        return formatCurrency(phone.monthlyFee);
      case 'department':
        return phone.department || '-';
      case 'owner':
        return phone.owner || '-';
      case 'currentUser':
        return phone.currentUser || '-';
      case 'status':
        return <Chip size="small" label={phone.status} sx={chipSx(statusTone(phone.status))} />;
      default:
        return null;
    }
  };

  const renderAccountCell = (account: AssetInternetAccount, columnId: string) => {
    const phone = phoneById.get(account.phoneId || '');
    const device = deviceById.get(phone?.deviceId || '');
    switch (columnId) {
      case 'accountNo':
        return <Box sx={{ color: shell.tableLink, fontWeight: 900 }}>{account.accountNo}</Box>;
      case 'platform':
        return account.platform;
      case 'accountName':
        return account.accountName;
      case 'loginAccount':
        return account.loginAccountMasked;
      case 'realName':
        return account.realNameMasked || '-';
      case 'phone':
        return phone
          ? renderRelationLink(phone.phoneNumberMasked, () => openAccountPhoneDetail(account.phoneId))
          : <Box sx={{ color: shell.amber, fontWeight: 800 }}>未绑定</Box>;
      case 'device':
        return device
          ? renderRelationLink(`${device.deviceCode} / ${device.deviceName}`, () => openDetail('device', device.id))
          : <Box sx={{ color: shell.muted }}>-</Box>;
      case 'owner':
        return account.owner || '-';
      case 'permissionStatus':
        return <Chip size="small" label={account.permissionStatus} sx={chipSx(statusTone(account.permissionStatus))} />;
      default:
        return null;
    }
  };

  const renderDevicesTable = () => (
    <>
    <TableContainer component={Paper} elevation={0} sx={assetTableContainerSx}>
      <Table size="small" sx={{ ...assetTableSx, tableLayout: 'fixed', minWidth: getTableMinWidth(deviceView.visibleColumns) }}>
        <TableHead>
          <TableRow>
            {deviceView.visibleColumns.map((column, columnIndex) => (
              <TableCell key={column.id} sx={getFrozenColumnSx(deviceView.visibleColumns, columnIndex, deviceView.frozenColumnCount, true)}>
                {column.label}
              </TableCell>
            ))}
            <TableCell align="center" sx={assetActionCellSx}>操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {devices.map((device) => (
            <TableRow hover key={device.id} onClick={() => openDetail('device', device.id)} sx={{ cursor: 'pointer' }}>
              {deviceView.visibleColumns.map((column, columnIndex) => (
                <TableCell key={column.id} sx={getFrozenColumnSx(deviceView.visibleColumns, columnIndex, deviceView.frozenColumnCount)}>
                  {renderDeviceCell(device, column.id)}
                </TableCell>
              ))}
              <TableCell align="center" sx={assetActionCellSx}>
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
                <Tooltip title="查看详情"><IconButton size="small"><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
                {canEditAssets ? (
                  <Tooltip title="编辑资料">
                    <IconButton size="small" onClick={(event) => { event.stopPropagation(); openEditForm('device', device); }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : null}
                {canDeleteAssets ? (
                  <Tooltip title="删除">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(event) => {
                        event.stopPropagation();
                        openDeleteConfirm('device', device.id, deviceDeleteLabel(device));
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : null}
                </Box>
              </TableCell>
            </TableRow>
          ))}
          {devices.length === 0 && renderAssetEmptyRow(deviceView.visibleColumns.length + 1, '暂无设备资产数据')}
        </TableBody>
      </Table>
    </TableContainer>
    {renderPagination()}
    </>
  );

  const renderPhonesTable = () => (
    <>
    <TableContainer component={Paper} elevation={0} sx={assetTableContainerSx}>
      <Table size="small" sx={{ ...assetTableSx, tableLayout: 'fixed', minWidth: getTableMinWidth(phoneView.visibleColumns) }}>
        <TableHead>
          <TableRow>
            {phoneView.visibleColumns.map((column, columnIndex) => (
              <TableCell key={column.id} sx={getFrozenColumnSx(phoneView.visibleColumns, columnIndex, phoneView.frozenColumnCount, true)}>
                {column.label}
              </TableCell>
            ))}
            <TableCell align="center" sx={assetActionCellSx}>操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {phones.map((phone) => (
              <TableRow hover key={phone.id} onClick={() => openDetail('phone', phone.id)} sx={{ cursor: 'pointer' }}>
                {phoneView.visibleColumns.map((column, columnIndex) => (
                  <TableCell key={column.id} sx={getFrozenColumnSx(phoneView.visibleColumns, columnIndex, phoneView.frozenColumnCount)}>
                    {renderPhoneCell(phone, column.id)}
                  </TableCell>
                ))}
                <TableCell align="center" sx={assetActionCellSx}>
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
                  <Tooltip title="查看详情"><IconButton size="small"><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
                  {canEditAssets ? (
                    <Tooltip title="编辑资料">
                      <IconButton size="small" onClick={(event) => { event.stopPropagation(); openEditForm('phone', phone); }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                  {canDeleteAssets ? (
                    <Tooltip title="删除">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(event) => {
                          event.stopPropagation();
                          openDeleteConfirm('phone', phone.id, phoneDeleteLabel(phone));
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                  </Box>
                </TableCell>
              </TableRow>
          ))}
          {phones.length === 0 && renderAssetEmptyRow(phoneView.visibleColumns.length + 1, '暂无手机号资产数据')}
        </TableBody>
      </Table>
    </TableContainer>
    {renderPagination()}
    </>
  );

  const renderAccountsTable = () => (
    <>
    <TableContainer component={Paper} elevation={0} sx={assetTableContainerSx}>
      <Table size="small" sx={{ ...assetTableSx, tableLayout: 'fixed', minWidth: getTableMinWidth(accountView.visibleColumns) }}>
        <TableHead>
          <TableRow>
            {accountView.visibleColumns.map((column, columnIndex) => (
              <TableCell key={column.id} sx={getFrozenColumnSx(accountView.visibleColumns, columnIndex, accountView.frozenColumnCount, true)}>
                {column.label}
              </TableCell>
            ))}
            <TableCell align="center" sx={assetActionCellSx}>操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {accounts.map((account) => (
              <TableRow hover key={account.id} onClick={() => openDetail('account', account.id)} sx={{ cursor: 'pointer' }}>
                {accountView.visibleColumns.map((column, columnIndex) => (
                  <TableCell key={column.id} sx={getFrozenColumnSx(accountView.visibleColumns, columnIndex, accountView.frozenColumnCount)}>
                    {renderAccountCell(account, column.id)}
                  </TableCell>
                ))}
                <TableCell align="center" sx={assetActionCellSx}>
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
                  <Tooltip title="查看详情"><IconButton size="small"><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
                  {canEditAssets ? <Tooltip title="编辑资料"><IconButton size="small" onClick={(event) => { event.stopPropagation(); openEditForm('account', account); }}><EditIcon fontSize="small" /></IconButton></Tooltip> : null}
                  {canDeleteAssets ? (
                    <Tooltip title="删除">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(event) => {
                          event.stopPropagation();
                          openDeleteConfirm('account', account.id, accountDeleteLabel(account));
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                  </Box>
                </TableCell>
              </TableRow>
          ))}
          {accounts.length === 0 && renderAssetEmptyRow(accountView.visibleColumns.length + 1, '暂无互联网账号数据')}
        </TableBody>
      </Table>
    </TableContainer>
    {renderPagination()}
    </>
  );

  const renderLogsTable = () => (
    <>
    <TableContainer component={Paper} elevation={0} sx={assetTableContainerSx}>
      <Table size="small" sx={assetTableSx}>
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
          {logs.length === 0 && renderAssetEmptyRow(6, '暂无操作日志数据')}
        </TableBody>
      </Table>
    </TableContainer>
    {renderPagination()}
    </>
  );

  const renderMatrixPublishTable = () => {
    const rows = matrixPublishTasks.flatMap((task) => task.targets.map((target) => ({
      task,
      target,
      overdue: target.status !== 'completed' && new Date(task.dueAt).getTime() < Date.now(),
    })));
    const statusLabel = (value: string) => (value === 'completed' ? '已完成' : '待发布');
    return (
      <>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1.25 }}>
          {[
            { label: '目标账号', value: matrixPublishStats?.totalTargets || 0 },
            { label: '已完成', value: matrixPublishStats?.completedTargets || 0 },
            { label: '未完成', value: matrixPublishStats?.pendingTargets || 0 },
            { label: '逾期账号', value: matrixPublishStats?.overdueTargets || 0, danger: true },
            { label: '完成率', value: `${matrixPublishStats?.completionRate || 0}%` },
          ].map((item) => (
            <Paper
              key={item.label}
              elevation={0}
              sx={{
                flex: 1,
                border: `1px solid ${item.danger ? '#FECACA' : shell.softLine}`,
                borderRadius: 1,
                p: 1.25,
                bgcolor: item.danger ? '#FEF3F2' : '#fff',
              }}
            >
              <Typography variant="caption" sx={{ color: shell.muted, fontWeight: 800 }}>{item.label}</Typography>
              <Typography sx={{ color: item.danger ? shell.red : shell.ink, fontSize: 22, fontWeight: 950 }}>{item.value}</Typography>
            </Paper>
          ))}
        </Stack>
        <TableContainer component={Paper} elevation={0} sx={assetTableContainerSx}>
          <Table size="small" sx={{ ...assetTableSx, minWidth: 1120 }}>
            <TableHead>
              <TableRow>
                {['任务', '平台', '账号', '执行人', '部门', '设备', '截止时间', '状态', '素材/文案', '操作'].map((column) => <TableCell key={column}>{column}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ task, target, overdue }) => (
                <TableRow
                  hover
                  key={`${task.id}-${target.accountId}`}
                  sx={{ bgcolor: overdue ? '#FEF3F2' : undefined }}
                >
                  <TableCell sx={{ fontWeight: 900 }}>{task.title}</TableCell>
                  <TableCell>{target.platform}</TableCell>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography sx={{ fontWeight: 850, color: shell.ink }}>{target.accountName}</Typography>
                      <Typography variant="caption" sx={{ color: shell.muted }}>{target.accountNo}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>{target.assignee}</TableCell>
                  <TableCell>{target.department || '-'}</TableCell>
                  <TableCell>{target.deviceCode ? `${target.deviceCode} / ${target.deviceName || '-'}` : '-'}</TableCell>
                  <TableCell sx={{ color: overdue ? shell.red : shell.ink, fontWeight: overdue ? 900 : 700 }}>
                    {formatDate(task.dueAt, 'yyyy-MM-dd HH:mm')}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={overdue ? '已逾期' : statusLabel(target.status)}
                      sx={chipSx(overdue ? toneSx('high') : toneSx(target.status === 'completed' ? 'low' : 'medium'))}
                    />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      <Button size="small" variant="outlined" disabled={!task.videoUrl} onClick={() => copyText(task.videoUrl, '视频链接')}>链接</Button>
                      <Button size="small" variant="outlined" disabled={!task.copywriting} onClick={() => copyText(task.copywriting, '发布文案')}>文案</Button>
                      {task.remark ? <Tooltip title={task.remark}><InfoOutlinedIcon sx={{ color: shell.muted, fontSize: 18, mt: 0.7 }} /></Tooltip> : null}
                    </Stack>
                  </TableCell>
                  <TableCell align="center" sx={{ minWidth: 120 }}>
                    {canManageMatrixPublish ? (
                      <Button
                        size="small"
                        variant="contained"
                        disabled={target.status === 'completed'}
                        onClick={() => handleCompleteMatrixTarget(task.id, target.accountId)}
                      >
                        点完成
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && renderAssetEmptyRow(10, '暂无矩阵发布任务')}
            </TableBody>
          </Table>
        </TableContainer>
        {renderPagination()}
      </>
    );
  };

  const renderOffboardingTable = () => (
    <>
    <TableContainer component={Paper} elevation={0} sx={assetTableContainerSx}>
      <Table size="small" sx={assetTableSx}>
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
              <TableCell align="center" sx={{ minWidth: 140 }}>
                {canHandleOffboarding ? (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={task.status === '已回收'}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleCompleteOffboarding(task.id);
                    }}
                  >
                    标记已回收
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
          {offboardingTasks.length === 0 && renderAssetEmptyRow(8, '暂无离职回收数据')}
        </TableBody>
      </Table>
    </TableContainer>
    {renderPagination()}
    </>
  );

  const renderPagination = () => (
    <TablePagination
      component="div"
      count={pagination.total}
      page={Math.max(0, pagination.page - 1)}
      rowsPerPageOptions={[10, 20, 50, 100]}
      onPageChange={(_, nextPage) => setPage(nextPage)}
      rowsPerPage={pagination.pageSize}
      onRowsPerPageChange={(event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
      }}
      labelRowsPerPage="每页条数"
      labelDisplayedRows={formatPaginationRows}
      sx={assetPaginationSx}
    />
  );

  const renderActiveTable = () => {
    if (activeTab === 'overview') return renderOverview();
    if (activeTab === 'devices') return renderDevicesTable();
    if (activeTab === 'phones') return renderPhonesTable();
    if (activeTab === 'accounts') return renderAccountsTable();
    if (activeTab === 'matrix') return renderMatrixPublishTable();
    if (activeTab === 'logs') return renderLogsTable();
    return renderOffboardingTable();
  };

  const copyText = async (text: string | undefined, label = '内容') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showFeedback(`${label}已复制`);
    } catch {
      showFeedback('复制失败，请手动选择复制');
    }
  };

  const primaryDevice = detail?.device || detail?.relatedDevice;
  const primaryPhone = detail?.phone || detail?.relatedPhones[0];

  const detailCardSx = {
    border: `1px solid ${shell.softLine}`,
    borderRadius: 1,
    bgcolor: '#fff',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.03)',
  };

  const detailTableSx = {
    '& .MuiTableCell-root': {
      borderColor: shell.softLine,
      color: shell.ink,
      fontSize: 13,
      py: 0.75,
    },
    '& .MuiTableHead-root .MuiTableCell-root': {
      bgcolor: '#F8FAFC',
      color: shell.muted,
      fontWeight: 900,
    },
    '& .MuiTableBody-root .MuiTableRow-root:last-of-type .MuiTableCell-root': {
      borderBottom: 0,
    },
  };

  const renderPlatformLogo = (account: AssetInternetAccount) => {
    const logo = platformLogoMeta(account.platform);
    return (
      <Avatar
        variant="rounded"
        sx={{
          width: 34,
          height: 34,
          bgcolor: logo.color,
          color: '#fff',
          fontSize: 13,
          fontWeight: 900,
          borderRadius: 1,
        }}
      >
        {logo.label}
      </Avatar>
    );
  };

  const renderCopyButton = (text: string | undefined, label: string) => (
    <Tooltip title={`复制${label}`}>
      <IconButton size="small" onClick={() => copyText(text, label)} sx={{ color: shell.muted }}>
        <ContentCopyIcon sx={{ fontSize: 15 }} />
      </IconButton>
    </Tooltip>
  );

  const renderSensitiveInline = (
    type: AssetType,
    id: string,
    field: AssetSensitiveField,
    maskedValue?: string,
  ) => {
    const key = revealedKey(type, id, field);
    const value = revealedValues[key] || maskedValue || '-';
    return (
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
        <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</Box>
        {canRevealSensitive && !revealedValues[key] ? (
          <Tooltip title="查看明文">
            <IconButton size="small" onClick={() => revealField(type, id, field)} sx={{ color: shell.tableLink }}>
              <VisibilityIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>
    );
  };

  const renderInfoRows = (rows: Array<{ label: string; value: React.ReactNode }>, columns = 2) => (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: `repeat(${columns}, minmax(0, 1fr))` },
        columnGap: 2.5,
        rowGap: 1.05,
      }}
    >
      {rows.map((row) => (
        <Box key={row.label} sx={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', alignItems: 'center', minWidth: 0 }}>
          <Typography variant="body2" sx={{ color: shell.muted }}>{row.label}</Typography>
          <Box sx={{ color: shell.ink, fontWeight: 800, minWidth: 0 }}>{row.value}</Box>
        </Box>
      ))}
    </Box>
  );

  const renderDetailCard = (title: string, children: React.ReactNode, extra?: React.ReactNode) => (
    <Paper elevation={0} sx={{ ...detailCardSx, p: 1.75 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ mb: 1.5 }}>
        <Typography sx={{ color: shell.ink, fontWeight: 950 }}>{title}</Typography>
        {extra}
      </Stack>
      {children}
    </Paper>
  );

  const renderCompactTable = (
    columns: string[],
    rows: React.ReactNode[][],
    emptyText: string,
  ) => (
    <TableContainer sx={{ border: `1px solid ${shell.softLine}`, borderRadius: 1, bgcolor: '#fff' }}>
      <Table size="small" sx={detailTableSx}>
        <TableHead>
          <TableRow>
            {columns.map((column) => <TableCell key={column}>{column}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length ? rows.map((row, rowIndex) => (
            <TableRow key={rowIndex} hover>
              {row.map((cell, cellIndex) => <TableCell key={cellIndex}>{cell}</TableCell>)}
            </TableRow>
          )) : (
            <TableRow>
              <TableCell colSpan={columns.length} sx={{ color: shell.muted, textAlign: 'center' }}>{emptyText}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderLinkButton = (label: string, onClick: () => void) => (
    <Button size="small" endIcon={<ChevronRightIcon />} onClick={onClick} sx={{ fontWeight: 900 }}>
      {label}
    </Button>
  );

  const renderDeviceBasicCard = (device: AssetDevice) => (
    renderDetailCard('设备基本信息', (
      renderInfoRows([
        { label: '设备名称', value: device.deviceName },
        { label: '设备编号', value: <Stack direction="row" alignItems="center" spacing={0.5}>{device.deviceCode}{renderCopyButton(device.deviceCode, '设备编号')}</Stack> },
        { label: '品牌/型号', value: device.brandModel },
        { label: 'IMEI', value: renderSensitiveInline('device', device.id, 'imei', device.imeiMasked) },
        { label: 'SIM 类型', value: device.simType },
        { label: '状态', value: <Chip size="small" label={device.status} sx={chipSx(statusTone(device.status))} /> },
        { label: '所属主体', value: device.ownerSubject },
        { label: '所属部门', value: device.department || '-' },
        { label: '负责人', value: device.owner || '-' },
        { label: '当前使用人', value: device.currentUser || '-' },
        { label: '月费用', value: formatCurrency(device.monthlyCost) },
        { label: '更新时间', value: formatDate(device.updatedAt, 'yyyy-MM-dd') },
        { label: '备注', value: device.remark || '-' },
      ], 2)
    ))
  );

  const renderPhoneBasicCard = (phone: AssetPhoneNumber) => (
    renderDetailCard('手机号基本信息', (
      renderInfoRows([
        { label: '手机号', value: renderSensitiveInline('phone', phone.id, 'phoneNumber', phone.phoneNumberMasked) },
        { label: '实名信息', value: renderSensitiveInline('phone', phone.id, 'phoneRealName', phone.realNameMasked || '-') },
        { label: '运营商', value: phone.operator },
        { label: '归属地', value: phone.attributionLocation || '-' },
        { label: '卡类型', value: '实体 SIM 卡' },
        {
          label: '所属设备',
          value: primaryDevice
            ? renderAssetNameLink(`${primaryDevice.deviceCode} / ${primaryDevice.deviceName}`, () => openDetail('device', primaryDevice.id))
            : '-',
        },
        { label: 'SIM 卡槽', value: phone.slotType },
        { label: '套餐', value: phone.packageName || '-' },
        { label: '月费用', value: formatCurrency(phone.monthlyFee) },
        { label: '所属部门', value: phone.department || primaryDevice?.department || '-' },
        { label: '负责人', value: phone.owner || '-' },
        { label: '当前使用人', value: phone.currentUser || primaryDevice?.currentUser || '-' },
        { label: '卡状态', value: <Chip size="small" label={phone.status} sx={chipSx(statusTone(phone.status))} /> },
        { label: '更新时间', value: formatDate(phone.updatedAt, 'yyyy-MM-dd') },
      ], 2)
    ))
  );

  const renderAccountBasicCard = (account: AssetInternetAccount) => (
    renderDetailCard('账号基本信息', (
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Stack spacing={1} alignItems="center" sx={{ width: 96, flexShrink: 0 }}>
          <Avatar
            variant="rounded"
            sx={{
              width: 72,
              height: 72,
              bgcolor: platformLogoMeta(account.platform).color,
              color: '#fff',
              borderRadius: 1.5,
              fontSize: 28,
              fontWeight: 950,
            }}
          >
            {platformLogoMeta(account.platform).label}
          </Avatar>
          <Chip size="small" label={account.accountStatus} sx={chipSx(statusTone(account.accountStatus))} />
        </Stack>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.2 }}>
            <Typography sx={{ color: shell.ink, fontSize: 22, fontWeight: 950 }}>{account.platform} - {account.accountName}</Typography>
            <Chip size="small" label={account.permissionStatus} sx={chipSx(statusTone(account.permissionStatus))} />
          </Stack>
          {renderInfoRows([
            { label: '账号编号', value: <Stack direction="row" alignItems="center" spacing={0.5}>{account.accountNo}{renderCopyButton(account.accountNo, '账号编号')}</Stack> },
            { label: '平台', value: account.platform },
            { label: '所属主体', value: account.ownerSubject },
            { label: '登录账号', value: renderSensitiveInline('account', account.id, 'loginAccount', account.loginAccountMasked) },
            { label: '实名信息', value: renderSensitiveInline('account', account.id, 'accountRealName', account.realNameMasked || '-') },
            {
              label: '绑定手机号',
              value: primaryPhone
                ? renderAssetNameLink(primaryPhone.phoneNumberMasked, () => openDetail('phone', primaryPhone.id))
                : '-',
            },
            {
              label: '所属设备',
              value: primaryDevice
                ? renderAssetNameLink(`${primaryDevice.deviceCode} / ${primaryDevice.deviceName}`, () => openDetail('device', primaryDevice.id))
                : '-',
            },
            { label: '绑定邮箱', value: renderSensitiveInline('account', account.id, 'boundEmail', account.boundEmailMasked || account.boundEmail || '-') },
            { label: '权限状态', value: <Chip size="small" label={account.permissionStatus} sx={chipSx(statusTone(account.permissionStatus))} /> },
            { label: '账号状态', value: <Chip size="small" label={account.accountStatus} sx={chipSx(statusTone(account.accountStatus))} /> },
            { label: '所属部门', value: account.department || '-' },
            { label: '负责人', value: account.owner || '-' },
            { label: '当前使用人', value: account.currentUser || '-' },
            { label: '用途', value: account.purpose || '-' },
          ], 2)}
        </Box>
      </Stack>
    ))
  );

  const renderAssetNameLink = (label: string, onClick: () => void) => (
    <Button
      size="small"
      onClick={onClick}
      sx={{ px: 0, minWidth: 0, color: shell.tableLink, fontWeight: 900, justifyContent: 'flex-start' }}
    >
      {label}
    </Button>
  );

  const renderRelatedAssetsSection = () => {
    if (!detail) return null;
    const phoneRows = detail.relatedPhones.map((phone) => [
      phone.slotType,
      renderAssetNameLink(phone.phoneNumberMasked, () => openDetail('phone', phone.id)),
      phone.realNameMasked || '-',
      phone.operator,
      phone.packageName || '-',
      <Chip size="small" label={phone.status} sx={chipSx(statusTone(phone.status))} />,
    ]);
    const accountRows = detail.relatedAccounts.map((account) => [
      <Stack direction="row" spacing={1} alignItems="center">{renderPlatformLogo(account)}<Box>{account.platform}</Box></Stack>,
      renderAssetNameLink(account.accountName, () => openDetail('account', account.id)),
      account.loginAccountMasked,
      account.realNameMasked || '-',
      detail.relatedPhones.find((phone) => phone.id === account.phoneId)?.phoneNumberMasked || '-',
      <Chip size="small" label={account.permissionStatus} sx={chipSx(statusTone(account.permissionStatus))} />,
    ]);
    if (detail.type === 'device') {
      return renderDetailCard('关联资产', (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1.25 }}>
          {renderCompactTable(['卡槽', '手机号', '实名信息', '运营商', '套餐', '状态'], phoneRows, '暂无绑定手机号')}
          {renderCompactTable(['平台', '账号名称', '登录账号', '实名信息', '手机号', '状态'], accountRows, '暂无互联网账号')}
        </Box>
      ));
    }

    if (detail.type === 'phone') {
      return renderDetailCard('关联资产', (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1.25 }}>
          {renderCompactTable(['平台', '账号名称', '登录账号', '实名信息', '手机号', '状态'], accountRows, '暂无绑定互联网账号')}
        </Box>
      ));
    }

    return null;
  };

  const renderDetailBody = () => {
    if (!detail) return null;
    const basicCard = detail.device ? renderDeviceBasicCard(detail.device) : detail.phone ? renderPhoneBasicCard(detail.phone) : detail.account ? renderAccountBasicCard(detail.account) : null;
    if (detail.type === 'device') {
      return (
        <Stack spacing={1.25}>
          {basicCard}
          {renderRelatedAssetsSection()}
        </Stack>
      );
    }
    return (
      <Stack spacing={1.25}>
        {basicCard}
        {renderRelatedAssetsSection()}
      </Stack>
    );
  };

  const renderDetailDialog = () => {
    if (activeTab === 'overview' || activeTab === 'logs' || activeTab === 'matrix') return null;
    const detailTitleMap: Record<AssetType, string> = {
      device: '查看设备资料',
      phone: '查看手机号资料',
      account: '查看互联网账号资料',
    };
    return (
      <Dialog
        open={detailDialogOpen}
        onClose={closeDetailDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 1, overflow: 'hidden', maxWidth: 960 } }}
      >
        <DialogTitle sx={{ p: 0 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between" sx={{ px: 2.25, py: 1.5, borderBottom: `1px solid ${shell.softLine}` }}>
            <Typography sx={{ color: shell.ink, fontSize: 20, fontWeight: 950 }}>{detail ? detailTitleMap[detail.type] : '查看资产资料'}</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              {canEditAssets && detail ? (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<EditIcon />}
                  onClick={() => {
                    if (detail.device) openEditForm('device', detail.device);
                    else if (detail.phone) openEditForm('phone', detail.phone);
                    else if (detail.account) openEditForm('account', detail.account);
                  }}
                  sx={{ fontWeight: 900, px: 2 }}
                >
                  编辑资料
                </Button>
              ) : null}
              <IconButton onClick={closeDetailDialog} sx={{ color: shell.muted }}>
                <CloseIcon />
              </IconButton>
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#FBFCFE', p: 1.5 }}>
          {!detail ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography sx={{ color: shell.muted, fontWeight: 800 }}>正在加载资产详情</Typography>
            </Box>
          ) : renderDetailBody()}
        </DialogContent>
        <DialogActions sx={{ px: 2.25, py: 1.5, borderTop: `1px solid ${shell.softLine}` }}>
          <Button onClick={closeDetailDialog}>关闭</Button>
        </DialogActions>
      </Dialog>
    );
  };

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
      InputLabelProps={props.type === 'date' ? { shrink: true } : undefined}
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

  const renderUserSelectField = (prefix: 'owner' | 'currentUser', label: string) => {
    const idField = `${prefix}Id`;
    const nameValue = formState.values[prefix] || '';
    return (
      <FormControl size="small" fullWidth>
        <InputLabel shrink>{label}</InputLabel>
        <Select
          label={label}
          value={formState.values[idField] || ''}
          displayEmpty
          onChange={(event) => updateAssetUser(prefix, event.target.value)}
          renderValue={(selected) => {
            const user = userById.get(String(selected));
            return user?.name || nameValue || '未选择';
          }}
        >
          <MenuItem value="">未选择</MenuItem>
          {nameValue && !formState.values[idField] ? (
            <MenuItem value="" disabled>{nameValue}（未匹配员工）</MenuItem>
          ) : null}
          {lookupUsers.map((user) => {
            const department = departmentById.get(user.departmentId || '');
            return (
              <MenuItem key={user.id} value={user.id}>
                {user.name} / {department?.name || '未分配部门'}
              </MenuItem>
            );
          })}
        </Select>
      </FormControl>
    );
  };

  const renderDepartmentSelectField = () => (
    <FormControl size="small" fullWidth>
      <InputLabel shrink>所属部门</InputLabel>
      <Select
        label="所属部门"
        value={formState.values.departmentId || ''}
        displayEmpty
        onChange={(event) => updateAssetDepartment(event.target.value)}
        renderValue={(selected) => {
          const department = departmentById.get(String(selected));
          return department?.name || formState.values.department || '未选择';
        }}
      >
        <MenuItem value="">未选择</MenuItem>
        {formState.values.department && !formState.values.departmentId ? (
          <MenuItem value="" disabled>{formState.values.department}（未匹配部门）</MenuItem>
        ) : null}
        {lookupDepartments.map((department) => (
          <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>
        ))}
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
      {renderDepartmentSelectField()}
      {renderUserSelectField('owner', '负责人')}
      {renderUserSelectField('currentUser', '当前使用人')}
      {renderSelectField('status', '状态', ['正常', '使用中', '闲置', '已注销'], { required: true })}
      {renderTextField('monthlyCost', '月费用', { type: 'number' })}
      {renderTextField('remark', '备注', { multiline: true })}
    </>
  );

  const renderPhoneFields = () => (
    <>
      <TextField
        size="small"
        label="完整手机号"
        value={formState.values.phoneNumber || ''}
        onChange={(event) => updatePhoneNumberValue(event.target.value)}
        required
        fullWidth
      />
      {renderTextField('realName', '实名信息')}
      {renderSelectField('operator', '运营商', ['移动', '联通', '电信', '广电', '未知'])}
      {renderTextField('attributionLocation', '归属地')}
      <FormControl size="small" fullWidth required>
        <InputLabel>所属设备</InputLabel>
        <Select
          label="所属设备"
          value={formState.values.deviceId || ''}
          onChange={(event) => {
            const nextDeviceId = event.target.value;
            const nextSlots = phoneSlotOptionsForDevice(nextDeviceId);
            setFormState((current) => ({
              ...current,
              values: {
                ...current.values,
                deviceId: nextDeviceId,
                slotType: nextSlots.includes(current.values.slotType) ? current.values.slotType : nextSlots[0],
              },
            }));
          }}
        >
          <MenuItem value="">未选择</MenuItem>
          {lookupDevices.map((device) => (
            <MenuItem key={device.id} value={device.id}>{device.deviceCode} / {device.deviceName} / {device.simType}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl size="small" fullWidth required disabled={!formState.values.deviceId}>
        <InputLabel>SIM卡槽</InputLabel>
        <Select
          label="SIM卡槽"
          value={phoneSlotOptionsForDevice(formState.values.deviceId).includes(formState.values.slotType) ? formState.values.slotType : ''}
          onChange={(event) => updateFormValue('slotType', event.target.value)}
        >
          {phoneSlotOptionsForDevice(formState.values.deviceId).map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
        </Select>
        <Typography variant="caption" sx={{ color: shell.muted, mt: 0.5 }}>
          单卡设备仅支持卡槽1，双卡设备支持卡槽1/卡槽2。
        </Typography>
      </FormControl>
      {renderTextField('packageName', '套餐')}
      {renderTextField('monthlyFee', '月费用', { type: 'number' })}
      {renderDepartmentSelectField()}
      {renderUserSelectField('owner', '负责人')}
      {renderUserSelectField('currentUser', '当前使用人')}
      {renderSelectField('status', '状态', ['使用中', '闲置', '已停用'], { required: true })}
    </>
  );

  const renderAccountFields = () => (
    <>
      {renderTextField('platform', '平台', { required: true })}
      {renderTextField('accountName', '账号名称', { required: true })}
      {renderTextField('loginAccount', '登录账号', { required: true })}
      {renderTextField('realName', '实名信息')}
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
      {renderDepartmentSelectField()}
      {renderUserSelectField('owner', '负责人')}
      {renderUserSelectField('currentUser', '当前使用人')}
      {renderSelectField('permissionStatus', '权限状态', ['正常', '离职待回收', '已回收'], { required: true })}
      {renderSelectField('accountStatus', '账号状态', ['使用中', '正常', '闲置', '异常', '已注销'], { required: true })}
      {renderTextField('purpose', '用途', { multiline: true })}
    </>
  );

  const renderImportDialog = () => {
    const labelMap: Record<AssetImportType, string> = {
      devices: '设备资产',
      phones: '手机号资产',
      accounts: '互联网账号',
    };
    const failedRows = importState.result?.failedRows || [];
    return (
      <Dialog open={importState.open && canImportExport} onClose={closeImportDialog} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 900, pb: 1 }}>
          导入资产
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: '#FBFCFE' }}>
          <Box sx={{ display: 'grid', gap: 1.5, pt: 0.5 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', md: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>导入类型</InputLabel>
                <Select
                  label="导入类型"
                  value={importState.type}
                  onChange={(event) => updateImportType(event.target.value as AssetImportType)}
                >
                  <MenuItem value="devices">设备资产</MenuItem>
                  <MenuItem value="phones">手机号资产</MenuItem>
                  <MenuItem value="accounts">互联网账号</MenuItem>
                </Select>
              </FormControl>
              <Button variant="outlined" startIcon={<FileDownloadIcon />} disabled={!canImportExport} onClick={downloadImportTemplate}>
                下载模板
              </Button>
              <Button variant="outlined" startIcon={<FileUploadIcon />} disabled={!canImportExport} component="label">
                选择CSV
                <input hidden accept=".csv,text/csv" type="file" onChange={handleImportFileChange} />
              </Button>
              {importState.fileName ? (
                <Typography variant="body2" sx={{ color: shell.muted, fontWeight: 700 }}>
                  {importState.fileName}
                </Typography>
              ) : null}
            </Stack>
            <TextField
              value={importState.csvText}
              onChange={(event) => setImportState((current) => ({ ...current, csvText: event.target.value, result: null }))}
              placeholder={`粘贴${labelMap[importState.type]}CSV内容，或先下载模板填写后上传`}
              multiline
              minRows={8}
              fullWidth
              sx={{ bgcolor: '#fff' }}
            />
            {importState.result ? (
              <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 1.5, bgcolor: '#fff' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
                  <Stack direction="row" spacing={1}>
                    <Chip size="small" label={`总行数 ${importState.result.totalRows}`} />
                    <Chip size="small" label={`成功 ${importState.result.successCount}`} sx={chipSx(toneSx('low'))} />
                    <Chip size="small" label={`失败 ${importState.result.failedCount}`} sx={chipSx(toneSx(importState.result.failedCount ? 'medium' : 'low'))} />
                  </Stack>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<FileDownloadIcon />}
                    disabled={!failedRows.length || !canImportExport}
                    onClick={downloadFailedRows}
                  >
                    下载失败行
                  </Button>
                </Stack>
                {failedRows.length ? (
                  <TableContainer sx={{ mt: 1.25, maxHeight: 240 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>行号</TableCell>
                          <TableCell>失败原因</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {failedRows.slice(0, 8).map((row) => (
                          <TableRow key={`${row.rowNumber}-${row.reason}`}>
                            <TableCell>{row.rowNumber}</TableCell>
                            <TableCell>{row.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : null}
              </Paper>
            ) : null}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={closeImportDialog}>关闭</Button>
          <Button variant="contained" disabled={loading || !canImportExport} onClick={submitImport}>
            开始导入
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  const renderMatrixPublishDialog = () => (
    <Dialog open={matrixForm.open && canManageMatrixPublish} onClose={closeMatrixPublishDialog} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 900, pb: 1 }}>
        创建矩阵发布任务
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: '#FBFCFE' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, pt: 0.5 }}>
          <TextField
            size="small"
            label="任务标题"
            value={matrixForm.values.title}
            onChange={(event) => updateMatrixPublishValue('title', event.target.value)}
            required
            fullWidth
          />
          <TextField
            size="small"
            label="截止时间"
            type="datetime-local"
            value={matrixForm.values.dueAt}
            onChange={(event) => updateMatrixPublishValue('dueAt', event.target.value)}
            InputLabelProps={{ shrink: true }}
            required
            fullWidth
          />
          <TextField
            size="small"
            label="网盘/视频链接"
            value={matrixForm.values.videoUrl || ''}
            onChange={(event) => updateMatrixPublishValue('videoUrl', event.target.value)}
            fullWidth
          />
          <Button variant="outlined" component="label" sx={{ justifySelf: 'start', height: 40 }}>
            选择视频文件
            <input
              hidden
              type="file"
              accept="video/*"
              onChange={async (event) => {
                if (!canManageMatrixPublish) {
                  showFeedback('当前账号没有矩阵发布权限');
                  return;
                }
                const file = event.target.files?.[0];
                if (!file) return;
                updateMatrixPublishValue('videoFileName', file.name);
                showFeedback('视频上传中...');
                const upload = await assetApi.uploadMatrixPublishVideo(file);
                if (upload.code === 0 && upload.data?.url) {
                  updateMatrixPublishValue('videoFileName', upload.data.fileName || file.name);
                  updateMatrixPublishValue('videoUrl', upload.data.url);
                  showFeedback('视频已上传');
                  return;
                }
                updateMatrixPublishValue('videoUrl', URL.createObjectURL(file));
                showFeedback(upload.message || '后端上传不可用，已使用本地临时视频链接');
              }}
            />
          </Button>
          {matrixForm.values.videoFileName ? (
            <Typography variant="body2" sx={{ color: shell.muted, fontWeight: 800, gridColumn: { xs: '1', md: '1 / -1' } }}>
              已选择：{matrixForm.values.videoFileName}
            </Typography>
          ) : null}
          <TextField
            size="small"
            label="发布文案"
            value={matrixForm.values.copywriting}
            onChange={(event) => updateMatrixPublishValue('copywriting', event.target.value)}
            multiline
            minRows={3}
            fullWidth
            sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}
          />
          <TextField
            size="small"
            label="备注"
            value={matrixForm.values.remark || ''}
            onChange={(event) => updateMatrixPublishValue('remark', event.target.value)}
            multiline
            minRows={2}
            fullWidth
            sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}
          />
          <FormControl size="small" fullWidth required sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}>
            <InputLabel>发布账号</InputLabel>
            <Select
              multiple
              label="发布账号"
              value={matrixForm.values.accountIds}
              renderValue={(selected) => `已选择 ${selected.length} 个账号`}
              onChange={(event) => {
                const value = event.target.value;
                updateMatrixPublishValue('accountIds', typeof value === 'string' ? value.split(',') : value);
              }}
            >
              {lookupAccounts.map((account) => {
                const disabled = !account.currentUser;
                return (
                  <MenuItem key={account.id} value={account.id} disabled={disabled}>
                    <Checkbox checked={matrixForm.values.accountIds.includes(account.id)} />
                    <ListItemText
                      primary={`${account.platform} / ${account.accountName}`}
                      secondary={disabled ? '缺少当前使用人，不能派发' : `${account.currentUser} / ${account.department || '-'}`}
                    />
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={closeMatrixPublishDialog}>取消</Button>
        <Button
          variant="contained"
          disabled={loading || !matrixForm.values.title || !matrixForm.values.dueAt || !matrixForm.values.accountIds.length}
          onClick={submitMatrixPublishTask}
        >
          创建任务
        </Button>
      </DialogActions>
    </Dialog>
  );

  const renderFormDialog = () => {
    const formTypeLabel: Record<AssetFormType, string> = {
      device: '设备资产',
      phone: '手机号资产',
      account: '互联网账号',
    };
    const title = formState.mode === 'edit' ? `编辑${formTypeLabel[formState.type]}` : `新增${formTypeLabel[formState.type]}`;
    return (
      <Dialog open={formState.open && canEditAssets} onClose={closeForm} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 900, pb: 1 }}>
          {title}
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: '#FBFCFE' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, pt: 0.5 }}>
            <FormControl size="small" fullWidth disabled>
              <InputLabel>资产类型</InputLabel>
              <Select
                label="资产类型"
                value={formState.type}
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
          {canEditAssets ? <Button variant="contained" onClick={submitForm}>保存</Button> : null}
        </DialogActions>
      </Dialog>
    );
  };

  const renderViewSettingsDialog = () => {
    if (!viewSettingsOpen || !activeAssetView) return null;
    return (
      <TableViewSettingsDialog
        open={Boolean(viewSettingsOpen)}
        title={ASSET_VIEW_TITLES[viewSettingsOpen]}
        description={ASSET_VIEW_DESCRIPTIONS[viewSettingsOpen]}
        columns={activeAssetView.columns}
        visibleColumnIds={activeAssetView.view.visibleColumnIds}
        columnOrder={activeAssetView.view.viewConfig.columnOrder}
        frozenColumnCount={activeAssetView.view.frozenColumnCount}
        maxFrozenColumnCount={activeAssetView.view.visibleColumns.length}
        onClose={() => setViewSettingsOpen(null)}
        onToggleColumn={activeAssetView.view.toggleColumn}
        onReorderColumn={activeAssetView.view.reorderColumn}
        onFrozenColumnCountChange={activeAssetView.view.setFrozenColumnCount}
        onReset={activeAssetView.view.resetViewConfig}
      />
    );
  };

  return (
    <ModulePage>
      <ModuleHeader
        title="资产管理"
        description="管理设备、手机号与互联网账号，追溯归属与离职回收。"
        actions={(
          <>
            {canImportExport && isConfigurableAssetTab(activeTab) ? (
              <>
                <Button variant="outlined" startIcon={<FileUploadIcon />} onClick={openImportDialog}>
                  导入
                </Button>
                <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={exportCurrentRows}>
                  导出
                </Button>
              </>
            ) : null}
            {isConfigurableAssetTab(activeTab) ? (
              <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsOpen(activeTab)}>
                视图设置
              </Button>
            ) : null}
            {activeTab === 'matrix' && canManageMatrixPublish ? (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openMatrixPublishDialog}>
                创建发布任务
              </Button>
            ) : null}
            {canEditAssets && isConfigurableAssetTab(activeTab) ? (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => openCreateForm(ASSET_CREATE_TYPES[activeTab])}>
                {ASSET_CREATE_LABELS[activeTab]}
              </Button>
            ) : null}
          </>
        )}
      />
      <ModuleTabs value={activeTabVisible ? activeTab : visibleTabs[0]?.value || 'overview'} onChange={handleTabChange}>
        {visibleTabs.map((tab) => <Tab key={tab.value} value={tab.value} label={tab.label} />)}
      </ModuleTabs>
      {renderToolbar()}
      {renderActiveTable()}
      {renderDetailDialog()}
      {renderImportDialog()}
      {renderMatrixPublishDialog()}
      {renderFormDialog()}
      {renderViewSettingsDialog()}
      <Dialog open={Boolean(deleteTarget) && canDeleteAssets} onClose={closeDeleteConfirm} maxWidth="xs" fullWidth>
        <DialogTitle>删除资产</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: shell.ink, fontWeight: 900, mb: 1 }}>
            {deleteTarget?.label}
          </Typography>
          <Typography variant="body2" sx={{ color: shell.muted }}>
            删除后会从当前资产台账移除，并保留操作日志。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteConfirm}>取消</Button>
          {canDeleteAssets ? <Button color="error" variant="contained" onClick={submitDelete}>确认删除</Button> : null}
        </DialogActions>
      </Dialog>
      {feedbackDialog}
    </ModulePage>
  );
};

export default AssetManagement;
