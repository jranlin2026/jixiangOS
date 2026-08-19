import React, { useEffect, useMemo, useState } from 'react';
import {
  useSearchParams } from 'react-router-dom';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
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
  useMediaQuery,
  useTheme,
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
import { settingsApi } from '../../api';
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
import BusinessFormSection from '../../shared/components/BusinessFormSection';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import ProtectedFormDialog from '../../shared/components/ProtectedFormDialog';
import type { TableViewColumnConfig } from '../../shared/components/TableViewSettingsDialog';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import { useTableViewConfig } from '../../shared/hooks/useTableViewConfig';
import { formatCurrency, formatDate, formatEmployeeNameWithPosition, formatPaginationRows } from '../../shared/utils/formatters';
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
import {
  formatDeviceBrandModel,
  normalizeDeviceBrand,
  readAccountControlStatus,
  readDeviceCommunicationType,
} from '../../domain/assets/assetFields';
import {
  displayAccountEmail,
  displayAccountLogin,
  displayAccountRealName,
  displayDeviceImei,
  displayPhoneIccid,
  displayPhoneImsi,
  displayPhoneNumber,
  displayPhoneRealName,
} from '../../domain/assets/assetDisplay';
import { ASSET_FORM_SECTIONS, buildDeviceSlotRows, createAssetFormDefaults, formatPhoneSlotImeiLabel, type AssetFormType } from './assetFormModel';
import PlatformBrandMark from './PlatformBrandMark';
import {
  findIdentityAccountForProvider,
  normalizeIdentityAccountIds,
  type AssetIdentityAccountPlatform,
} from '../../domain/assets/accountIdentityBindings';

type AssetTab = 'overview' | 'devices' | 'phones' | 'accounts' | 'matrix' | 'logs' | 'offboarding';

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
  validationAttempted: boolean;
  validationErrorSection?: number;
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
const ASSET_LOOKUP_PAGE_SIZE = 500;

async function fetchAllAccountLookupRows(): Promise<AssetInternetAccount[]> {
  const rows: AssetInternetAccount[] = [];
  let currentPage = 1;
  let totalPages = 1;
  do {
    const result = await assetApi.fetchInternetAccounts({ page: currentPage, pageSize: ASSET_LOOKUP_PAGE_SIZE });
    if (result.code !== 0) return [];
    rows.push(...result.data.items);
    totalPages = result.data.pagination.totalPages;
    currentPage += 1;
  } while (currentPage <= totalPages);
  return rows;
}

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
  readAssetText(phone, ['phoneNumber', 'phoneNumberMasked', 'assetName', 'name'], phone.id)
);

const accountDeleteLabel = (account: AssetInternetAccount) => {
  const platform = readAssetText(account, ['platform'], '互联网账号');
  const name = readAssetText(account, ['accountName', 'assetName', 'name', 'loginAccount', 'loginAccountMasked'], account.id);
  return `${platform} / ${name}`;
};

const DEVICE_COLUMNS: AssetColumnConfig[] = [
  { id: 'deviceCode', label: '设备编号', width: 130 },
  { id: 'deviceName', label: '设备名称', width: 130 },
  { id: 'brandModel', label: '类型 / 品牌型号', width: 180 },
  { id: 'imei', label: '卡槽 / IMEI', width: 250 },
  { id: 'simType', label: '对应手机号', width: 210 },
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
  { id: 'identityBindings', label: '身份账号绑定', width: 220 },
  { id: 'device', label: '所属设备', width: 180 },
  { id: 'owner', label: '负责人', width: 120 },
  { id: 'permissionStatus', label: '控制权状态', width: 140 },
];
const DEFAULT_ACCOUNT_VISIBLE_COLUMN_IDS = ACCOUNT_COLUMNS.map((column) => column.id);

const ASSET_VIEW_STORAGE_KEYS: Record<ConfigurableAssetTab, string> = {
  devices: 'aaos_asset_devices_table_view_v4',
  phones: 'aaos_asset_phones_table_view_v6',
  accounts: 'aaos_asset_accounts_table_view_v7',
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
  validationAttempted: false,
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
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
  const [platformOptions, setPlatformOptions] = useState<string[]>(() => assetApi.getAccountPlatformOptions());
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
  const [detailSaveNotice, setDetailSaveNotice] = useState('');
  const [viewSettingsOpen, setViewSettingsOpen] = useState<ConfigurableAssetTab | null>(null);
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!detailSaveNotice) return undefined;
    const timer = window.setTimeout(() => setDetailSaveNotice(''), 2400);
    return () => window.clearTimeout(timer);
  }, [detailSaveNotice]);
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
  const canEditDevices = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_DEVICES, 'write');
  const canEditPhones = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_PHONES, 'write');
  const canEditAccounts = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_ACCOUNTS, 'write');
  const canEditAssetType = (type: AssetFormType) => (
    type === 'device' ? canEditDevices : type === 'phone' ? canEditPhones : canEditAccounts
  );
  const canDeleteAssetType = (type: AssetFormType) => (
    canEditAssetType(type)
    || hasPermission(
      currentUser,
      type === 'device'
        ? PERMISSION_KEYS.ASSETS_DEVICES
        : type === 'phone'
          ? PERMISSION_KEYS.ASSETS_PHONES
          : PERMISSION_KEYS.ASSETS_ACCOUNTS,
      'delete',
    )
  );
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
  const accountById = useMemo(() => new Map(lookupAccounts.map((account) => [account.id, account])), [lookupAccounts]);
  const userById = useMemo(() => new Map(lookupUsers.map((user) => [user.id, user])), [lookupUsers]);
  const departmentById = useMemo(() => new Map(lookupDepartments.map((department) => [department.id, department])), [lookupDepartments]);
  const phonesByDeviceId = useMemo(() => {
    const map = new Map<string, AssetPhoneNumber[]>();
    lookupPhones.forEach((phone) => {
      if (!phone.deviceId) return;
      const list = map.get(phone.deviceId) || [];
      list.push(phone);
      map.set(phone.deviceId, list);
    });
    map.forEach((list) => list.sort((a, b) => (a.slotType || '').localeCompare(b.slotType || '', 'zh-CN')));
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
    const boundPhoneCount = lookupPhones.filter((phone) => Boolean(phone.deviceId && deviceById.get(phone.deviceId))).length;
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
    void fetchAllAccountLookupRows().then(setLookupAccounts);
    settingsApi.fetchAssignableDirectory().then((res) => {
      if (res.code === 0) {
        setLookupUsers(res.data.users);
        setLookupDepartments(res.data.departments);
      }
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
    const [deviceRes, phoneRes, accountRows] = await Promise.all([
      assetApi.fetchDevices({ pageSize: ASSET_LOOKUP_PAGE_SIZE }),
      assetApi.fetchPhoneNumbers({ pageSize: ASSET_LOOKUP_PAGE_SIZE }),
      fetchAllAccountLookupRows(),
    ]);
    if (deviceRes.code === 0) setLookupDevices(deviceRes.data.items);
    if (phoneRes.code === 0) setLookupPhones(phoneRes.data.items);
    setLookupAccounts(accountRows);
    const directoryRes = await settingsApi.fetchAssignableDirectory();
    if (directoryRes.code === 0) {
      setLookupUsers(directoryRes.data.users);
      setLookupDepartments(directoryRes.data.departments);
    }
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
      validationErrorSection: undefined,
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
      validationErrorSection: undefined,
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
    if (!canEditAssetType(type)) {
      showFeedback('当前账号没有编辑资产权限');
      return;
    }
    setFormState({ open: true, type, mode: 'create', values: createAssetFormDefaults(type), validationAttempted: false });
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
    if (!canEditAssetType(type)) {
      showFeedback('当前账号没有编辑资产权限');
      return;
    }
    const values = Object.entries(item).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = String(value ?? '');
      return acc;
    }, {});
    if (type === 'phone') values.servicePassword = '';
    if (type === 'account') {
      const account = item as AssetInternetAccount;
      values.loginPassword = '';
      values.paymentPassword = '';
      values.requiresPaymentPassword = account.requiresPaymentPassword ? 'true' : 'false';
      values.appleIdentityAccountId = findIdentityAccountForProvider(account, lookupAccounts, 'Apple ID')?.id || '';
      values.googleIdentityAccountId = findIdentityAccountForProvider(account, lookupAccounts, 'Google账号')?.id || '';
    }
    setFormState({ open: true, type, mode: 'edit', id: item.id, values: normalizeAssetFormValues(values), validationAttempted: false });
  };

  const closeForm = () => setFormState(emptyForm);

  const submitForm = async () => {
    if (!canEditAssetType(formState.type)) {
      showFeedback('当前账号没有编辑资产权限');
      return;
    }
    setFormState((current) => ({ ...current, validationAttempted: true }));
    let saved: AssetDevice | AssetPhoneNumber | AssetInternetAccount | null = null;
    if (formState.type === 'device') {
      const input = formState.values as Partial<AssetDeviceInput>;
      saved = formState.mode === 'edit' && formState.id
        ? await updateDevice(formState.id, input)
        : await createDevice(input);
      if (saved) await fetchDetail('device', saved.id);
    }
    if (formState.type === 'phone') {
      const input = {
        ...formState.values,
        clearServicePassword: formState.values.clearServicePassword === 'true',
      } as Partial<AssetPhoneNumberInput>;
      saved = formState.mode === 'edit' && formState.id
        ? await updatePhone(formState.id, input)
        : await createPhone(input);
      if (saved) await fetchDetail('phone', saved.id);
    }
    if (formState.type === 'account') {
      const {
        appleIdentityAccountId: _appleIdentityAccountId,
        googleIdentityAccountId: _googleIdentityAccountId,
        identityAccountIds: _identityAccountIds,
        ...accountValues
      } = formState.values;
      const input = {
        ...accountValues,
        identityAccountIds: [
          formState.values.platform === 'Apple ID' ? '' : formState.values.appleIdentityAccountId,
          formState.values.platform === 'Google账号' ? '' : formState.values.googleIdentityAccountId,
        ].filter(Boolean),
      } as unknown as Partial<AssetInternetAccountInput>;
      saved = formState.mode === 'edit' && formState.id
        ? await updateAccount(formState.id, input)
        : await createAccount(input);
      if (saved) await fetchDetail('account', saved.id);
    }
    if (!saved) {
      const error = useAssetStore.getState().error || '保存失败';
      const validationErrorSection = formState.type === 'device'
        ? (/IMEI|通信/.test(error) ? 2 : 1)
        : formState.type === 'phone'
          ? (/设备|卡槽|绑定/.test(error) ? 2 : 1)
          : (/密码|登录方式|手机号|邮箱|二次验证|绑定/.test(error) ? 2 : 1);
      setFormState((current) => ({ ...current, validationErrorSection }));
      showFeedback(error);
      return;
    }
    const wasEditing = formState.mode === 'edit';
    closeForm();
    if (wasEditing && detailDialogOpen) setDetailSaveNotice('资料已更新');
    else if (wasEditing) showFeedback('资产资料已更新', '操作完成');
    else showFeedback('资产已新增', '操作完成');
    await refreshActiveTab();
  };

  const openDeleteConfirm = (type: AssetFormType, id: string, label: string) => {
    if (!canDeleteAssetType(type)) {
      showFeedback('当前账号没有删除资产权限');
      return;
    }
    setDeleteTarget({ type, id, label });
  };

  const closeDeleteConfirm = () => setDeleteTarget(null);

  const submitDelete = async () => {
    if (!deleteTarget) return;
    if (!canDeleteAssetType(deleteTarget.type)) {
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
        设备类型: device.deviceCategory,
        设备名称: device.deviceName,
        品牌: device.brand,
        型号: device.model,
        序列号: device.serialNumber || '',
        通信方式: readDeviceCommunicationType(device),
        'IMEI 1': displayDeviceImei(device, 1),
        'IMEI 2': displayDeviceImei(device, 2),
        手机号: (phonesByDeviceId.get(device.id) || []).map((phone) => `${phone.slotType}:${displayPhoneNumber(phone)}`).join(' / '),
        账号数: (accountsByDeviceId.get(device.id) || []).length,
        所属部门: device.department,
        负责人: device.owner,
        当前使用人: device.currentUser,
        状态: device.status,
      })),
      phones: phones.map((phone) => {
        const device = deviceById.get(phone.deviceId || '');
        return {
          手机号: displayPhoneNumber(phone),
          SIM形态: phone.simForm,
          ICCID: displayPhoneIccid(phone),
          IMSI: displayPhoneImsi(phone),
          实名主体: phone.realNameSubject || '',
          实名信息: displayPhoneRealName(phone),
          运营商: phone.operator,
          归属地: phone.attributionLocation || '',
          所属设备: device?.deviceCode || '-',
          关联账号: (accountsByPhoneId.get(phone.id) || []).map((account) => `${account.platform}/${account.accountName}`).join(' / '),
          卡槽: phone.slotType || '',
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
        const identityAccounts = normalizeIdentityAccountIds(account.identityAccountIds)
          .map((id) => accountById.get(id))
          .filter((item): item is AssetInternetAccount => Boolean(item));
        return {
          账号编号: account.accountNo,
          平台: account.platform,
          账号类型: account.accountCategory,
          账号名称: account.accountName,
          登录账号: displayAccountLogin(account),
          实名主体: account.realNameSubject || '',
          实名信息: displayAccountRealName(account),
          绑定手机号: phone ? displayPhoneNumber(phone) : '未绑定',
          绑定AppleID: identityAccounts.find((item) => item.platform === 'Apple ID')?.loginAccount || '',
          绑定Google账号: identityAccounts.find((item) => item.platform === 'Google账号')?.loginAccount || '',
          绑定邮箱: displayAccountEmail(account),
          所属设备: device?.deviceCode || '-',
          负责人: account.owner,
          控制权状态: readAccountControlStatus(account),
          账号状态: account.accountStatus,
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
                        label={`${phone.slotType} ${displayPhoneNumber(phone)}`}
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
      devices: '搜索设备编号、设备名称、IMEI 1/2、负责人',
      phones: '搜索手机号、实名信息、归属地、所属设备',
      accounts: '搜索平台、账号名称、实名信息、绑定手机号',
      matrix: '搜索任务、账号、执行人',
      logs: '搜索操作、对象、操作人',
      offboarding: '搜索员工、资产名称',
    };
    const statusOptionsMap: Partial<Record<AssetTab, string[]>> = {
      devices: ['库存中', '使用中', '维修中', '闲置', '已停用', '已报废'],
      phones: ['待启用', '使用中', '停机保号', '已停用', '已注销'],
      accounts: ['使用中', '闲置', '异常', '封禁', '已注销'],
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
            {activeTab === 'accounts' ? (
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>账号控制权</InputLabel>
                <Select value={permissionStatus} label="账号控制权" onChange={(event) => setPermissionStatus(event.target.value)}>
                  <MenuItem value="">全部</MenuItem>
                  {['已掌控', '待交接', '离职待回收', '已回收'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                </Select>
              </FormControl>
            ) : null}
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

  const renderDeviceImeis = (device: AssetDevice) => {
    const slotRows = buildDeviceSlotRows(device, phonesByDeviceId.get(device.id) || []);
    if (!slotRows.length) return <Typography variant="caption" sx={{ color: shell.muted }}>无 SIM</Typography>;
    return (
      <Stack spacing={0.5}>
        {slotRows.map((row) => (
          <Stack key={row.slotType} direction="row" spacing={0.75} alignItems="center" sx={{ minHeight: 24, whiteSpace: 'nowrap' }}>
            <Typography variant="caption" sx={{ color: shell.muted, width: 96, flexShrink: 0 }}>
              {row.slotType} / {row.imeiLabel}
            </Typography>
            <Box>{row.imeiDisplay || '-'}</Box>
          </Stack>
        ))}
      </Stack>
    );
  };

  const renderDeviceCell = (device: AssetDevice, columnId: string) => {
    switch (columnId) {
      case 'deviceCode':
        return <Box sx={{ color: shell.tableLink, fontWeight: 900 }}>{device.deviceCode}</Box>;
      case 'deviceName':
        return device.deviceName;
      case 'brandModel':
        return `${device.deviceCategory || '手机'} / ${formatDeviceBrandModel(device)}`;
      case 'imei':
        return renderDeviceImeis(device);
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
    const slotRows = buildDeviceSlotRows(device, linkedPhones);
    if (!slotRows.length) return <Typography variant="caption" sx={{ color: shell.muted }}>无 SIM</Typography>;
    return (
      <Stack spacing={0.5} sx={{ minWidth: 0 }}>
        {slotRows.map((row) => {
          const phone = row.phoneId ? linkedPhones.find((item) => item.id === row.phoneId) : undefined;
          if (!phone) {
            return (
              <Stack key={row.slotType} direction="row" spacing={0.75} alignItems="center" sx={{ minHeight: 24, whiteSpace: 'nowrap' }}>
                <Typography variant="caption" sx={{ color: shell.muted, width: 42, flexShrink: 0 }}>{row.slotType}</Typography>
                <Typography variant="caption" sx={{ color: shell.muted, lineHeight: 1.3 }}>
                  未绑定
                </Typography>
              </Stack>
            );
          }
          return (
            <Stack key={row.slotType} direction="row" spacing={0.75} alignItems="center" sx={{ minHeight: 24, whiteSpace: 'nowrap' }}>
              <Typography variant="caption" sx={{ color: shell.muted, width: 42, flexShrink: 0 }}>{row.slotType}</Typography>
              <Tooltip title="查看手机号资料">
                {renderRelationLink(displayPhoneNumber(phone), () => openDetail('phone', phone.id))}
              </Tooltip>
            </Stack>
          );
        })}
      </Stack>
    );
  };

  const phoneSlotOptionsForDevice = (deviceId?: string) => {
    const device = deviceId ? deviceById.get(deviceId) : undefined;
    if (!device || readDeviceCommunicationType(device) === '无SIM') return [];
    return readDeviceCommunicationType(device) === '双卡' ? ['卡槽1', '卡槽2'] : ['卡槽1'];
  };

  const renderPhoneCell = (phone: AssetPhoneNumber, columnId: string) => {
    const device = deviceById.get(phone.deviceId || '');
    switch (columnId) {
      case 'phoneNumber':
        return <Box sx={{ color: shell.tableLink, fontWeight: 900 }}>{displayPhoneNumber(phone)}</Box>;
      case 'realName':
        return displayPhoneRealName(phone) || '未录入';
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
        return phone.slotType ? formatPhoneSlotImeiLabel(phone.slotType, device) : '-';
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
        return <Stack direction="row" spacing={1} alignItems="center"><PlatformBrandMark platform={account.platform} /><Box>{account.platform}</Box></Stack>;
      case 'accountName':
        return account.accountName;
      case 'loginAccount':
        return displayAccountLogin(account);
      case 'realName':
        return displayAccountRealName(account) || '未录入';
      case 'phone':
        return phone
          ? renderRelationLink(displayPhoneNumber(phone), () => openAccountPhoneDetail(account.phoneId))
          : <Box sx={{ color: shell.amber, fontWeight: 800 }}>未绑定</Box>;
      case 'identityBindings': {
        const identityAccounts = normalizeIdentityAccountIds(account.identityAccountIds)
          .map((id) => accountById.get(id))
          .filter((item): item is AssetInternetAccount => Boolean(item));
        return identityAccounts.length ? (
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            {identityAccounts.map((identityAccount) => (
              <Tooltip key={identityAccount.id} title={`${identityAccount.platform} / ${displayAccountLogin(identityAccount)}`}>
                <Box component="span" sx={{ display: 'inline-flex', cursor: 'pointer' }} onClick={(event) => { event.stopPropagation(); openDetail('account', identityAccount.id); }}>
                  <PlatformBrandMark platform={identityAccount.platform} size={28} />
                </Box>
              </Tooltip>
            ))}
          </Stack>
        ) : <Box sx={{ color: shell.muted }}>未绑定</Box>;
      }
      case 'device':
        return device
          ? renderRelationLink(`${device.deviceCode} / ${device.deviceName}`, () => openDetail('device', device.id))
          : <Box sx={{ color: shell.muted }}>-</Box>;
      case 'owner':
        return account.owner || '-';
      case 'permissionStatus':
        return <Chip size="small" label={readAccountControlStatus(account)} sx={chipSx(statusTone(readAccountControlStatus(account)))} />;
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
                {canEditDevices ? (
                  <Tooltip title="编辑资料">
                    <IconButton size="small" onClick={(event) => { event.stopPropagation(); openEditForm('device', device); }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : null}
                {canDeleteAssetType('device') ? (
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
                  {canEditPhones ? (
                    <Tooltip title="编辑资料">
                      <IconButton size="small" onClick={(event) => { event.stopPropagation(); openEditForm('phone', phone); }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                  {canDeleteAssetType('phone') ? (
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
                  {canEditAccounts ? <Tooltip title="编辑资料"><IconButton size="small" onClick={(event) => { event.stopPropagation(); openEditForm('account', account); }}><EditIcon fontSize="small" /></IconButton></Tooltip> : null}
                  {canDeleteAssetType('account') ? (
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
    return <PlatformBrandMark platform={account.platform} />;
  };

  const renderCopyButton = (text: string | undefined, label: string) => (
    <Tooltip title={`复制${label}`}>
      <IconButton size="small" onClick={() => copyText(text, label)} sx={{ color: shell.muted }}>
        <ContentCopyIcon sx={{ fontSize: 15 }} />
      </IconButton>
    </Tooltip>
  );

  const renderOperationalValue = (value: string | undefined, label: string) => {
    const text = String(value || '').trim();
    if (!text) return <Typography component="span" sx={{ color: shell.muted, fontWeight: 700 }}>未录入</Typography>;
    return (
      <Stack direction="row" spacing={0.25} alignItems="center" sx={{ minWidth: 0 }}>
        <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{text}</Box>
        {renderCopyButton(text, label)}
      </Stack>
    );
  };

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

  const renderDeviceSummaryCard = (device: AssetDevice) => (
    <Paper elevation={0} sx={{ ...detailCardSx, p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={1.5}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ color: shell.ink, fontSize: 22, fontWeight: 950 }}>{device.deviceName}</Typography>
          <Typography variant="body2" sx={{ color: shell.muted, mt: 0.25 }}>{formatDeviceBrandModel(device)}</Typography>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 0.8 }}>
            <Chip size="small" label={device.deviceCode} variant="outlined" />
            <Chip size="small" label={device.deviceCategory || '手机'} variant="outlined" />
            <Chip size="small" label={device.status} sx={chipSx(statusTone(device.status))} />
          </Stack>
        </Box>
        <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
          <Typography variant="caption" sx={{ color: shell.muted }}>当前使用人</Typography>
          <Typography sx={{ color: shell.ink, fontWeight: 900 }}>{device.currentUser || '未分配'}</Typography>
        </Box>
      </Stack>
    </Paper>
  );

  const renderDeviceCommunicationCard = (device: AssetDevice) => {
    const slots = buildDeviceSlotRows(device, detail?.relatedPhones || []);
    return renderDetailCard('卡槽与通信绑定', slots.length ? (
      <Stack spacing={1}>
        {slots.map((slot) => {
          const phone = detail?.relatedPhones.find((item) => item.id === slot.phoneId);
          const accounts = slot.phoneId
            ? detail?.relatedAccounts.filter((account) => account.phoneId === slot.phoneId) || []
            : [];
          return (
            <Paper key={slot.slotType} variant="outlined" sx={{ borderColor: shell.softLine, borderRadius: 1.25, p: 1.5 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'flex-start' }}>
                <Box sx={{ minWidth: 92 }}>
                  <Typography sx={{ color: shell.tableLink, fontWeight: 950 }}>{slot.slotType}</Typography>
                  <Typography variant="caption" sx={{ color: shell.muted }}>{slot.imeiLabel}</Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: shell.muted }}>IMEI 标识</Typography>
                  <Box sx={{ color: shell.ink, fontWeight: 800, mt: 0.25 }}>
                    {slot.imeiDisplay
                      ? renderOperationalValue(slot.imeiDisplay, slot.imeiLabel)
                      : '未录入'}
                  </Box>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: shell.muted }}>对应手机号</Typography>
                  <Box sx={{ mt: 0.25 }}>
                    {phone
                      ? renderAssetNameLink(displayPhoneNumber(phone), () => openDetail('phone', phone.id))
                      : <Typography sx={{ color: shell.muted, fontWeight: 800 }}>未绑定</Typography>}
                  </Box>
                  {phone ? (
                    <Typography variant="caption" sx={{ color: shell.muted }}>
                      {[phone.operator, phone.packageName, phone.status].filter(Boolean).join(' / ')}
                    </Typography>
                  ) : null}
                </Box>
                <Box sx={{ flex: 1.2, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: shell.muted }}>互联网账号</Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                    {accounts.length ? accounts.map((account) => (
                      <Button
                        key={account.id}
                        size="small"
                        variant="outlined"
                        onClick={() => openDetail('account', account.id)}
                        sx={{ minWidth: 0, px: 1, fontWeight: 800 }}
                      >
                        {account.platform} / {account.accountName}
                      </Button>
                    )) : <Typography variant="body2" sx={{ color: shell.muted }}>暂无关联账号</Typography>}
                  </Stack>
                </Box>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    ) : (
      <Box sx={{ py: 1.5, textAlign: 'center', color: shell.muted }}>该设备无 SIM 通信能力，无需配置卡槽绑定。</Box>
    ));
  };

  const renderDeviceDetailSections = (device: AssetDevice) => (
    <Stack spacing={1.25}>
      {renderDeviceSummaryCard(device)}
      {renderDetailCard('设备身份', renderInfoRows([
        { label: '设备编号', value: <Stack direction="row" alignItems="center" spacing={0.5}>{device.deviceCode}{renderCopyButton(device.deviceCode, '设备编号')}</Stack> },
        { label: '设备类型', value: device.deviceCategory || '手机' },
        { label: '品牌', value: normalizeDeviceBrand(device.brand) || '-' },
        { label: '型号', value: device.model || '-' },
        ...(device.serialNumber ? [{ label: '序列号', value: device.serialNumber }] : []),
        { label: '通信方式', value: readDeviceCommunicationType(device) },
      ], 2))}
      {renderDeviceCommunicationCard(device)}
      {renderDetailCard('归属与使用', renderInfoRows([
        { label: '所属主体', value: device.ownerSubject },
        ...(device.department ? [{ label: '所属部门', value: device.department }] : []),
        ...(device.owner ? [{ label: '资产负责人', value: device.owner }] : []),
        ...(device.currentUser ? [{ label: '当前使用人', value: device.currentUser }] : []),
      ], 2))}
      {renderDetailCard('取得与状态', renderInfoRows([
        { label: '取得方式', value: device.acquisitionType || '-' },
        { label: device.acquisitionType === '租赁' ? '月租金' : '购买金额', value: formatCurrency(device.acquisitionType === '租赁' ? device.monthlyRent || 0 : device.purchaseAmount || 0) },
        ...(device.acquiredAt ? [{ label: '取得日期', value: formatDate(device.acquiredAt, 'yyyy-MM-dd') }] : []),
        ...(device.warrantyExpiresAt ? [{ label: '保修到期', value: formatDate(device.warrantyExpiresAt, 'yyyy-MM-dd') }] : []),
        { label: '设备状态', value: <Chip size="small" label={device.status} sx={chipSx(statusTone(device.status))} /> },
        { label: '更新时间', value: formatDate(device.updatedAt, 'yyyy-MM-dd') },
        ...(device.remark ? [{ label: '备注', value: device.remark }] : []),
      ], 2))}
    </Stack>
  );

  const renderPhoneSummaryCard = (phone: AssetPhoneNumber) => (
    <Paper elevation={0} sx={{ ...detailCardSx, p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={1.5}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography sx={{ color: shell.ink, fontSize: 24, fontWeight: 950 }}>{displayPhoneNumber(phone)}</Typography>
            {renderCopyButton(displayPhoneNumber(phone), '手机号')}
          </Stack>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 0.8 }}>
            <Chip size="small" label={phone.operator || '未知运营商'} variant="outlined" />
            <Chip size="small" label={phone.simForm || '实体SIM'} variant="outlined" />
            <Chip size="small" label={phone.status} sx={chipSx(statusTone(phone.status))} />
          </Stack>
        </Box>
        <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
          <Typography variant="caption" sx={{ color: shell.muted }}>当前使用人</Typography>
          <Typography sx={{ color: shell.ink, fontWeight: 900 }}>{phone.currentUser || primaryDevice?.currentUser || '未分配'}</Typography>
          <Typography variant="caption" sx={{ color: shell.muted }}>
            {primaryDevice ? `${primaryDevice.deviceCode} / ${phone.slotType || '未选卡槽'}` : '未绑定设备'}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );

  const renderPhoneIdentityCard = (phone: AssetPhoneNumber) => renderDetailCard('SIM身份信息', renderInfoRows([
    { label: '手机号', value: renderOperationalValue(displayPhoneNumber(phone), '手机号') },
    { label: '运营商', value: phone.operator || '未录入' },
    { label: '归属地', value: phone.attributionLocation || '未录入' },
    { label: 'SIM形态', value: phone.simForm || '实体SIM' },
    { label: 'ICCID', value: renderOperationalValue(displayPhoneIccid(phone), 'ICCID') },
    { label: 'IMSI', value: renderOperationalValue(displayPhoneImsi(phone), 'IMSI') },
    {
      label: '服务密码',
      value: phone.servicePasswordMasked
        ? renderSensitiveInline('phone', phone.id, 'servicePassword', phone.servicePasswordMasked)
        : <Typography component="span" sx={{ color: shell.muted, fontWeight: 700 }}>未录入</Typography>,
    },
  ], 2));

  const renderPhoneDeviceBindingCard = (phone: AssetPhoneNumber) => {
    const slot = phone.slotType;
    const imeiLabel = slot === '卡槽2' ? 'IMEI 2' : 'IMEI 1';
    const imei = primaryDevice && slot ? displayDeviceImei(primaryDevice, slot === '卡槽2' ? 2 : 1) : '';
    return renderDetailCard('设备绑定关系', primaryDevice && slot ? (
      <Paper variant="outlined" sx={{ borderColor: shell.softLine, borderRadius: 1.25, p: 1.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.7fr 1.2fr 1.3fr' }, gap: 1.5, alignItems: 'center' }}>
          <Box>
            <Typography variant="caption" sx={{ color: shell.muted }}>当前卡槽</Typography>
            <Typography sx={{ color: shell.tableLink, fontWeight: 950 }}>{slot}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: shell.muted }}>对应{imeiLabel}</Typography>
            <Box sx={{ color: shell.ink, fontWeight: 850 }}>{renderOperationalValue(imei, imeiLabel)}</Box>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: shell.muted }}>所属设备</Typography>
            <Box>{renderAssetNameLink(`${primaryDevice.deviceCode} / ${primaryDevice.deviceName}`, () => openDetail('device', primaryDevice.id))}</Box>
            <Typography variant="caption" sx={{ color: shell.muted }}>{formatDeviceBrandModel(primaryDevice)}</Typography>
          </Box>
        </Box>
      </Paper>
    ) : (
      <Box sx={{ py: 1.5, textAlign: 'center', color: shell.muted }}>当前手机号尚未绑定设备与卡槽。</Box>
    ));
  };

  const renderPhoneOwnershipCard = (phone: AssetPhoneNumber) => renderDetailCard('归属与使用', renderInfoRows([
    { label: '所属主体', value: phone.ownerSubject || '公司' },
    { label: '实名主体', value: phone.realNameSubject || '未录入' },
    { label: '实名信息', value: renderOperationalValue(displayPhoneRealName(phone), '实名信息') },
    { label: '所属部门', value: phone.department || primaryDevice?.department || '未录入' },
    { label: '资产负责人', value: phone.owner || '未分配' },
    { label: '当前使用人', value: phone.currentUser || primaryDevice?.currentUser || '未分配' },
  ], 2));

  const renderPhonePlanCard = (phone: AssetPhoneNumber) => renderDetailCard('套餐与状态', renderInfoRows([
    { label: '套餐', value: phone.packageName || '未录入' },
    { label: '月费用', value: formatCurrency(phone.monthlyFee) },
    { label: '合约到期', value: phone.contractExpiresAt ? formatDate(phone.contractExpiresAt, 'yyyy-MM-dd') : '未录入' },
    { label: '卡状态', value: <Chip size="small" label={phone.status} sx={chipSx(statusTone(phone.status))} /> },
    { label: '更新时间', value: formatDate(phone.updatedAt, 'yyyy-MM-dd') },
    ...(phone.remark ? [{ label: '备注', value: phone.remark }] : []),
  ], 2));

  const renderPhoneDetailSections = (phone: AssetPhoneNumber) => (
    <Stack spacing={1.25}>
      {renderPhoneSummaryCard(phone)}
      {renderPhoneIdentityCard(phone)}
      {renderPhoneDeviceBindingCard(phone)}
      {renderPhoneOwnershipCard(phone)}
      {renderPhonePlanCard(phone)}
      {renderRelatedAssetsSection()}
    </Stack>
  );

  const renderAccountBasicCard = (account: AssetInternetAccount) => (
    renderDetailCard('账号基本信息', (
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Stack spacing={1} alignItems="center" sx={{ width: 96, flexShrink: 0 }}>
          <PlatformBrandMark platform={account.platform} size={72} />
          <Chip size="small" label={account.accountStatus} sx={chipSx(statusTone(account.accountStatus))} />
        </Stack>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.2 }}>
            <Typography sx={{ color: shell.ink, fontSize: 22, fontWeight: 950 }}>{account.platform} - {account.accountName}</Typography>
            <Chip size="small" label={readAccountControlStatus(account)} sx={chipSx(statusTone(readAccountControlStatus(account)))} />
          </Stack>
          {renderInfoRows([
            { label: '账号编号', value: <Stack direction="row" alignItems="center" spacing={0.5}>{account.accountNo}{renderCopyButton(account.accountNo, '账号编号')}</Stack> },
            { label: '平台', value: account.platform },
            { label: '账号类型', value: account.accountCategory || '主账号' },
            { label: '所属主体', value: account.ownerSubject },
            { label: '登录账号', value: renderOperationalValue(displayAccountLogin(account), '登录账号') },
            { label: '实名主体', value: account.realNameSubject || '-' },
            { label: '实名信息', value: renderOperationalValue(displayAccountRealName(account), '实名信息') },
            {
              label: '绑定手机号',
              value: primaryPhone
                ? renderAssetNameLink(displayPhoneNumber(primaryPhone), () => openDetail('phone', primaryPhone.id))
                : '-',
            },
            {
              label: '绑定 Apple ID',
              value: (() => {
                const identityAccount = findIdentityAccountForProvider(account, detail?.relatedAccounts || lookupAccounts, 'Apple ID');
                return identityAccount
                  ? renderAssetNameLink(`${identityAccount.accountName} / ${displayAccountLogin(identityAccount)}`, () => openDetail('account', identityAccount.id))
                  : '未绑定';
              })(),
            },
            {
              label: '绑定 Google',
              value: (() => {
                const identityAccount = findIdentityAccountForProvider(account, detail?.relatedAccounts || lookupAccounts, 'Google账号');
                return identityAccount
                  ? renderAssetNameLink(`${identityAccount.accountName} / ${displayAccountLogin(identityAccount)}`, () => openDetail('account', identityAccount.id))
                  : '未绑定';
              })(),
            },
            {
              label: '所属设备',
              value: primaryDevice
                ? renderAssetNameLink(`${primaryDevice.deviceCode} / ${primaryDevice.deviceName}`, () => openDetail('device', primaryDevice.id))
                : '-',
            },
            { label: '绑定邮箱', value: renderOperationalValue(displayAccountEmail(account), '绑定邮箱') },
            { label: '登录方式', value: account.loginMethod || '密码登录' },
            {
              label: '登录密码',
              value: account.loginCredentialStatus === '已设置'
                ? renderSensitiveInline('account', account.id, 'loginPassword', '••••••')
                : <Chip size="small" label={account.loginCredentialStatus || '待补齐'} sx={chipSx(statusTone(account.loginCredentialStatus || '待补齐'))} />,
            },
            {
              label: '支付密码',
              value: account.paymentCredentialStatus === '已设置'
                ? renderSensitiveInline('account', account.id, 'paymentPassword', '••••••')
                : <Chip size="small" label={account.paymentCredentialStatus || '不适用'} sx={chipSx(statusTone(account.paymentCredentialStatus || '不适用'))} />,
            },
            { label: '凭证更新时间', value: account.credentialUpdatedAt ? formatDate(account.credentialUpdatedAt, 'yyyy-MM-dd HH:mm') : '-' },
            { label: '控制权状态', value: <Chip size="small" label={readAccountControlStatus(account)} sx={chipSx(statusTone(readAccountControlStatus(account)))} /> },
            { label: '账号状态', value: <Chip size="small" label={account.accountStatus} sx={chipSx(statusTone(account.accountStatus))} /> },
            { label: '所属部门', value: account.department || '-' },
            { label: '负责人', value: account.owner || '-' },
            { label: '当前使用人', value: account.currentUser || '-' },
            { label: '用途', value: account.purpose || '-' },
            { label: '业务场景', value: account.businessScene || '-' },
          ], 2)}
        </Box>
      </Stack>
    ))
  );

  const renderAccountIdentityCard = (account: AssetInternetAccount) => {
    const related = detail?.relatedAccounts || [];
    const outboundIds = new Set(normalizeIdentityAccountIds(account.identityAccountIds));
    const rows = related
      .filter((item) => item.id !== account.id && (
        outboundIds.has(item.id) || normalizeIdentityAccountIds(item.identityAccountIds).includes(account.id)
      ))
      .map((item) => [
        outboundIds.has(item.id) ? '当前账号使用' : '被业务账号使用',
        <Stack direction="row" spacing={1} alignItems="center"><PlatformBrandMark platform={item.platform} size={30} /><Box>{item.platform}</Box></Stack>,
        renderAssetNameLink(item.accountName, () => openDetail('account', item.id)),
        displayAccountLogin(item),
        <Chip size="small" label={readAccountControlStatus(item)} sx={chipSx(statusTone(readAccountControlStatus(item)))} />,
      ]);
    return renderDetailCard('身份账号关联', renderCompactTable(
      ['关联方向', '平台', '账号名称', '登录账号', '控制权'],
      rows,
      '暂无 Apple ID 或 Google 账号关联',
    ));
  };

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
      renderAssetNameLink(displayPhoneNumber(phone), () => openDetail('phone', phone.id)),
      displayPhoneRealName(phone) || '未录入',
      phone.operator,
      phone.packageName || '-',
      <Chip size="small" label={phone.status} sx={chipSx(statusTone(phone.status))} />,
    ]);
    const accountRows = detail.relatedAccounts.map((account) => [
      <Stack direction="row" spacing={1} alignItems="center">{renderPlatformLogo(account)}<Box>{account.platform}</Box></Stack>,
      renderAssetNameLink(account.accountName, () => openDetail('account', account.id)),
      displayAccountLogin(account),
      displayAccountRealName(account) || '未录入',
      (() => {
        const phone = detail.relatedPhones.find((item) => item.id === account.phoneId);
        return phone ? displayPhoneNumber(phone) : '未绑定';
      })(),
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
    if (detail.device) return renderDeviceDetailSections(detail.device);
    if (detail.phone) return renderPhoneDetailSections(detail.phone);
    const basicCard = detail.account ? renderAccountBasicCard(detail.account) : null;
    return (
      <Stack spacing={1.25}>
        {basicCard}
        {detail.account ? renderAccountIdentityCard(detail.account) : null}
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
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ color: shell.ink, fontSize: 20, fontWeight: 950 }}>{detail ? detailTitleMap[detail.type] : '查看资产资料'}</Typography>
              {detailSaveNotice ? <Chip size="small" color="success" label={detailSaveNotice} /> : null}
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              {detail && canEditAssetType(detail.type) ? (
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

  const renderTextField = (name: string, label: string, props: { required?: boolean; type?: string; multiline?: boolean; helperText?: string } = {}) => (
    <TextField
      size="small"
      label={label}
      value={formState.values[name] || ''}
      onChange={(event) => updateFormValue(name, event.target.value)}
      required={props.required}
      type={props.type}
      multiline={props.multiline}
      minRows={props.multiline ? 2 : undefined}
      helperText={props.helperText}
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
            return user ? formatEmployeeNameWithPosition(user) : nameValue || '未选择';
          }}
        >
          <MenuItem value="">未选择</MenuItem>
          {nameValue && !formState.values[idField] ? (
            <MenuItem value="" disabled>{nameValue}（未匹配员工）</MenuItem>
          ) : null}
          {lookupUsers.map((user) => (
            <MenuItem key={user.id} value={user.id}>
              {formatEmployeeNameWithPosition(user)}
            </MenuItem>
          ))}
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

  const sectionErrorCount = (requiredFields: string[]) => formState.validationAttempted
    ? requiredFields.filter((field) => !String(formState.values[field] || '').trim()).length
    : 0;

  const sectionSummary = (fields: string[], fallback: string) => {
    const defaults = formState.mode === 'create' ? createAssetFormDefaults(formState.type) : {};
    const filled = fields.filter((field) => {
      if (field === 'servicePassword') {
        return formState.values.clearServicePassword !== 'true'
          && Boolean(String(formState.values.servicePassword || formState.values.servicePasswordMasked || '').trim());
      }
      const value = String(formState.values[field] || '').trim();
      if (!value) return false;
      return formState.mode === 'edit' || value !== String(defaults[field] || '').trim();
    }).length;
    return filled ? `已填 ${filled}/${fields.length} 项` : fallback;
  };

  const renderDeviceBrandField = () => (
    <Autocomplete
      freeSolo
      options={['荣耀', '华为', '苹果', '小米', '红米', 'OPPO', 'vivo', '三星']}
      value={formState.values.brand || ''}
      inputValue={formState.values.brand || ''}
      onChange={(_event, value) => updateFormValue('brand', normalizeDeviceBrand(value || ''))}
      onInputChange={(_event, value, reason) => {
        if (reason !== 'reset') updateFormValue('brand', value);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          label="品牌"
          required
          helperText="选择标准品牌或自定义，如：荣耀"
          onBlur={() => updateFormValue('brand', normalizeDeviceBrand(formState.values.brand))}
        />
      )}
    />
  );

  const renderDeviceFields = () => (
    <>
      <BusinessFormSection step={1} solidStep title={ASSET_FORM_SECTIONS.device[0].title} summary={sectionSummary(['deviceCategory', 'deviceName', 'brand', 'model'], ASSET_FORM_SECTIONS.device[0].summary)} errorCount={sectionErrorCount(['deviceCategory', 'deviceName', 'brand', 'model']) + (formState.validationErrorSection === 1 ? 1 : 0)}>
        {renderSelectField('deviceCategory', '设备类型', ['手机', '平板', '电脑', '摄影设备', '其他'], { required: true })}
        {renderTextField('deviceName', '设备名称', { required: true })}
        {renderDeviceBrandField()}
        <TextField
          size="small"
          label="型号"
          value={formState.values.model || ''}
          onChange={(event) => updateFormValue('model', event.target.value)}
          helperText="填写厂商完整型号，如：HONOR 30 Pro"
          required
          fullWidth
        />
      </BusinessFormSection>
      <BusinessFormSection step={2} solidStep title={ASSET_FORM_SECTIONS.device[1].title} summary={sectionSummary(['serialNumber', 'communicationType', 'imei1', 'imei2'], ASSET_FORM_SECTIONS.device[1].summary)} errorCount={sectionErrorCount(formState.values.communicationType === '无SIM' ? ['communicationType'] : formState.values.communicationType === '双卡' ? ['communicationType', 'imei1', 'imei2'] : ['communicationType', 'imei1']) + (formState.validationErrorSection === 2 ? 1 : 0)}>
        {renderTextField('serialNumber', '序列号')}
        {renderSelectField('communicationType', '通信方式', ['无SIM', '单卡', '双卡', 'eSIM'], { required: true })}
        {formState.values.communicationType !== '无SIM' ? renderTextField('imei1', 'IMEI 1', { required: true }) : null}
        {formState.values.communicationType === '双卡' ? renderTextField('imei2', 'IMEI 2', { required: true }) : null}
      </BusinessFormSection>
      <BusinessFormSection step={3} solidStep title={ASSET_FORM_SECTIONS.device[2].title} summary={sectionSummary(['ownerSubject', 'department', 'owner', 'currentUser'], ASSET_FORM_SECTIONS.device[2].summary)} errorCount={sectionErrorCount(['ownerSubject'])}>
        {renderSelectField('ownerSubject', '所属主体', ['公司', '法人', '员工个人'], { required: true })}
        {renderDepartmentSelectField()}
        {renderUserSelectField('owner', '资产负责人')}
        {renderUserSelectField('currentUser', '当前使用人')}
      </BusinessFormSection>
      <BusinessFormSection step={4} solidStep title={ASSET_FORM_SECTIONS.device[3].title} summary={sectionSummary(['acquisitionType', 'purchaseAmount', 'monthlyRent', 'status'], ASSET_FORM_SECTIONS.device[3].summary)} errorCount={sectionErrorCount(['acquisitionType', 'status'])}>
        {renderSelectField('acquisitionType', '取得方式', ['购买', '租赁', '借用'], { required: true })}
        {formState.values.acquisitionType === '租赁' ? renderTextField('monthlyRent', '月租金', { type: 'number' }) : renderTextField('purchaseAmount', '购买金额', { type: 'number' })}
        {renderTextField('acquiredAt', '取得日期', { type: 'date' })}
        {renderTextField('warrantyExpiresAt', '保修到期日', { type: 'date' })}
        {renderSelectField('status', '设备状态', ['库存中', '使用中', '维修中', '闲置', '已停用', '已报废'], { required: true })}
        {renderTextField('remark', '备注', { multiline: true })}
      </BusinessFormSection>
    </>
  );

  const renderPhoneFields = () => (
    <>
      <BusinessFormSection step={1} solidStep title={ASSET_FORM_SECTIONS.phone[0].title} summary={sectionSummary(['phoneNumber', 'simForm', 'iccid', 'imsi'], ASSET_FORM_SECTIONS.phone[0].summary)} errorCount={sectionErrorCount(['phoneNumber', 'simForm']) + (formState.validationErrorSection === 1 ? 1 : 0)}>
        <TextField size="small" label="完整手机号" value={formState.values.phoneNumber || ''} onChange={(event) => updatePhoneNumberValue(event.target.value)} required fullWidth />
        {renderSelectField('simForm', 'SIM形态', ['实体SIM', 'eSIM'], { required: true })}
        {renderTextField('iccid', 'ICCID')}
        {renderTextField('imsi', 'IMSI')}
      </BusinessFormSection>
      <BusinessFormSection step={2} solidStep title={ASSET_FORM_SECTIONS.phone[1].title} summary={sectionSummary(['deviceId', 'slotType'], ASSET_FORM_SECTIONS.phone[1].summary)} errorCount={formState.validationErrorSection === 2 ? 1 : 0}>
      <FormControl size="small" fullWidth>
        <InputLabel>所属设备</InputLabel>
        <Select
          label="所属设备"
          value={formState.values.deviceId || ''}
          onChange={(event) => {
            const nextDeviceId = event.target.value;
            const nextSlots = phoneSlotOptionsForDevice(nextDeviceId);
            setFormState((current) => ({
              ...current,
              validationErrorSection: undefined,
              values: {
                ...current.values,
                deviceId: nextDeviceId,
                slotType: nextSlots.includes(current.values.slotType) ? current.values.slotType : nextSlots[0],
              },
            }));
          }}
        >
          <MenuItem value="">未选择</MenuItem>
          {lookupDevices.filter((device) => readDeviceCommunicationType(device) !== '无SIM').map((device) => (
            <MenuItem key={device.id} value={device.id}>{device.deviceCode} / {device.deviceName} / {readDeviceCommunicationType(device)}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl size="small" fullWidth required={Boolean(formState.values.deviceId)} disabled={!formState.values.deviceId}>
        <InputLabel>SIM卡槽</InputLabel>
        <Select
          label="SIM卡槽"
          value={phoneSlotOptionsForDevice(formState.values.deviceId).includes(formState.values.slotType) ? formState.values.slotType : ''}
          onChange={(event) => updateFormValue('slotType', event.target.value)}
          renderValue={(selected) => formatPhoneSlotImeiLabel(selected as '卡槽1' | '卡槽2', deviceById.get(formState.values.deviceId))}
        >
          {phoneSlotOptionsForDevice(formState.values.deviceId).map((option) => (
            <MenuItem key={option} value={option}>{formatPhoneSlotImeiLabel(option as '卡槽1' | '卡槽2', deviceById.get(formState.values.deviceId))}</MenuItem>
          ))}
        </Select>
        <Typography variant="caption" sx={{ color: shell.muted, mt: 0.5 }}>
          可先不绑定设备；单卡/eSIM 仅支持卡槽1。
        </Typography>
      </FormControl>
      </BusinessFormSection>
      <BusinessFormSection step={3} solidStep title={ASSET_FORM_SECTIONS.phone[2].title} summary={sectionSummary(['realNameSubject', 'realName', 'ownerSubject', 'department', 'owner'], ASSET_FORM_SECTIONS.phone[2].summary)} errorCount={sectionErrorCount(['ownerSubject'])}>
        {renderTextField('realNameSubject', '实名主体')}
        {renderTextField('realName', '实名信息')}
        {renderSelectField('ownerSubject', '所属主体', ['公司', '法人', '员工个人'], { required: true })}
        {renderDepartmentSelectField()}
        {renderUserSelectField('owner', '资产负责人')}
        {renderUserSelectField('currentUser', '当前使用人')}
      </BusinessFormSection>
      <BusinessFormSection step={4} solidStep title={ASSET_FORM_SECTIONS.phone[3].title} summary={sectionSummary(['operator', 'attributionLocation', 'servicePassword', 'packageName', 'monthlyFee', 'status'], ASSET_FORM_SECTIONS.phone[3].summary)} errorCount={sectionErrorCount(['status'])}>
        {renderSelectField('operator', '运营商', ['移动', '联通', '电信', '广电', '未知'])}
        {renderTextField('attributionLocation', '归属地')}
        <Box>
          <TextField
            size="small"
            label={formState.mode === 'edit' ? '新服务密码（留空不修改）' : '服务密码'}
            value={formState.values.servicePassword || ''}
            onChange={(event) => updateFormValue('servicePassword', event.target.value)}
            type="password"
            autoComplete="new-password"
            disabled={formState.values.clearServicePassword === 'true'}
            fullWidth
          />
          {formState.mode === 'edit' && formState.values.servicePasswordMasked ? (
            <FormControlLabel
              control={(
                <Checkbox
                  checked={formState.values.clearServicePassword === 'true'}
                  onChange={(event) => {
                    updateFormValue('clearServicePassword', event.target.checked ? 'true' : '');
                    if (event.target.checked) updateFormValue('servicePassword', '');
                  }}
                />
              )}
              label="清除已存服务密码"
            />
          ) : null}
        </Box>
        {renderTextField('packageName', '套餐名称')}
        {renderTextField('monthlyFee', '月费用', { type: 'number' })}
        {renderTextField('contractExpiresAt', '合约到期日', { type: 'date' })}
        {renderSelectField('status', '号码状态', ['待启用', '使用中', '停机保号', '已停用', '已注销'], { required: true })}
        {renderTextField('remark', '备注', { multiline: true })}
      </BusinessFormSection>
    </>
  );

  const renderIdentityAccountSelect = (
    platform: AssetIdentityAccountPlatform,
    fieldName: 'appleIdentityAccountId' | 'googleIdentityAccountId',
    label: string,
  ) => {
    const candidates = lookupAccounts.filter((account) => (
      account.platform === platform
      && account.id !== formState.id
      && !['异常', '封禁', '已注销'].includes(account.accountStatus)
      && readAccountControlStatus(account) === '已掌控'
    ));
    return (
      <FormControl size="small" fullWidth>
        <InputLabel>{label}</InputLabel>
        <Select
          label={label}
          value={formState.values[fieldName] || ''}
          onChange={(event) => updateFormValue(fieldName, event.target.value)}
          renderValue={(selected) => {
            const account = accountById.get(String(selected));
            return account ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <PlatformBrandMark platform={account.platform} size={24} />
                <Box>{account.accountName} / {displayAccountLogin(account)}</Box>
              </Stack>
            ) : '暂不绑定';
          }}
        >
          <MenuItem value="">暂不绑定</MenuItem>
          {candidates.map((account) => (
            <MenuItem key={account.id} value={account.id}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                <PlatformBrandMark platform={account.platform} size={28} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 850 }}>{account.accountName}</Typography>
                  <Typography variant="caption" sx={{ color: shell.muted }}>{displayAccountLogin(account)} / {account.currentUser || '未分配'}</Typography>
                </Box>
              </Stack>
            </MenuItem>
          ))}
          {!candidates.length ? <MenuItem value="__empty" disabled>暂无可绑定的{platform}，请先建档</MenuItem> : null}
        </Select>
      </FormControl>
    );
  };

  const renderAccountFields = () => (
    <>
      <BusinessFormSection step={1} solidStep title={ASSET_FORM_SECTIONS.account[0].title} summary={sectionSummary(['platform', 'accountCategory', 'accountName', 'loginAccount', 'realNameSubject'], ASSET_FORM_SECTIONS.account[0].summary)} errorCount={sectionErrorCount(['platform', 'accountCategory', 'accountName', 'loginAccount']) + (formState.validationErrorSection === 1 ? 1 : 0)}>
        {renderSelectField('platform', '业务平台', platformOptions, { required: true })}
        {renderSelectField('accountCategory', '账号类型', ['主账号', '员工号', '直播号', '投放号', '客服号', '其他'], { required: true })}
        {renderTextField('accountName', '账号名称', { required: true })}
        {renderTextField('loginAccount', '登录账号', { required: true })}
        {renderTextField('realNameSubject', '实名主体')}
        {renderTextField('realName', '实名信息')}
      </BusinessFormSection>
      <BusinessFormSection step={2} solidStep title={ASSET_FORM_SECTIONS.account[1].title} summary={sectionSummary(['loginMethod', 'loginPassword', 'paymentPassword', 'phoneId', 'appleIdentityAccountId', 'googleIdentityAccountId', 'twoFactorMethod'], ASSET_FORM_SECTIONS.account[1].summary)} errorCount={formState.validationErrorSection === 2 ? 1 : 0}>
        {renderSelectField('loginMethod', '登录方式', ['密码登录', '手机验证码', '扫码登录', 'SSO'], { required: true })}
        {formState.values.loginMethod === '密码登录' ? renderTextField('loginPassword', '登录密码', {
          type: 'password',
          required: formState.mode === 'create',
          helperText: formState.mode === 'edit' ? '留空表示不修改原登录密码' : '加密保存，仅授权人员可查看',
        }) : <Box />}
        <FormControlLabel
          control={<Checkbox checked={formState.values.requiresPaymentPassword === 'true'} onChange={(event) => updateFormValue('requiresPaymentPassword', event.target.checked ? 'true' : 'false')} />}
          label="该账号涉及支付，需要保存支付密码"
        />
        {formState.values.requiresPaymentPassword === 'true' ? renderTextField('paymentPassword', '支付密码', {
          type: 'password',
          required: formState.mode === 'create',
          helperText: formState.mode === 'edit' ? '留空表示不修改原支付密码' : '与登录密码独立加密保存',
        }) : <Box />}
      <FormControl size="small" fullWidth>
        <InputLabel>绑定手机号</InputLabel>
        <Select
          label="绑定手机号"
          value={formState.values.phoneId || ''}
          onChange={(event) => updateFormValue('phoneId', event.target.value)}
        >
          <MenuItem value="">暂不绑定</MenuItem>
          {lookupPhones.map((phone) => {
            const device = deviceById.get(phone.deviceId || '');
            return (
              <MenuItem key={phone.id} value={phone.id}>
                {displayPhoneNumber(phone)} / {device?.deviceCode || '未关联设备'} / {phone.slotType}
              </MenuItem>
            );
          })}
        </Select>
      </FormControl>
        {formState.values.platform !== 'Apple ID'
          ? renderIdentityAccountSelect('Apple ID', 'appleIdentityAccountId', '绑定 Apple ID')
          : <Box />}
        {formState.values.platform !== 'Google账号'
          ? renderIdentityAccountSelect('Google账号', 'googleIdentityAccountId', '绑定 Google 账号')
          : <Box />}
        {renderTextField('boundEmail', '绑定邮箱')}
        {renderTextField('twoFactorMethod', '二次验证方式')}
      </BusinessFormSection>
      <BusinessFormSection step={3} solidStep title={ASSET_FORM_SECTIONS.account[2].title} summary={sectionSummary(['ownerSubject', 'department', 'owner', 'currentUser'], ASSET_FORM_SECTIONS.account[2].summary)} errorCount={sectionErrorCount(['ownerSubject'])}>
        {renderSelectField('ownerSubject', '所属主体', ['公司', '法人', '员工个人'], { required: true })}
        {renderDepartmentSelectField()}
        {renderUserSelectField('owner', '资产负责人')}
        {renderUserSelectField('currentUser', '当前使用人')}
        {renderTextField('serviceProvider', '外部服务商')}
      </BusinessFormSection>
      <BusinessFormSection step={4} solidStep title={ASSET_FORM_SECTIONS.account[3].title} summary={sectionSummary(['businessScene', 'controlStatus', 'monthlyFee', 'accountStatus'], ASSET_FORM_SECTIONS.account[3].summary)} errorCount={sectionErrorCount(['controlStatus', 'accountStatus'])}>
        {renderTextField('businessScene', '业务场景')}
        {renderSelectField('controlStatus', '账号控制权', ['已掌控', '待交接', '离职待回收', '已回收'], { required: true })}
        {renderTextField('monthlyFee', '月费用', { type: 'number' })}
        {renderTextField('expiresAt', '到期日', { type: 'date' })}
        {renderSelectField('accountStatus', '账号状态', ['使用中', '闲置', '异常', '封禁', '已注销'], { required: true })}
        {renderTextField('purpose', '用途', { multiline: true })}
        {renderTextField('remark', '备注', { multiline: true })}
      </BusinessFormSection>
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
      <ProtectedFormDialog
        open={formState.open && canEditAssetType(formState.type)}
        onClose={closeForm}
        submitting={loading}
        resetKey={`${formState.type}:${formState.mode}:${formState.id || 'new'}`}
        markButtonClicksDirty={false}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{ sx: { maxHeight: { xs: '100%', sm: '92vh' }, m: { xs: 0, sm: 2 }, borderRadius: { xs: 0, sm: 2 } } }}
      >
        {({ requestClose }) => <>
          <DialogCloseTitle onClose={() => void requestClose()} sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>{title}</Typography>
              <Typography variant="body2" sx={{ color: shell.muted, mt: 0.25 }}>
                分段录入资产身份、绑定关系与管理责任，保存后统一进入资产台账。
              </Typography>
            </Box>
          </DialogCloseTitle>
          <DialogContent dividers sx={{ bgcolor: '#F8FAFC', p: { xs: 1.5, sm: 2.5 } }}>
            <Box sx={{ pt: 0.25 }}>
            {formState.type === 'device' && renderDeviceFields()}
            {formState.type === 'phone' && renderPhoneFields()}
            {formState.type === 'account' && renderAccountFields()}
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, borderTop: `1px solid ${shell.softLine}`, bgcolor: '#fff' }}>
            <Button onClick={() => void requestClose()} disabled={loading}>取消</Button>
            {canEditAssetType(formState.type) ? <Button variant="contained" onClick={submitForm} disabled={loading}>保存</Button> : null}
          </DialogActions>
        </>}
      </ProtectedFormDialog>
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
            {isConfigurableAssetTab(activeTab) && canEditAssetType(ASSET_CREATE_TYPES[activeTab]) ? (
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
      <Dialog open={Boolean(deleteTarget) && Boolean(deleteTarget && canDeleteAssetType(deleteTarget.type))} onClose={closeDeleteConfirm} maxWidth="xs" fullWidth>
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
          {deleteTarget && canDeleteAssetType(deleteTarget.type) ? <Button color="error" variant="contained" onClick={submitDelete}>确认删除</Button> : null}
        </DialogActions>
      </Dialog>
      {feedbackDialog}
    </ModulePage>
  );
};

export default AssetManagement;
