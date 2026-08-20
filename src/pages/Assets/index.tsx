import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Drawer,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
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
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TuneIcon from '@mui/icons-material/Tune';
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
  AssetFilterOptions,
  AssetImportResult,
  AssetImportType,
  AssetInternetAccount,
  AssetInternetAccountInput,
  AssetMatrixPublishTaskInput,
  AssetOverviewRelationshipRow,
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
import DeviceBrandMark from './DeviceBrandMark';
import CarrierBrandMark from './CarrierBrandMark';
import {
  findIdentityAccountForProvider,
  normalizeIdentityAccountIds,
  type AssetIdentityAccountPlatform,
} from '../../domain/assets/accountIdentityBindings';
import { normalizeAccountLoginDeviceIds } from '../../domain/assets/accountDeviceBindings';
import { groupAssetHandoverTasks } from '../../domain/assets/assetGovernance';

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

type DeviceAccountDrawerState = {
  open: boolean;
  deviceId?: string;
  device?: AssetDevice;
  items: AssetInternetAccount[];
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  error?: string;
};

const emptyDeviceAccountDrawer: DeviceAccountDrawerState = {
  open: false,
  items: [],
  page: 0,
  pageSize: 10,
  total: 0,
  loading: false,
};

const ASSET_TABS: Array<{ value: AssetTab; label: string; permissionKey: string }> = [
  { value: 'overview', label: '资产总览', permissionKey: PERMISSION_KEYS.ASSETS_OVERVIEW },
  { value: 'devices', label: '设备资产', permissionKey: PERMISSION_KEYS.ASSETS_DEVICES },
  { value: 'phones', label: '手机号资产', permissionKey: PERMISSION_KEYS.ASSETS_PHONES },
  { value: 'accounts', label: '互联网账号', permissionKey: PERMISSION_KEYS.ASSETS_ACCOUNTS },
  { value: 'matrix', label: '发布批次', permissionKey: PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH },
  { value: 'logs', label: '操作日志', permissionKey: PERMISSION_KEYS.ASSETS_LOGS },
  { value: 'offboarding', label: '资产交接', permissionKey: PERMISSION_KEYS.ASSETS_OFFBOARDING },
];

const CONFIGURABLE_ASSET_TABS = new Set<AssetTab>(['devices', 'phones', 'accounts']);

const ASSET_ACTION_COLUMN_WIDTH = 132;
const ASSET_LOOKUP_PAGE_SIZE = 500;
const IDENTITY_ACCOUNT_LOOKUP_PAGE_SIZE = 50;

const readAssetText = (asset: unknown, keys: string[], fallback: string): string => {
  const row = asset as Record<string, unknown>;
  const value = keys.map((key) => row[key]).find((item) => String(item || '').trim());
  return value === undefined || value === null ? fallback : String(value);
};

const readFormIdList = (value: string | undefined): string[] => {
  if (!value) return [];
  try {
    return normalizeAccountLoginDeviceIds(JSON.parse(value));
  } catch {
    return [];
  }
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
  { id: 'deviceCategory', label: '设备类型', width: 110 },
  { id: 'brandModel', label: '品牌 / 型号', width: 200 },
  { id: 'imei', label: '卡槽 / IMEI', width: 250 },
  { id: 'simType', label: '对应手机号', width: 210 },
  { id: 'accountCount', label: '互联网账号', width: 120 },
  { id: 'department', label: '所属部门', width: 130 },
  { id: 'owner', label: '管理责任人', width: 130 },
  { id: 'currentUser', label: '当前使用人', width: 130 },
  { id: 'status', label: '状态', width: 100 },
];
const DEFAULT_DEVICE_VISIBLE_COLUMN_IDS = DEVICE_COLUMNS.map((column) => column.id);

const PHONE_COLUMNS: AssetColumnConfig[] = [
  { id: 'phoneNumber', label: '手机号', width: 140 },
  { id: 'realName', label: '实名信息', width: 110 },
  { id: 'operator', label: '运营商', width: 130 },
  { id: 'attributionLocation', label: '归属地', width: 110 },
  { id: 'device', label: '所属设备', width: 180 },
  { id: 'accounts', label: '关联账号', width: 150 },
  { id: 'slotType', label: '卡槽', width: 100 },
  { id: 'packageName', label: '套餐', width: 140 },
  { id: 'monthlyFee', label: '月费用', width: 110 },
  { id: 'department', label: '所属部门', width: 130 },
  { id: 'owner', label: '管理责任人', width: 130 },
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
  { id: 'device', label: '登录设备', width: 240 },
  { id: 'owner', label: '账号负责人', width: 130 },
  { id: 'permissionStatus', label: '控制权状态', width: 140 },
];
const DEFAULT_ACCOUNT_VISIBLE_COLUMN_IDS = ACCOUNT_COLUMNS.map((column) => column.id);

const ASSET_VIEW_STORAGE_KEYS: Record<ConfigurableAssetTab, string> = {
  devices: 'aaos_asset_devices_table_view_v5',
  phones: 'aaos_asset_phones_table_view_v6',
  accounts: 'aaos_asset_accounts_table_view_v8',
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

const ADVANCED_ASSET_FILTER_KEYS = [
  'brand', 'communicationType', 'acquisitionType', 'operator', 'attributionLocation',
  'simForm', 'accountCategory', 'departmentId', 'ownerId', 'currentUserId',
  'userAssignment', 'phoneBinding', 'deviceBinding', 'loginDeviceBinding',
  'accountBinding', 'identityBinding', 'credentialStatus', 'twoFactorStatus',
  'servicePasswordStatus', 'riskLevel', 'packageName', 'contractStatus', 'monthlyFeeMin', 'monthlyFeeMax',
] as const satisfies ReadonlyArray<keyof AssetFilters>;

type AdvancedAssetFilterKey = typeof ADVANCED_ASSET_FILTER_KEYS[number];
type AdvancedAssetFilters = Pick<AssetFilters, AdvancedAssetFilterKey>;

const EMPTY_ASSET_FILTER_OPTIONS: AssetFilterOptions = {
  deviceCategories: [], brands: [], communicationTypes: [], acquisitionTypes: [], statuses: [],
  operators: [], attributionLocations: [], simForms: [], packageNames: [], platforms: [],
  controlStatuses: [], accountCategories: [], departments: [], owners: [], currentUsers: [], loginDevices: [],
};

function readAdvancedAssetFilters(searchParams: URLSearchParams): AdvancedAssetFilters {
  return ADVANCED_ASSET_FILTER_KEYS.reduce((result, key) => {
    const value = searchParams.get(key);
    if (value) (result as Record<string, string>)[key] = value;
    return result;
  }, {} as AdvancedAssetFilters);
}

const AssetManagement: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = getTabFromSearch(searchParams.get('tab'));
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get('search') || '');
  const [platform, setPlatform] = useState(() => searchParams.get('platform') || '');
  const [permissionStatus, setPermissionStatus] = useState(() => searchParams.get('permissionStatus') || '');
  const [status, setStatus] = useState(() => searchParams.get('status') || '');
  const [deviceCategory, setDeviceCategory] = useState(() => searchParams.get('deviceCategory') || '');
  const [profileStatus, setProfileStatus] = useState<AssetFilters['profileStatus'] | ''>(() => (searchParams.get('profileStatus') || '') as AssetFilters['profileStatus'] | '');
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedAssetFilters>(() => readAdvancedAssetFilters(searchParams));
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState<AssetFilterOptions>(EMPTY_ASSET_FILTER_OPTIONS);
  const skipNextFilterUrlWriteRef = useRef(false);
  const currentFilterSnapshotRef = useRef('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [overviewSearch, setOverviewSearch] = useState('');
  const [overviewPage, setOverviewPage] = useState(0);
  const [overviewRowsPerPage, setOverviewRowsPerPage] = useState(10);
  const [overviewRelationships, setOverviewRelationships] = useState<AssetOverviewRelationshipRow[]>([]);
  const [overviewRelationshipTotal, setOverviewRelationshipTotal] = useState(0);
  const [overviewRelationshipsLoading, setOverviewRelationshipsLoading] = useState(false);
  const [overviewRelationshipsError, setOverviewRelationshipsError] = useState('');
  const [overviewRefreshToken, setOverviewRefreshToken] = useState(0);
  const { alert: showSystemAlert, dialog: feedbackDialog } = useAppFeedback();
  const showFeedback = (message: React.ReactNode, title = '提示') => {
    void showSystemAlert(message, title);
  };
  const [platformOptions, setPlatformOptions] = useState<string[]>(() => assetApi.getAccountPlatformOptions());
  const [lookupDevices, setLookupDevices] = useState<AssetDevice[]>([]);
  const [lookupPhones, setLookupPhones] = useState<AssetPhoneNumber[]>([]);
  const [lookupAccounts, setLookupAccounts] = useState<AssetInternetAccount[]>([]);
  const [identityAccountCandidates, setIdentityAccountCandidates] = useState<AssetInternetAccount[]>([]);
  const [lookupUsers, setLookupUsers] = useState<User[]>([]);
  const [lookupDepartments, setLookupDepartments] = useState<Department[]>([]);
  const [formState, setFormState] = useState<AssetFormState>(emptyForm);
  const [visiblePasswordFields, setVisiblePasswordFields] = useState<Record<string, boolean>>({});
  const [importState, setImportState] = useState<AssetImportState>(emptyImportState);
  const [matrixForm, setMatrixForm] = useState<MatrixPublishFormState>(emptyMatrixPublishForm);
  const [deleteTarget, setDeleteTarget] = useState<AssetDeleteTarget>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailSaveNotice, setDetailSaveNotice] = useState('');
  const [showAllPhoneRelatedAccounts, setShowAllPhoneRelatedAccounts] = useState(false);
  const [deviceAccountDrawer, setDeviceAccountDrawer] = useState<DeviceAccountDrawerState>(emptyDeviceAccountDrawer);
  const [loginDeviceFilterContext, setLoginDeviceFilterContext] = useState<AssetDevice>();
  const [returnToDeviceAccountDrawer, setReturnToDeviceAccountDrawer] = useState(false);
  const deviceAccountDrawerRequestId = useRef(0);
  const [viewSettingsOpen, setViewSettingsOpen] = useState<ConfigurableAssetTab | null>(null);
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  currentFilterSnapshotRef.current = JSON.stringify({ search, platform, permissionStatus, status, deviceCategory, profileStatus, advancedFilters });

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
    error: assetError,
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
    completeOffboardingTask,
    revealSensitiveField,
    importAssetsFromCsv,
    clearDetail,
  } = useAssetStore();
  const canRevealSensitive = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_SENSITIVE_VIEW, 'read');
  const canImportExport = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_IMPORT_EXPORT, 'write');
  const canReadDevices = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_DEVICES, 'read');
  const canReadPhones = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_PHONES, 'read');
  const canReadAccounts = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_ACCOUNTS, 'read');
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
  const handoverGroups = useMemo(() => groupAssetHandoverTasks(offboardingTasks), [offboardingTasks]);
  const canManageMatrixPublish = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH, 'write');
  const visibleTabs = useMemo(
    () => ASSET_TABS.filter((tab) => hasPermission(currentUser, tab.permissionKey)),
    [currentUser],
  );
  const activeTabVisible = visibleTabs.some((tab) => tab.value === activeTab);
  const loginDeviceIdFilter = activeTab === 'accounts' ? searchParams.get('loginDeviceId') || '' : '';
  const bindingStatusFilter = activeTab === 'devices' || activeTab === 'phones' || activeTab === 'accounts'
    ? (searchParams.get('bindingStatus') || '') as AssetFilters['bindingStatus'] | ''
    : '';

  const filters = useMemo<AssetFilters>(() => ({
    search: debouncedSearch,
    platform,
    permissionStatus,
    status,
    deviceCategory: deviceCategory || undefined,
    profileStatus: profileStatus || undefined,
    ...advancedFilters,
    loginDeviceId: loginDeviceIdFilter || undefined,
    bindingStatus: bindingStatusFilter || undefined,
    page: page + 1,
    pageSize: rowsPerPage,
  }), [advancedFilters, bindingStatusFilter, debouncedSearch, deviceCategory, loginDeviceIdFilter, page, permissionStatus, platform, profileStatus, rowsPerPage, status]);

  const deviceById = useMemo(() => new Map(lookupDevices.map((device) => [device.id, device])), [lookupDevices]);
  const phoneById = useMemo(() => new Map(lookupPhones.map((phone) => [phone.id, phone])), [lookupPhones]);
  const accountById = useMemo(() => new Map(
    [...lookupAccounts, ...identityAccountCandidates, ...(detail?.relatedAccounts || [])]
      .map((account) => [account.id, account]),
  ), [detail?.relatedAccounts, identityAccountCandidates, lookupAccounts]);
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
      normalizeAccountLoginDeviceIds(account.loginDeviceIds).forEach((deviceId) => {
        const list = map.get(deviceId) || [];
        list.push(account);
        map.set(deviceId, list);
      });
    });
    return map;
  }, [lookupAccounts]);
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
    void Promise.all([
      assetApi.fetchInternetAccounts({ platform: 'Apple ID', pageSize: IDENTITY_ACCOUNT_LOOKUP_PAGE_SIZE }),
      assetApi.fetchInternetAccounts({ platform: 'Google账号', pageSize: IDENTITY_ACCOUNT_LOOKUP_PAGE_SIZE }),
    ]).then((results) => setIdentityAccountCandidates(results.flatMap((res) => res.code === 0 ? res.data.items : [])));
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
    setDeviceAccountDrawer(emptyDeviceAccountDrawer);
    setReturnToDeviceAccountDrawer(false);
    setViewSettingsOpen(null);
    clearDetail();
    setPage(0);
  }, [activeTab, clearDetail]);

  useEffect(() => {
    if (activeTab !== 'devices' && activeTab !== 'phones' && activeTab !== 'accounts') {
      setFilterOptions(EMPTY_ASSET_FILTER_OPTIONS);
      return;
    }
    let active = true;
    void assetApi.fetchAssetFilterOptions(activeTab).then((response) => {
      if (active && response.code === 0) setFilterOptions(response.data);
    });
    return () => { active = false; };
  }, [activeTab, overviewRefreshToken]);

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
  }, [search, platform, permissionStatus, status, deviceCategory, profileStatus, advancedFilters, loginDeviceIdFilter, bindingStatusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const nextSearch = searchParams.get('search') || '';
    const nextAdvanced = readAdvancedAssetFilters(searchParams);
    const nextSnapshot = JSON.stringify({
      search: nextSearch,
      platform: searchParams.get('platform') || '',
      permissionStatus: searchParams.get('permissionStatus') || '',
      status: searchParams.get('status') || '',
      deviceCategory: searchParams.get('deviceCategory') || '',
      profileStatus: searchParams.get('profileStatus') || '',
      advancedFilters: nextAdvanced,
    });
    if (nextSnapshot === currentFilterSnapshotRef.current) return;
    skipNextFilterUrlWriteRef.current = true;
    setSearch(nextSearch);
    setPlatform(searchParams.get('platform') || '');
    setPermissionStatus(searchParams.get('permissionStatus') || '');
    setStatus(searchParams.get('status') || '');
    setDeviceCategory(searchParams.get('deviceCategory') || '');
    setProfileStatus((searchParams.get('profileStatus') || '') as AssetFilters['profileStatus'] | '');
    setAdvancedFilters((current) => JSON.stringify(current) === JSON.stringify(nextAdvanced) ? current : nextAdvanced);
  }, [searchParams]);

  useEffect(() => {
    if (skipNextFilterUrlWriteRef.current) {
      skipNextFilterUrlWriteRef.current = false;
      return;
    }
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      const write = (key: string, value?: string) => value ? next.set(key, value) : next.delete(key);
      write('search', search.trim());
      write('platform', platform);
      write('permissionStatus', permissionStatus);
      write('status', status);
      write('deviceCategory', deviceCategory);
      write('profileStatus', profileStatus || '');
      ADVANCED_ASSET_FILTER_KEYS.forEach((key) => write(key, String(advancedFilters[key] || '')));
      return next.toString() === current.toString() ? current : next;
    }, { replace: true });
  }, [advancedFilters, deviceCategory, permissionStatus, platform, profileStatus, search, setSearchParams, status]);

  useEffect(() => {
    if (!activeTabVisible || activeTab !== 'overview') return;
    let active = true;
    setOverviewRelationshipsLoading(true);
    setOverviewRelationshipsError('');
    void assetApi.fetchOverviewRelationships({
      search: overviewSearch,
      page: overviewPage + 1,
      pageSize: overviewRowsPerPage,
    }).then((response) => {
      if (!active) return;
      if (response.code !== 0) throw new Error(response.message || '加载资产关系失败');
      const lastAvailablePage = Math.max(0, response.data.pagination.totalPages - 1);
      if (overviewPage > lastAvailablePage) {
        setOverviewPage(lastAvailablePage);
        return;
      }
      setOverviewRelationships(response.data.items);
      setOverviewRelationshipTotal(response.data.pagination.total);
    }).catch((requestError: unknown) => {
      if (!active) return;
      setOverviewRelationships([]);
      setOverviewRelationshipTotal(0);
      setOverviewRelationshipsError(requestError instanceof Error ? requestError.message : '加载资产关系失败');
    }).finally(() => {
      if (active) setOverviewRelationshipsLoading(false);
    });
    return () => { active = false; };
  }, [activeTab, activeTabVisible, overviewPage, overviewRefreshToken, overviewRowsPerPage, overviewSearch]);

  const handleTabChange = (_: React.SyntheticEvent, value: AssetTab) => {
    setSearch('');
    setPlatform('');
    setPermissionStatus('');
    setStatus('');
    setDeviceCategory('');
    setProfileStatus('');
    setAdvancedFilters({});
    setMoreFiltersOpen(false);
    setPage(0);
    setSearchParams({ tab: value });
  };

  const setAdvancedFilter = (key: AdvancedAssetFilterKey, value: string) => {
    setAdvancedFilters((current) => ({ ...current, [key]: value || undefined }));
  };

  const clearAllAssetFilters = () => {
    setSearch('');
    setPlatform('');
    setPermissionStatus('');
    setStatus('');
    setDeviceCategory('');
    setProfileStatus('');
    setAdvancedFilters({});
    setLoginDeviceFilterContext(undefined);
    setPage(0);
    setSearchParams({ tab: activeTab });
  };

  const clearLoginDeviceFilter = () => {
    setPage(0);
    setLoginDeviceFilterContext(undefined);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('loginDeviceId');
      return next;
    });
  };

  const openOverviewTarget = (tab: Extract<AssetTab, 'devices' | 'phones' | 'accounts'>, next: {
    status?: string;
    bindingStatus?: AssetFilters['bindingStatus'];
  } = {}) => {
    setSearch('');
    setPlatform('');
    setPermissionStatus('');
    setStatus(next.status || '');
    setDeviceCategory('');
    setProfileStatus('');
    setAdvancedFilters({});
    setPage(0);
    const params: Record<string, string> = { tab };
    if (next.bindingStatus) params.bindingStatus = next.bindingStatus;
    setSearchParams(params);
  };

  const refreshLookupData = async () => {
    const [deviceRes, phoneRes, accountRes, appleRes, googleRes] = await Promise.all([
      assetApi.fetchDevices({ pageSize: ASSET_LOOKUP_PAGE_SIZE }),
      assetApi.fetchPhoneNumbers({ pageSize: ASSET_LOOKUP_PAGE_SIZE }),
      assetApi.fetchInternetAccounts({ pageSize: ASSET_LOOKUP_PAGE_SIZE }),
      assetApi.fetchInternetAccounts({ platform: 'Apple ID', pageSize: IDENTITY_ACCOUNT_LOOKUP_PAGE_SIZE }),
      assetApi.fetchInternetAccounts({ platform: 'Google账号', pageSize: IDENTITY_ACCOUNT_LOOKUP_PAGE_SIZE }),
    ]);
    if (deviceRes.code === 0) setLookupDevices(deviceRes.data.items);
    if (phoneRes.code === 0) setLookupPhones(phoneRes.data.items);
    if (accountRes.code === 0) setLookupAccounts(accountRes.data.items);
    setIdentityAccountCandidates([appleRes, googleRes].flatMap((res) => res.code === 0 ? res.data.items : []));
    const directoryRes = await settingsApi.fetchAssignableDirectory();
    if (directoryRes.code === 0) {
      setLookupUsers(directoryRes.data.users);
      setLookupDepartments(directoryRes.data.departments);
    }
    if (activeTab === 'devices' || activeTab === 'phones' || activeTab === 'accounts') {
      const optionRes = await assetApi.fetchAssetFilterOptions(activeTab);
      if (optionRes.code === 0) setFilterOptions(optionRes.data);
    }
    setPlatformOptions(assetApi.getAccountPlatformOptions());
  };

  const refreshActiveTab = async () => {
    await fetchDashboard();
    if (activeTab === 'overview') setOverviewRefreshToken((value) => value + 1);
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
      showFeedback('当前账号没有发布批次权限');
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
      showFeedback('当前账号没有发布批次权限');
      return;
    }
    const result = await createMatrixPublishTask({
      ...matrixForm.values,
      dueAt: matrixForm.values.dueAt ? new Date(matrixForm.values.dueAt).toISOString() : '',
    });
    if (!result) {
      showFeedback(useAssetStore.getState().error || '创建发布批次失败');
      return;
    }
    closeMatrixPublishDialog();
    showFeedback('发布批次已创建，执行任务已进入员工任务中心');
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
    setVisiblePasswordFields({});
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

  const openEditForm = async (type: AssetFormType, item: AssetDevice | AssetPhoneNumber | AssetInternetAccount) => {
    if (!canEditAssetType(type)) {
      showFeedback('当前账号没有编辑资产权限');
      return;
    }
    setVisiblePasswordFields({});
    const values = Object.entries(item).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = String(value ?? '');
      return acc;
    }, {});
    if (type === 'phone') values.servicePassword = '';
    if (type === 'account') {
      const account = item as AssetInternetAccount;
      const linkedIds = normalizeIdentityAccountIds(account.identityAccountIds);
      const missingIds = linkedIds.filter((id) => !accountById.has(id));
      const fetchedRows = (await Promise.all(missingIds.map(async (id) => {
        const response = await assetApi.fetchInternetAccounts({ search: id, page: 1, pageSize: 10 });
        return response.code === 0 ? response.data.items.filter((candidate) => candidate.id === id) : [];
      }))).flat();
      if (fetchedRows.length) {
        setIdentityAccountCandidates((current) => Array.from(
          new Map([...current, ...fetchedRows].map((candidate) => [candidate.id, candidate])).values(),
        ));
      }
      const accountPool = Array.from(new Map(
        [...lookupAccounts, ...identityAccountCandidates, ...fetchedRows].map((candidate) => [candidate.id, candidate]),
      ).values());
      values.loginPassword = '';
      values.paymentPassword = '';
      values.requiresPaymentPassword = account.requiresPaymentPassword ? 'true' : 'false';
      values.loginDeviceIds = JSON.stringify(normalizeAccountLoginDeviceIds(account.loginDeviceIds));
      values.appleIdentityAccountId = findIdentityAccountForProvider(account, accountPool, 'Apple ID')?.id || '';
      values.googleIdentityAccountId = findIdentityAccountForProvider(account, accountPool, 'Google账号')?.id || '';
    }
    setFormState({ open: true, type, mode: 'edit', id: item.id, values: normalizeAssetFormValues(values), validationAttempted: false });
  };

  const closeForm = () => {
    setVisiblePasswordFields({});
    setFormState(emptyForm);
  };

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
        loginDeviceIds: _loginDeviceIds,
        ...accountValues
      } = formState.values;
      const input = {
        ...accountValues,
        loginDeviceIds: readFormIdList(formState.values.loginDeviceIds),
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

  const openDetail = (type: AssetType, id: string, options?: { returnToDeviceAccounts?: boolean }) => {
    setReturnToDeviceAccountDrawer(Boolean(options?.returnToDeviceAccounts));
    setShowAllPhoneRelatedAccounts(false);
    setDetailDialogOpen(true);
    fetchDetail(type, id);
  };

  const openAccountPhoneDetail = (phoneId?: string) => {
    if (!phoneId) return;
    setReturnToDeviceAccountDrawer(false);
    setDetailDialogOpen(true);
    fetchDetail('phone', phoneId);
  };

  const closeDetailDialog = () => {
    setDetailDialogOpen(false);
    clearDetail();
    if (returnToDeviceAccountDrawer) {
      setDeviceAccountDrawer((current) => ({ ...current, open: true }));
    }
    setReturnToDeviceAccountDrawer(false);
  };

  const loadDeviceAccountDrawer = async (deviceId: string, nextPage = 0, nextPageSize = 10) => {
    const requestId = ++deviceAccountDrawerRequestId.current;
    setDeviceAccountDrawer((current) => ({
      ...current,
      deviceId,
      page: nextPage,
      pageSize: nextPageSize,
      loading: true,
      error: undefined,
    }));
    let response;
    try {
      response = await assetApi.fetchInternetAccounts({
        loginDeviceId: deviceId,
        page: nextPage + 1,
        pageSize: nextPageSize,
      });
    } catch (error: any) {
      if (requestId !== deviceAccountDrawerRequestId.current) return;
      setDeviceAccountDrawer((current) => ({
        ...current,
        loading: false,
        error: error?.message || '网络异常，加载互联网账号失败',
      }));
      return;
    }
    if (requestId !== deviceAccountDrawerRequestId.current) return;
    if (response.code !== 0) {
      setDeviceAccountDrawer((current) => ({ ...current, loading: false, error: response.message || '加载互联网账号失败' }));
      return;
    }
    setDeviceAccountDrawer((current) => ({
      ...current,
      items: response.data.items,
      total: response.data.pagination.total,
      page: Math.max(0, response.data.pagination.page - 1),
      pageSize: response.data.pagination.pageSize,
      loading: false,
      error: undefined,
    }));
  };

  const openDeviceAccountDrawer = (device: AssetDevice) => {
    setReturnToDeviceAccountDrawer(false);
    setDeviceAccountDrawer({ ...emptyDeviceAccountDrawer, open: true, deviceId: device.id, device, loading: true });
    void loadDeviceAccountDrawer(device.id);
  };

  const closeDeviceAccountDrawer = () => {
    deviceAccountDrawerRequestId.current += 1;
    setDeviceAccountDrawer((current) => ({ ...current, open: false, loading: false }));
  };

  const openAccountDetailFromDeviceDrawer = (accountId: string) => {
    setDeviceAccountDrawer((current) => ({ ...current, open: false }));
    openDetail('account', accountId, { returnToDeviceAccounts: true });
  };

  const goToDeviceAccounts = () => {
    const deviceId = deviceAccountDrawer.deviceId;
    if (!deviceId) return;
    closeDeviceAccountDrawer();
    setPage(0);
    setLoginDeviceFilterContext(deviceAccountDrawer.device);
    setSearchParams({ tab: 'accounts', loginDeviceId: deviceId });
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

  const handleCompleteHandoverGroup = async (taskIds: string[]) => {
    if (!canHandleOffboarding) {
      showFeedback('当前账号没有处理资产交接权限');
      return;
    }
    for (const taskId of taskIds) await completeOffboardingTask(taskId);
    showFeedback(`已完成 ${taskIds.length} 个交接项`);
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
        互联网账号: device.internetAccountCount ?? (accountsByDeviceId.get(device.id) || []).length,
        所属部门: device.department,
        管理责任人: device.owner,
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
          管理责任人: phone.owner,
          当前使用人: phone.currentUser || '',
          状态: phone.status,
        };
      }),
      accounts: accounts.map((account) => {
        const phone = phoneById.get(account.phoneId || '');
        const loginDevices = normalizeAccountLoginDeviceIds(account.loginDeviceIds)
          .map((id) => deviceById.get(id))
          .filter((device): device is AssetDevice => Boolean(device));
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
          登录设备: loginDevices.map((device) => device.deviceCode).join(' / ') || '-',
          账号负责人: account.owner,
          主要使用人: account.currentUser || '',
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
        交接员工: task.employeeName,
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
    const canReadDevices = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_DEVICES, 'read');
    const canReadPhones = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_PHONES, 'read');
    const canReadAccounts = hasPermission(currentUser, PERMISSION_KEYS.ASSETS_ACCOUNTS, 'read');
    const categoryCards = [
      canReadDevices ? {
        key: 'devices', label: '设备资产', total: dashboard?.deviceSummary.total || 0, tone: shell.blue,
        cost: dashboard?.deviceSummary.monthlyCost || 0,
        actions: [
          { label: '使用中', value: dashboard?.deviceSummary.inUse || 0, onClick: () => openOverviewTarget('devices', { status: '使用中' }) },
          { label: '库存中', value: dashboard?.deviceSummary.inventory || 0, onClick: () => openOverviewTarget('devices', { status: '库存中' }) },
          { label: '未分配使用人', value: dashboard?.deviceSummary.unassignedUser || 0, onClick: () => openOverviewTarget('devices', { bindingStatus: 'unassigned-user' }) },
        ],
        onClick: () => openOverviewTarget('devices'),
      } : null,
      canReadPhones ? {
        key: 'phones', label: '手机号资产', total: dashboard?.phoneSummary.total || 0, tone: shell.green,
        cost: dashboard?.phoneSummary.monthlyCost || 0,
        actions: [
          { label: '已绑定设备', value: dashboard?.phoneSummary.boundDevice || 0, onClick: () => openOverviewTarget('phones', { bindingStatus: 'bound-device' }) },
          { label: '未绑定设备', value: dashboard?.phoneSummary.unboundDevice || 0, onClick: () => openOverviewTarget('phones', { bindingStatus: 'unbound-device' }) },
          { label: '使用中', value: dashboard?.phoneSummary.inUse || 0, onClick: () => openOverviewTarget('phones', { status: '使用中' }) },
        ],
        onClick: () => openOverviewTarget('phones'),
      } : null,
      canReadAccounts ? {
        key: 'accounts', label: '互联网账号', total: dashboard?.accountSummary.total || 0, tone: '#7C3AED',
        cost: dashboard?.accountSummary.monthlyCost || 0,
        actions: [
          { label: '有登录设备', value: dashboard?.accountSummary.withLoginDevice || 0, onClick: () => openOverviewTarget('accounts', { bindingStatus: 'with-login-device' }) },
          { label: '无登录设备', value: dashboard?.accountSummary.withoutLoginDevice || 0, onClick: () => openOverviewTarget('accounts', { bindingStatus: 'without-login-device' }) },
          { label: '密码待补齐', value: dashboard?.accountSummary.credentialPending || 0, onClick: () => openOverviewTarget('accounts', { bindingStatus: 'credential-pending' }) },
        ],
        onClick: () => openOverviewTarget('accounts'),
      } : null,
    ].filter(Boolean) as Array<{
      key: string;
      label: string;
      total: number;
      tone: string;
      cost: number;
      actions: Array<{ label: string; value: number; onClick: () => void }>;
      onClick: () => void;
    }>;
    const attentionItems = [
      canReadDevices ? { label: '设备未分配使用人', value: dashboard?.relationshipHealth.unassignedDevices || 0, onClick: () => openOverviewTarget('devices', { bindingStatus: 'unassigned-user' }) } : null,
      canReadPhones ? { label: '手机号未绑定设备', value: dashboard?.relationshipHealth.unboundPhones || 0, onClick: () => openOverviewTarget('phones', { bindingStatus: 'unbound-device' }) } : null,
      canReadAccounts ? { label: '账号无登录设备', value: dashboard?.relationshipHealth.accountsWithoutLoginDevice || 0, onClick: () => openOverviewTarget('accounts', { bindingStatus: 'without-login-device' }) } : null,
      canReadAccounts ? { label: '账号未绑定手机号', value: dashboard?.relationshipHealth.accountsWithoutPhone || 0, onClick: () => openOverviewTarget('accounts', { bindingStatus: 'unbound-phone' }) } : null,
      canReadAccounts ? { label: '账号密码待补齐', value: dashboard?.relationshipHealth.credentialPending || 0, onClick: () => openOverviewTarget('accounts', { bindingStatus: 'credential-pending' }) } : null,
    ].filter(Boolean) as Array<{ label: string; value: number; onClick: () => void }>;
    const renderPhoneBadges = (row: AssetOverviewRelationshipRow) => row.phones.length ? (
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {row.phones.map((phone) => (
          <Chip key={phone.id} size="small" label={`${phone.slotType || '卡槽'} ${displayPhoneNumber(phone)}`} onClick={() => openDetail('phone', phone.id)} sx={{ ...chipSx(toneSx('low')), cursor: 'pointer' }} />
        ))}
      </Stack>
    ) : <Typography variant="body2" sx={{ color: shell.amber, fontWeight: 800 }}>未绑定手机号</Typography>;
    const renderAccountBadges = (row: AssetOverviewRelationshipRow) => row.accounts.length ? (
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {row.accounts.slice(0, 3).map((account) => (
          <Chip
            key={account.id}
            size="small"
            avatar={<PlatformBrandMark platform={account.platform} size={20} />}
            label={`${account.platform} · ${account.accountName}`}
            onClick={() => openDetail('account', account.id)}
            sx={{ cursor: 'pointer', fontWeight: 800 }}
          />
        ))}
        {row.accounts.length > 3 ? <Chip size="small" label={`+${row.accounts.length - 3}`} onClick={() => openDeviceAccountDrawer(row.device)} sx={{ cursor: 'pointer', fontWeight: 800 }} /> : null}
      </Stack>
    ) : <Typography variant="body2" sx={{ color: shell.muted }}>暂无登录账号</Typography>;
    return (
      <Box sx={{ display: 'grid', gap: 2.25 }}>
        <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, p: { xs: 2, md: 2.5 }, background: 'linear-gradient(135deg, #F8FBFF 0%, #FFFFFF 55%, #F8F5FF 100%)' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 950 }}>资产驾驶舱</Typography>
              <Typography variant="body2" sx={{ color: shell.muted, mt: 0.25 }}>清楚查看设备、手机号与互联网账号，以及它们各自独立的绑定关系。</Typography>
            </Box>
            <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
              <Typography variant="caption" sx={{ color: shell.muted, fontWeight: 800 }}>当前月度费用</Typography>
              <Typography sx={{ color: shell.blue, fontWeight: 950, fontSize: 24 }}>{formatCurrency(dashboard?.monthlyCost || 0)}</Typography>
            </Box>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: `repeat(${Math.max(1, categoryCards.length)}, minmax(0, 1fr))` }, gap: 1.5 }}>
            {categoryCards.map((card) => (
              <Paper key={card.key} elevation={0} sx={{ border: `1px solid ${shell.softLine}`, borderTop: `4px solid ${card.tone}`, borderRadius: 1.25, p: 1.75, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Button onClick={card.onClick} sx={{ color: shell.ink, fontWeight: 950, px: 0, minWidth: 0 }}>{card.label}</Button>
                  <Typography sx={{ color: card.tone, fontWeight: 950, fontSize: 28 }}>{card.total}</Typography>
                </Stack>
                <Typography variant="caption" sx={{ color: shell.muted }}>月费用 {formatCurrency(card.cost)}</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.75, mt: 1.5 }}>
                  {card.actions.map((action) => (
                    <Box key={action.label} component="button" type="button" onClick={action.onClick} sx={{ border: 0, borderRadius: 1, bgcolor: '#F6F8FC', p: 0.9, cursor: 'pointer', textAlign: 'left', minWidth: 0, '&:hover': { bgcolor: '#EEF4FF' } }}>
                      <Typography sx={{ color: shell.ink, fontWeight: 950, fontSize: 18 }}>{action.value}</Typography>
                      <Typography variant="caption" sx={{ color: shell.muted, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{action.label}</Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>
            ))}
          </Box>
        </Paper>

        <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Box>
              <Typography sx={{ fontWeight: 950 }}>待关联与待处理</Typography>
              <Typography variant="body2" sx={{ color: shell.muted }}>点击关联问题直接进入对应台账，并自动带上筛选条件。</Typography>
            </Box>
            {hasPermission(currentUser, PERMISSION_KEYS.ASSETS_OFFBOARDING, 'read') ? (
              <Chip size="small" label={`待交接 ${dashboard?.relationshipHealth.offboarding || 0}`} onClick={() => setSearchParams({ tab: 'offboarding' })} sx={{ ...chipSx((dashboard?.relationshipHealth.offboarding || 0) ? toneSx('medium') : toneSx('low')), cursor: 'pointer' }} />
            ) : null}
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' }, gap: 1 }}>
            {attentionItems.map((item) => (
              <Box key={item.label} component="button" type="button" onClick={item.onClick} sx={{ border: `1px solid ${item.value ? '#FED7AA' : shell.softLine}`, bgcolor: item.value ? '#FFFBEB' : '#F8FAFC', borderRadius: 1, p: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}>
                <Typography variant="body2" sx={{ color: shell.muted, fontWeight: 800 }}>{item.label}</Typography>
                <Typography sx={{ color: item.value ? shell.amber : shell.green, fontWeight: 950, fontSize: 20 }}>{item.value}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>

        <Paper elevation={0} sx={{ ...moduleTablePaperSx, borderRadius: 1.5, overflow: 'hidden' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between" spacing={1.5} sx={{ p: 2, borderBottom: `1px solid ${shell.softLine}` }}>
            <Box>
              <Typography sx={{ fontWeight: 950 }}>资产关系明细</Typography>
              <Typography variant="body2" sx={{ color: shell.muted }}>卡槽手机号、账号验证手机号、账号登录设备是三组独立关系。</Typography>
            </Box>
            <TextField size="small" value={overviewSearch} onChange={(event) => { setOverviewSearch(event.target.value); setOverviewPage(0); }} placeholder="搜索设备、手机号或互联网账号" sx={{ width: { xs: '100%', md: 320 } }} />
          </Stack>
          {overviewRelationshipsError ? (
            <Stack alignItems="center" spacing={1} sx={{ py: 5 }}><Typography color="error">{overviewRelationshipsError}</Typography><Button onClick={() => setOverviewRefreshToken((value) => value + 1)}>重试</Button></Stack>
          ) : isMobile ? (
            <Box sx={{ display: 'grid', gap: 1, p: 1.5 }}>
              {overviewRelationships.map((row) => (
                <Paper key={row.device.id} elevation={0} sx={{ border: `1px solid ${shell.softLine}`, borderRadius: 1, p: 1.5 }}>
                  <Stack spacing={1.25}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
                      <Box><Typography variant="caption" sx={{ color: shell.muted }}>设备编号</Typography>{renderRelationLink(row.device.deviceCode, () => openDetail('device', row.device.id))}</Box>
                      <Box><Typography variant="caption" sx={{ color: shell.muted }}>设备名称</Typography><Typography variant="body2" sx={{ fontWeight: 800 }}>{row.device.deviceName || '未命名'}</Typography></Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: shell.muted }}>品牌 / 型号</Typography>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25, minWidth: 0 }}>
                          <DeviceBrandMark brand={row.device.brand} size={30} />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 800 }}>{normalizeDeviceBrand(row.device.brand) || '未录入品牌'}</Typography>
                            <Typography variant="caption" sx={{ color: shell.muted }}>{row.device.model || '未录入型号'}</Typography>
                          </Box>
                        </Stack>
                      </Box>
                      <Box><Typography variant="caption" sx={{ color: shell.muted }}>所属部门</Typography><Typography variant="body2">{row.device.department || '未填部门'}</Typography></Box>
                      <Box><Typography variant="caption" sx={{ color: shell.muted }}>管理责任人</Typography><Typography variant="body2">{row.device.owner || '未分配'}</Typography></Box>
                      <Box><Typography variant="caption" sx={{ color: shell.muted }}>当前使用人</Typography><Typography variant="body2">{row.device.currentUser || '未分配'}</Typography></Box>
                    </Box>
                    {renderPhoneBadges(row)}
                    {renderAccountBadges(row)}
                  </Stack>
                </Paper>
              ))}
            </Box>
          ) : (
            <TableContainer>
              <Table sx={{ ...moduleTableSx, minWidth: 1680 }}>
                <TableHead><TableRow><TableCell>设备编号</TableCell><TableCell>设备名称</TableCell><TableCell>品牌 / 型号</TableCell><TableCell>卡槽 / IMEI</TableCell><TableCell>对应手机号</TableCell><TableCell>登录互联网账号</TableCell><TableCell>所属部门</TableCell><TableCell>管理责任人</TableCell><TableCell>当前使用人</TableCell><TableCell>状态</TableCell></TableRow></TableHead>
                <TableBody>
                  {overviewRelationships.map((row) => (
                    <TableRow key={row.device.id} hover>
                      <TableCell>{renderRelationLink(row.device.deviceCode, () => openDetail('device', row.device.id))}</TableCell>
                      <TableCell><Typography variant="body2" sx={{ fontWeight: 800 }}>{row.device.deviceName || '未命名'}</Typography></TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                          <DeviceBrandMark brand={row.device.brand} size={34} />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 900 }}>{normalizeDeviceBrand(row.device.brand) || '未录入品牌'}</Typography>
                            <Typography variant="caption" sx={{ color: shell.muted, display: 'block', whiteSpace: 'nowrap' }}>{row.device.model || '未录入型号'}</Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>{renderDeviceImeis(row.device)}</TableCell>
                      <TableCell>{renderPhoneBadges(row)}</TableCell>
                      <TableCell>{renderAccountBadges(row)}</TableCell>
                      <TableCell><Typography variant="body2">{row.device.department || '未填部门'}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{row.device.owner || '未分配'}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{row.device.currentUser || '未分配'}</Typography></TableCell>
                      <TableCell><Chip size="small" label={row.device.status} sx={chipSx(statusTone(row.device.status))} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {!overviewRelationshipsLoading && !overviewRelationships.length && !overviewRelationshipsError ? <Typography sx={{ color: shell.muted, textAlign: 'center', py: 5 }}>暂无符合条件的资产关系</Typography> : null}
          {overviewRelationshipsLoading ? <Typography sx={{ color: shell.muted, textAlign: 'center', py: 3 }}>正在加载资产关系...</Typography> : null}
          <TablePagination
            component="div"
            count={overviewRelationshipTotal}
            page={overviewPage}
            rowsPerPage={overviewRowsPerPage}
            rowsPerPageOptions={[10, 20, 50]}
            onPageChange={(_, nextPage) => setOverviewPage(nextPage)}
            onRowsPerPageChange={(event) => { setOverviewRowsPerPage(Number(event.target.value)); setOverviewPage(0); }}
            labelRowsPerPage="每页条数"
            labelDisplayedRows={formatPaginationRows}
            sx={assetPaginationSx}
          />
        </Paper>
      </Box>
    );
  };

  const renderToolbar = () => {
    if (activeTab === 'overview') return null;
    const searchPlaceholderMap: Partial<Record<AssetTab, string>> = {
      devices: '搜索设备编号、设备名称、IMEI 1/2、负责人',
      phones: '搜索手机号、实名信息、归属地、所属设备',
      accounts: '搜索平台、账号名称、绑定手机号、登录设备',
      matrix: '搜索任务、账号、执行人',
      logs: '搜索操作、对象、操作人',
      offboarding: '搜索员工、资产名称或交接原因',
    };
    const statusOptionsMap: Partial<Record<AssetTab, string[]>> = {
      devices: ['库存中', '使用中', '维修中', '闲置', '已停用', '已报废'],
      phones: ['待启用', '使用中', '停机保号', '已停用', '已注销'],
      accounts: ['使用中', '闲置', '异常', '封禁', '已注销'],
      matrix: ['pending', 'completed'],
      offboarding: ['待回收', '已回收'],
    };
    const bindingStatusLabels: Partial<Record<NonNullable<AssetFilters['bindingStatus']>, string>> = {
      'unassigned-user': '未分配使用人',
      'bound-device': '已绑定设备',
      'unbound-device': '未绑定设备',
      'bound-phone': '已绑定手机号',
      'unbound-phone': '未绑定手机号',
      'with-login-device': '有登录设备',
      'without-login-device': '无登录设备',
      'credential-pending': '密码待补齐',
    };
    const isAssetLedger = activeTab === 'devices' || activeTab === 'phones' || activeTab === 'accounts';
    const option = (value: string, label = value) => ({ value, label });
    const renderSelect = (
      label: string,
      value: string,
      options: Array<{ value: string; label: string }>,
      onChange: (value: string) => void,
      minWidth = 140,
    ) => {
      const resolvedOptions = value && !options.some((item) => item.value === value)
        ? [{ value, label: value.replace(/^name:/, '') }, ...options]
        : options;
      return (
      <FormControl size="small" sx={{ minWidth, flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
        <InputLabel>{label}</InputLabel>
        <Select value={value} label={label} onChange={(event) => onChange(String(event.target.value))}>
          <MenuItem value="">全部</MenuItem>
          {resolvedOptions.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
        </Select>
      </FormControl>
      );
    };
    const moreFieldsByTab: Partial<Record<AssetTab, AdvancedAssetFilterKey[]>> = {
      devices: ['brand', 'communicationType', 'acquisitionType', ...(canReadPhones ? ['phoneBinding' as const] : []), 'userAssignment', ...(canReadAccounts ? ['loginDeviceBinding' as const] : []), 'departmentId', 'ownerId', 'currentUserId', 'riskLevel'],
      phones: ['attributionLocation', 'simForm', ...(canReadAccounts ? ['accountBinding' as const] : []), 'packageName', 'contractStatus', 'monthlyFeeMin', 'monthlyFeeMax', 'departmentId', 'ownerId', 'currentUserId', 'servicePasswordStatus'],
      accounts: ['accountCategory', ...(canReadPhones ? ['phoneBinding' as const] : []), ...(canReadDevices ? ['loginDeviceBinding' as const] : []), 'identityBinding', 'credentialStatus', 'twoFactorStatus', 'departmentId', 'ownerId', 'currentUserId'],
    };
    const moreFilterKeys = moreFieldsByTab[activeTab] || [];
    const moreFilterCount = moreFilterKeys.filter((key) => Boolean(advancedFilters[key])).length
      + (activeTab === 'accounts' && loginDeviceIdFilter ? 1 : 0);
    const filterLabels: Partial<Record<keyof AssetFilters, string>> = {
      brand: '品牌', communicationType: '通信方式', acquisitionType: '取得方式', userAssignment: '使用人',
      operator: '运营商', deviceBinding: '设备绑定',
      loginDeviceBinding: activeTab === 'devices' ? '登录账号' : '登录设备', departmentId: '部门', ownerId: '负责人',
      currentUserId: '当前使用人', riskLevel: '风险等级', attributionLocation: '归属地', simForm: 'SIM形态',
      accountBinding: '关联账号', servicePasswordStatus: '服务密码', accountCategory: '账号类型', phoneBinding: '绑定手机号',
      identityBinding: '身份账号', credentialStatus: '密码凭证', twoFactorStatus: '二次验证',
      packageName: '套餐', contractStatus: '合约到期', monthlyFeeMin: '最低月费', monthlyFeeMax: '最高月费',
    };
    const valueLabel = (key: keyof AssetFilters, value: string) => {
      if (key === 'departmentId') return filterOptions.departments.find((item) => item.value === value)?.label || value.replace(/^name:/, '');
      if (key === 'ownerId') return filterOptions.owners.find((item) => item.value === value)?.label || value.replace(/^name:/, '');
      if (key === 'currentUserId') return filterOptions.currentUsers.find((item) => item.value === value)?.label || value.replace(/^name:/, '');
      const labels: Record<string, string> = {
        assigned: '已分配', unassigned: '未分配', with: '有', without: '无', bound: '已绑定', unbound: '未绑定',
        configured: '已配置', unconfigured: '未配置', complete: '完整', incomplete: '待完善', pending: '待补齐',
        apple: 'Apple ID', google: 'Google账号', any: '任一身份账号', none: '未绑定',
      };
      return labels[value] || value;
    };
    const advancedContent = (
      <Box sx={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(150px, 1fr))', gap: 1.5 }}>
        {activeTab === 'devices' ? <>
          {renderSelect('品牌', String(advancedFilters.brand || ''), filterOptions.brands, (value) => setAdvancedFilter('brand', value))}
          {renderSelect('通信方式', String(advancedFilters.communicationType || ''), filterOptions.communicationTypes, (value) => setAdvancedFilter('communicationType', value))}
          {renderSelect('取得方式', String(advancedFilters.acquisitionType || ''), filterOptions.acquisitionTypes, (value) => setAdvancedFilter('acquisitionType', value))}
          {canReadPhones ? renderSelect('手机号绑定', String(advancedFilters.phoneBinding || ''), [option('bound', '有手机号'), option('unbound', '无手机号')], (value) => setAdvancedFilter('phoneBinding', value)) : null}
          {renderSelect('使用人', String(advancedFilters.userAssignment || ''), [option('assigned', '已分配'), option('unassigned', '未分配')], (value) => setAdvancedFilter('userAssignment', value))}
          {canReadAccounts ? renderSelect('登录账号', String(advancedFilters.loginDeviceBinding || ''), [option('with', '有登录账号'), option('without', '无登录账号')], (value) => setAdvancedFilter('loginDeviceBinding', value)) : null}
          {renderSelect('风险等级', String(advancedFilters.riskLevel || ''), ['低', '中', '高'].map((item) => option(item)), (value) => setAdvancedFilter('riskLevel', value))}
        </> : null}
        {activeTab === 'phones' ? <>
          {renderSelect('归属地', String(advancedFilters.attributionLocation || ''), filterOptions.attributionLocations, (value) => setAdvancedFilter('attributionLocation', value))}
          {renderSelect('SIM形态', String(advancedFilters.simForm || ''), filterOptions.simForms, (value) => setAdvancedFilter('simForm', value))}
          {canReadAccounts ? renderSelect('关联账号', String(advancedFilters.accountBinding || ''), [option('with', '有账号'), option('without', '无账号')], (value) => setAdvancedFilter('accountBinding', value)) : null}
          {renderSelect('服务密码', String(advancedFilters.servicePasswordStatus || ''), [option('configured', '已配置'), option('unconfigured', '未配置')], (value) => setAdvancedFilter('servicePasswordStatus', value))}
          {renderSelect('套餐', String(advancedFilters.packageName || ''), filterOptions.packageNames, (value) => setAdvancedFilter('packageName', value))}
          {renderSelect('合约到期', String(advancedFilters.contractStatus || ''), [option('active', '合约有效'), option('expired', '已到期'), option('unset', '未录入')], (value) => setAdvancedFilter('contractStatus', value))}
          <TextField size="small" type="number" label="最低月费" value={advancedFilters.monthlyFeeMin ?? ''} onChange={(event) => setAdvancedFilter('monthlyFeeMin', event.target.value)} inputProps={{ min: 0 }} />
          <TextField size="small" type="number" label="最高月费" value={advancedFilters.monthlyFeeMax ?? ''} onChange={(event) => setAdvancedFilter('monthlyFeeMax', event.target.value)} inputProps={{ min: 0 }} />
        </> : null}
        {activeTab === 'accounts' ? <>
          {renderSelect('账号类型', String(advancedFilters.accountCategory || ''), filterOptions.accountCategories, (value) => setAdvancedFilter('accountCategory', value))}
          {canReadPhones ? renderSelect('绑定手机号', String(advancedFilters.phoneBinding || ''), [option('bound', '已绑定'), option('unbound', '未绑定')], (value) => setAdvancedFilter('phoneBinding', value)) : null}
          {canReadDevices ? renderSelect('登录设备', String(advancedFilters.loginDeviceBinding || ''), [option('with', '有登录设备'), option('without', '无登录设备')], (value) => setAdvancedFilter('loginDeviceBinding', value)) : null}
          {canReadDevices ? renderSelect('指定登录设备', loginDeviceIdFilter, filterOptions.loginDevices, (value) => {
            setSearchParams((current) => {
              const next = new URLSearchParams(current);
              if (value) next.set('loginDeviceId', value); else next.delete('loginDeviceId');
              return next;
            });
          }, 180) : null}
          {renderSelect('身份账号', String(advancedFilters.identityBinding || ''), [option('apple', 'Apple ID'), option('google', 'Google账号'), option('any', '任一身份账号'), option('none', '未绑定')], (value) => setAdvancedFilter('identityBinding', value))}
          {renderSelect('密码凭证', String(advancedFilters.credentialStatus || ''), [option('complete', '已完善'), option('pending', '待补齐')], (value) => setAdvancedFilter('credentialStatus', value))}
          {renderSelect('二次验证', String(advancedFilters.twoFactorStatus || ''), [option('configured', '已配置'), option('unconfigured', '未配置')], (value) => setAdvancedFilter('twoFactorStatus', value))}
        </> : null}
        {isAssetLedger ? <>
          {renderSelect('所属部门', String(advancedFilters.departmentId || ''), filterOptions.departments, (value) => setAdvancedFilter('departmentId', value))}
          {renderSelect(activeTab === 'accounts' ? '账号负责人' : '管理责任人', String(advancedFilters.ownerId || ''), filterOptions.owners, (value) => setAdvancedFilter('ownerId', value))}
          {renderSelect(activeTab === 'accounts' ? '主要使用人' : '当前使用人', String(advancedFilters.currentUserId || ''), filterOptions.currentUsers, (value) => setAdvancedFilter('currentUserId', value))}
        </> : null}
      </Box>
    );
    const activeChips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (search.trim()) activeChips.push({ key: 'search', label: `关键词：${search.trim()}`, clear: () => setSearch('') });
    if (deviceCategory) activeChips.push({ key: 'deviceCategory', label: `设备类型：${deviceCategory}`, clear: () => setDeviceCategory('') });
    if (profileStatus) activeChips.push({ key: 'profileStatus', label: `完善情况：${profileStatus === 'complete' ? '资料完整' : '待完善'}`, clear: () => setProfileStatus('') });
    if (platform) activeChips.push({ key: 'platform', label: `平台：${platform}`, clear: () => setPlatform('') });
    if (permissionStatus) activeChips.push({ key: 'permissionStatus', label: `控制权：${permissionStatus}`, clear: () => setPermissionStatus('') });
    if (status) activeChips.push({ key: 'status', label: `状态：${status}`, clear: () => setStatus('') });
    ADVANCED_ASSET_FILTER_KEYS.forEach((key) => {
      const value = advancedFilters[key];
      if (value) activeChips.push({ key, label: `${filterLabels[key] || key}：${valueLabel(key, String(value))}`, clear: () => setAdvancedFilter(key, '') });
    });
    if (loginDeviceIdFilter) activeChips.push({
      key: 'loginDeviceId',
      label: `登录设备：${filterOptions.loginDevices.find((item) => item.value === loginDeviceIdFilter)?.label || loginDeviceFilterContext?.deviceCode || loginDeviceIdFilter}`,
      clear: clearLoginDeviceFilter,
    });
    if (bindingStatusFilter) activeChips.push({
      key: 'bindingStatus',
      label: `总览筛选：${bindingStatusLabels[bindingStatusFilter] || bindingStatusFilter}`,
      clear: () => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('bindingStatus');
        setSearchParams(nextParams, { replace: true });
      },
    });
    return (
      <Box sx={{ mb: 2 }}>
        <ModuleToolbar sx={{ mb: activeChips.length || moreFiltersOpen ? 1.25 : 0 }}>
          <TextField size="small" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholderMap[activeTab] || '搜索资产'} sx={{ width: isMobile ? '100%' : 320 }} />
          {activeTab === 'devices' ? <>
            {renderSelect('设备类型', deviceCategory, filterOptions.deviceCategories, setDeviceCategory)}
            {renderSelect('设备状态', status, filterOptions.statuses, setStatus)}
            {renderSelect('完善情况', profileStatus || '', [option('complete', '资料完整'), option('incomplete', '待完善')], (value) => setProfileStatus(value as AssetFilters['profileStatus'] | ''))}
          </> : null}
          {activeTab === 'phones' ? <>
            {renderSelect('运营商', String(advancedFilters.operator || ''), filterOptions.operators, (value) => setAdvancedFilter('operator', value))}
            {renderSelect('卡状态', status, filterOptions.statuses, setStatus)}
            {canReadDevices ? renderSelect('设备绑定', String(advancedFilters.deviceBinding || ''), [option('bound', '已绑定'), option('unbound', '未绑定')], (value) => setAdvancedFilter('deviceBinding', value)) : null}
          </> : null}
          {(activeTab === 'accounts' || activeTab === 'matrix') ? <>
            {renderSelect('平台', platform, activeTab === 'accounts' ? filterOptions.platforms : platformOptions.map((item) => option(item)), setPlatform)}
            {activeTab === 'accounts' ? renderSelect('账号控制权', permissionStatus, filterOptions.controlStatuses, setPermissionStatus, 150) : null}
          </> : null}
          {activeTab === 'accounts' ? renderSelect('账号状态', status, filterOptions.statuses, setStatus) : null}
          {!isAssetLedger && activeTab !== 'matrix' && statusOptionsMap[activeTab] ? renderSelect(activeTab === 'offboarding' ? '处理状态' : '状态', status, (statusOptionsMap[activeTab] || []).map((item) => option(item)), setStatus) : null}
          {isAssetLedger ? <Button variant="outlined" startIcon={<TuneIcon />} onClick={() => setMoreFiltersOpen((open) => !open)}>{moreFilterCount ? `更多筛选 (${moreFilterCount})` : '更多筛选'}</Button> : null}
        </ModuleToolbar>
        {activeChips.length ? <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: moreFiltersOpen ? 1.25 : 0 }}>
          {activeChips.map((chip) => <Chip key={chip.key} size="small" color="primary" variant="outlined" label={chip.label} onDelete={chip.clear} />)}
          <Button size="small" onClick={clearAllAssetFilters}>清空全部</Button>
        </Stack> : null}
        {!isMobile && isAssetLedger && moreFiltersOpen ? <Paper variant="outlined" sx={{ mt: 1.25, p: 2, borderRadius: 2, bgcolor: '#F8FAFC' }}>{advancedContent}</Paper> : null}
        <Drawer anchor="bottom" open={isMobile && isAssetLedger && moreFiltersOpen} onClose={() => setMoreFiltersOpen(false)} PaperProps={{ sx: { borderRadius: '20px 20px 0 0', p: 2.5, maxHeight: '78vh' } }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}><Typography variant="h6" sx={{ fontWeight: 900 }}>更多筛选</Typography><IconButton onClick={() => setMoreFiltersOpen(false)}><CloseIcon /></IconButton></Stack>
          {advancedContent}
          <Button variant="contained" fullWidth sx={{ mt: 2 }} onClick={() => setMoreFiltersOpen(false)}>查看筛选结果</Button>
        </Drawer>
      </Box>
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
      case 'deviceCategory':
        return <Chip size="small" label={device.deviceCategory || '手机'} variant="outlined" sx={{ height: 26, borderRadius: '6px', fontWeight: 800 }} />;
      case 'brandModel':
        return (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <DeviceBrandMark brand={device.brand} size={34} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ color: shell.ink, fontWeight: 900, lineHeight: 1.25 }}>
                {normalizeDeviceBrand(device.brand) || '未录入品牌'}
              </Typography>
              <Typography variant="caption" sx={{ color: shell.muted, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {device.model || '未录入型号'}
              </Typography>
            </Box>
          </Stack>
        );
      case 'imei':
        return renderDeviceImeis(device);
      case 'simType':
        return renderDevicePhones(device);
      case 'accountCount': {
        const count = device.internetAccountCount ?? (accountsByDeviceId.get(device.id) || []).length;
        return count ? (
          <Button
            variant="text"
            size="small"
            aria-label={`查看${device.deviceCode}的互联网账号明细`}
            onClick={(event) => {
              event.stopPropagation();
              openDeviceAccountDrawer(device);
            }}
            sx={{ minWidth: 0, px: 0, fontWeight: 900, whiteSpace: 'nowrap' }}
          >
            {count} 个
          </Button>
        ) : <Typography variant="body2" sx={{ color: shell.muted }}>未配置</Typography>;
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
        return (
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
            <CarrierBrandMark operator={phone.operator} size={28} />
            <Tooltip title={phone.operator || '未知运营商'}>
              <Typography variant="body2" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 800, whiteSpace: 'nowrap' }}>{phone.operator || '未知'}</Typography>
            </Tooltip>
          </Stack>
        );
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
      case 'device': {
        const loginDevices = normalizeAccountLoginDeviceIds(account.loginDeviceIds)
          .map((id) => deviceById.get(id))
          .filter((device): device is AssetDevice => Boolean(device));
        return loginDevices.length ? (
          <Stack spacing={0.35} alignItems="flex-start">
            {loginDevices.map((device) => (
              <Box key={device.id}>{renderRelationLink(`${device.deviceCode} / ${device.deviceName}`, () => openDetail('device', device.id))}</Box>
            ))}
          </Stack>
        ) : <Box sx={{ color: shell.muted }}>未配置</Box>;
      }
      case 'owner':
        return account.owner || '-';
      case 'permissionStatus':
        return <Chip size="small" label={readAccountControlStatus(account)} sx={chipSx(statusTone(readAccountControlStatus(account)))} />;
      default:
        return null;
    }
  };

  function renderMobileAssetCards<T extends AssetDevice | AssetPhoneNumber | AssetInternetAccount>(
    rows: T[],
    columns: TableViewColumnConfig[],
    type: AssetType,
    renderCell: (row: T, columnId: string) => React.ReactNode,
    canEdit: boolean,
    canDelete: boolean,
    deleteLabel: (row: T) => string,
    emptyLabel: string,
  ) {
    return (
      <>
        <Stack spacing={1.25}>
          {rows.map((row) => (
            <Paper key={row.id} variant="outlined" onClick={() => openDetail(type, row.id)} sx={{ p: 1.75, borderRadius: 2.5, cursor: 'pointer' }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Box sx={{ minWidth: 0, fontWeight: 900 }}>{renderCell(row, columns[0]?.id || '')}</Box>
                <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
                  <IconButton size="small" aria-label="查看详情"><VisibilityIcon fontSize="small" /></IconButton>
                  {canEdit ? <IconButton size="small" aria-label="编辑资料" onClick={(event) => { event.stopPropagation(); openEditForm(type, row); }}><EditIcon fontSize="small" /></IconButton> : null}
                  {canDelete ? <IconButton size="small" color="error" aria-label="删除" onClick={(event) => { event.stopPropagation(); openDeleteConfirm(type, row.id, deleteLabel(row)); }}><DeleteIcon fontSize="small" /></IconButton> : null}
                </Stack>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(88px, 0.7fr) minmax(0, 1.3fr)', gap: '10px 12px', mt: 1.5 }}>
                {columns.slice(1).map((column) => (
                  <React.Fragment key={column.id}>
                    <Typography variant="body2" sx={{ color: shell.muted }}>{column.label}</Typography>
                    <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{renderCell(row, column.id)}</Box>
                  </React.Fragment>
                ))}
              </Box>
            </Paper>
          ))}
          {!rows.length ? <Paper variant="outlined" sx={{ py: 5, textAlign: 'center', color: shell.muted }}>{emptyLabel}</Paper> : null}
        </Stack>
        {renderPagination()}
      </>
    );
  }

  const renderDevicesTable = () => isMobile ? renderMobileAssetCards(
    devices,
    deviceView.visibleColumns,
    'device',
    renderDeviceCell,
    canEditDevices,
    canDeleteAssetType('device'),
    deviceDeleteLabel,
    '暂无设备资产数据',
  ) : (
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

  const renderPhonesTable = () => isMobile ? renderMobileAssetCards(
    phones,
    phoneView.visibleColumns,
    'phone',
    renderPhoneCell,
    canEditPhones,
    canDeleteAssetType('phone'),
    phoneDeleteLabel,
    '暂无手机号资产数据',
  ) : (
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

  const renderAccountsTable = () => isMobile ? renderMobileAssetCards(
    accounts,
    accountView.visibleColumns,
    'account',
    renderAccountCell,
    canEditAccounts,
    canDeleteAssetType('account'),
    accountDeleteLabel,
    '暂无互联网账号数据',
  ) : (
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
      overdue: !['completed', 'confirmed'].includes(target.status) && new Date(task.dueAt).getTime() < Date.now(),
    })));
    const statusLabel = (value: string) => ({
      pending: '待执行', completed: '待确认', confirmed: '已确认', returned: '已退回',
    }[value] || '待执行');
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
                {['发布批次', '平台', '账号', '执行人', '部门', '设备', '截止时间', '员工任务状态', '素材/文案', '执行入口'].map((column) => <TableCell key={column}>{column}</TableCell>)}
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
                      sx={chipSx(overdue ? toneSx('high') : toneSx(target.status === 'confirmed' ? 'low' : 'medium'))}
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
                    <Button size="small" variant="outlined" href="/tasks">
                      员工任务中心
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && renderAssetEmptyRow(10, '暂无发布批次')}
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
            {['交接员工', '交接原因', '交接资产', '交接进度', '截止时间', '操作'].map((column) => <TableCell key={column}>{column}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {handoverGroups.map((group) => {
            const pendingIds = group.tasks.filter((task) => task.status !== '已回收').map((task) => task.id);
            return (
            <TableRow hover key={group.id}>
              <TableCell sx={{ minWidth: 150 }}>
                <Typography sx={{ color: shell.ink, fontWeight: 900 }}>{group.employeeName}</Typography>
                <Typography variant="caption" sx={{ color: shell.muted }}>{group.department || '未归属部门'}</Typography>
              </TableCell>
              <TableCell><Chip size="small" label={group.reason} variant="outlined" /></TableCell>
              <TableCell sx={{ minWidth: 360 }}>
                <Stack spacing={0.7}>
                  {group.tasks.map((task) => {
                    const detailType: AssetType = task.assetType === '设备资产' ? 'device' : task.assetType === '手机号资产' ? 'phone' : 'account';
                    return (
                      <Stack key={task.id} direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                        <Button size="small" onClick={() => openDetail(detailType, task.assetId)} sx={{ justifyContent: 'flex-start', minWidth: 0, fontWeight: 800 }}>
                          {task.assetType.replace('资产', '')} · {task.assetName}
                        </Button>
                        <Chip size="small" label={task.status === '已回收' ? '已完成' : '待处理'} sx={chipSx(statusTone(task.status))} />
                      </Stack>
                    );
                  })}
                </Stack>
              </TableCell>
              <TableCell sx={{ minWidth: 150 }}>
                <Typography sx={{ color: shell.ink, fontWeight: 900 }}>{group.completed} / {group.total}</Typography>
                <Chip size="small" label={group.status} sx={chipSx(statusTone(group.status))} />
              </TableCell>
              <TableCell>{group.dueAt || '-'}</TableCell>
              <TableCell align="center" sx={{ minWidth: 170 }}>
                {canHandleOffboarding && pendingIds.length ? (
                  <Button size="small" variant="outlined" onClick={() => void handleCompleteHandoverGroup(pendingIds)}>
                    完成全部待交接项
                  </Button>
                ) : <Typography variant="caption" sx={{ color: shell.muted }}>交接已闭环</Typography>}
              </TableCell>
            </TableRow>
            );
          })}
          {handoverGroups.length === 0 && renderAssetEmptyRow(6, '暂无资产交接数据')}
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
  const accountLoginDevices = detail?.account
    ? normalizeAccountLoginDeviceIds(detail.account.loginDeviceIds)
      .map((id) => [...(detail.relatedDevices || []), ...lookupDevices].find((device) => device.id === id))
      .filter((device): device is AssetDevice => Boolean(device))
    : [];

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
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
          <DeviceBrandMark brand={device.brand} size={56} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ color: shell.ink, fontSize: 22, fontWeight: 950 }}>{device.deviceName}</Typography>
            <Typography variant="body2" sx={{ color: shell.muted, mt: 0.25 }}>
              {[normalizeDeviceBrand(device.brand), device.model].filter(Boolean).join(' / ') || '未录入品牌型号'}
            </Typography>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 0.8 }}>
              <Chip size="small" label={device.deviceCode} variant="outlined" />
              <Chip size="small" label={device.deviceCategory || '手机'} variant="outlined" />
              <Chip size="small" label={device.status} sx={chipSx(statusTone(device.status))} />
            </Stack>
          </Box>
        </Stack>
        <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
          <Typography variant="caption" sx={{ color: shell.muted }}>当前使用人</Typography>
          <Typography sx={{ color: shell.ink, fontWeight: 900 }}>{device.currentUser || '未分配'}</Typography>
        </Box>
      </Stack>
    </Paper>
  );

  const renderDeviceRelationshipOverview = (device: AssetDevice) => {
    const slots = buildDeviceSlotRows(device, detail?.relatedPhones || []);
    const loginAccounts = (detail?.relatedAccounts || []).filter((account) => (
      normalizeAccountLoginDeviceIds(account.loginDeviceIds).includes(device.id)
    ));
    return renderDetailCard('关联关系', (
      <Stack spacing={1}>
        {slots.length ? slots.map((slot) => {
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
                <Box sx={{ flex: 1.35, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: shell.muted }}>该号码关联账号 ({accounts.length})</Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                    {accounts.length ? accounts.map((account) => (
                      <Button
                        key={account.id}
                        size="small"
                        variant="outlined"
                        onClick={() => openDetail('account', account.id)}
                        startIcon={<PlatformBrandMark platform={account.platform} size={24} />}
                        sx={{ minWidth: 0, px: 1, fontWeight: 800, justifyContent: 'flex-start' }}
                      >
                        {account.accountName}
                      </Button>
                    )) : <Typography variant="body2" sx={{ color: shell.muted }}>暂无关联账号</Typography>}
                  </Stack>
                </Box>
              </Stack>
            </Paper>
          );
        }) : (
          <Box sx={{ py: 1.5, border: `1px dashed ${shell.softLine}`, borderRadius: 1, textAlign: 'center', color: shell.muted }}>
            该设备无 SIM 通信能力，无需配置卡槽绑定
          </Box>
        )}
        <Box sx={{ pt: 0.25 }}>
          <Typography sx={{ color: shell.ink, fontWeight: 900, mb: 0.75 }}>本机登录账号 ({loginAccounts.length})</Typography>
          {loginAccounts.length ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.9 }}>
              {loginAccounts.map((account) => (
                <Paper key={account.id} variant="outlined" sx={{ borderColor: shell.softLine, borderRadius: 1, p: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <PlatformBrandMark platform={account.platform} size={34} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      {renderAssetNameLink(account.accountName, () => openDetail('account', account.id))}
                      <Typography variant="caption" display="block" sx={{ color: shell.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {account.platform} · {displayAccountLogin(account)}
                      </Typography>
                    </Box>
                    <Chip size="small" label={account.accountStatus} sx={chipSx(statusTone(account.accountStatus))} />
                  </Stack>
                </Paper>
              ))}
            </Box>
          ) : (
            <Box sx={{ py: 1.25, border: `1px dashed ${shell.softLine}`, borderRadius: 1, textAlign: 'center', color: shell.muted }}>
              暂无在该设备登录的互联网账号
            </Box>
          )}
        </Box>
      </Stack>
    ), <Chip size="small" label={`${slots.length} 个卡槽 · ${loginAccounts.length} 个登录账号`} sx={chipSx(toneSx('low'))} />);
  };

  const renderDeviceDetailSections = (device: AssetDevice) => (
    <Stack spacing={1.25}>
      {renderDeviceSummaryCard(device)}
      {renderDeviceRelationshipOverview(device)}
      {renderDetailCard('设备身份', renderInfoRows([
        { label: '设备编号', value: <Stack direction="row" alignItems="center" spacing={0.5}>{device.deviceCode}{renderCopyButton(device.deviceCode, '设备编号')}</Stack> },
        { label: '设备类型', value: device.deviceCategory || '手机' },
        { label: '品牌', value: normalizeDeviceBrand(device.brand) || '-' },
        { label: '型号', value: device.model || '-' },
        ...(device.serialNumber ? [{ label: '序列号', value: device.serialNumber }] : []),
        { label: '通信方式', value: readDeviceCommunicationType(device) },
      ], 2))}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
        {renderDetailCard('归属与使用', renderInfoRows([
          { label: '所属主体', value: device.ownerSubject },
          ...(device.department ? [{ label: '所属部门', value: device.department }] : []),
          ...(device.owner ? [{ label: '管理责任人', value: device.owner }] : []),
          ...(device.currentUser ? [{ label: '当前使用人', value: device.currentUser }] : []),
        ], 1))}
        {renderDetailCard('取得与状态', renderInfoRows([
          { label: '取得方式', value: device.acquisitionType || '-' },
          { label: device.acquisitionType === '租赁' ? '月租金' : '购买金额', value: formatCurrency(device.acquisitionType === '租赁' ? device.monthlyRent || 0 : device.purchaseAmount || 0) },
          ...(device.acquiredAt ? [{ label: '取得日期', value: formatDate(device.acquiredAt, 'yyyy-MM-dd') }] : []),
          ...(device.warrantyExpiresAt ? [{ label: '保修到期', value: formatDate(device.warrantyExpiresAt, 'yyyy-MM-dd') }] : []),
          { label: '设备状态', value: <Chip size="small" label={device.status} sx={chipSx(statusTone(device.status))} /> },
          { label: '更新时间', value: formatDate(device.updatedAt, 'yyyy-MM-dd') },
          ...(device.remark ? [{ label: '备注', value: device.remark }] : []),
        ], 1))}
      </Box>
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

  const renderPhoneRelationshipOverview = (phone: AssetPhoneNumber) => {
    const slot = phone.slotType;
    const imeiLabel = slot === '卡槽2' ? 'IMEI 2' : 'IMEI 1';
    const imei = primaryDevice && slot ? displayDeviceImei(primaryDevice, slot === '卡槽2' ? 2 : 1) : '';
    const relatedAccounts = detail?.relatedAccounts || [];
    const visibleAccounts = showAllPhoneRelatedAccounts ? relatedAccounts : relatedAccounts.slice(0, 4);
    return renderDetailCard('关联关系', (
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.9fr 1.5fr' }, gap: 1.25, alignItems: 'stretch' }}>
        <Paper variant="outlined" sx={{ borderColor: shell.softLine, borderRadius: 1.25, p: 1.4, minWidth: 0 }}>
          <Typography sx={{ color: shell.ink, fontWeight: 900, mb: 1 }}>设备与卡槽</Typography>
          {primaryDevice && slot ? (
            <Stack spacing={1.1}>
              <Stack direction="row" spacing={1} alignItems="center">
                <DeviceBrandMark brand={primaryDevice.brand} size={38} />
                <Box sx={{ minWidth: 0 }}>
                  {renderAssetNameLink(`${primaryDevice.deviceCode} / ${primaryDevice.deviceName}`, () => openDetail('device', primaryDevice.id))}
                  <Typography variant="caption" display="block" sx={{ color: shell.muted }}>
                    {formatDeviceBrandModel(primaryDevice)}
                  </Typography>
                </Box>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: '0.7fr 1.3fr', gap: 1 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: shell.muted }}>当前卡槽</Typography>
                  <Typography sx={{ color: shell.tableLink, fontWeight: 950 }}>{slot}</Typography>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: shell.muted }}>对应{imeiLabel}</Typography>
                  <Box sx={{ color: shell.ink, fontWeight: 850, minWidth: 0 }}>{renderOperationalValue(imei, imeiLabel)}</Box>
                </Box>
              </Box>
            </Stack>
          ) : (
            <Box sx={{ py: 2, border: `1px dashed ${shell.softLine}`, borderRadius: 1, textAlign: 'center', color: shell.muted }}>
              尚未绑定设备与卡槽
            </Box>
          )}
        </Paper>
        <Paper variant="outlined" sx={{ borderColor: shell.softLine, borderRadius: 1.25, p: 1.4, minWidth: 0 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography sx={{ color: shell.ink, fontWeight: 900 }}>互联网账号 ({relatedAccounts.length})</Typography>
            {relatedAccounts.length > 4 ? (
              <Button size="small" onClick={() => setShowAllPhoneRelatedAccounts((value) => !value)} sx={{ fontWeight: 900 }}>
                {showAllPhoneRelatedAccounts ? '收起' : `查看全部 ${relatedAccounts.length} 个`}
              </Button>
            ) : null}
          </Stack>
          {visibleAccounts.length ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.9 }}>
              {visibleAccounts.map((account) => (
                <Paper
                  component="button"
                  type="button"
                  key={account.id}
                  variant="outlined"
                  onClick={() => openDetail('account', account.id)}
                  sx={{ borderColor: shell.softLine, borderRadius: 1, p: 1, bgcolor: '#fff', textAlign: 'left', cursor: 'pointer', minWidth: 0, '&:hover': { borderColor: shell.tableLink, bgcolor: '#F8FBFF' } }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <PlatformBrandMark platform={account.platform} size={34} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" sx={{ color: shell.tableLink, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {account.accountName}
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ color: shell.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {account.platform} · {displayAccountLogin(account)}
                      </Typography>
                    </Box>
                    <Chip size="small" label={account.accountStatus} sx={chipSx(statusTone(account.accountStatus))} />
                  </Stack>
                </Paper>
              ))}
            </Box>
          ) : (
            <Box sx={{ py: 2, border: `1px dashed ${shell.softLine}`, borderRadius: 1, textAlign: 'center', color: shell.muted }}>
              暂无关联互联网账号
            </Box>
          )}
        </Paper>
      </Box>
    ), <Chip size="small" label={`${primaryDevice ? '1 台设备' : '未绑设备'} · ${relatedAccounts.length} 个账号`} sx={chipSx(toneSx('low'))} />);
  };

  const renderPhoneOwnershipCard = (phone: AssetPhoneNumber) => renderDetailCard('归属与使用', renderInfoRows([
    { label: '所属主体', value: phone.ownerSubject || '公司' },
    { label: '实名主体', value: phone.realNameSubject || '未录入' },
    { label: '实名信息', value: renderOperationalValue(displayPhoneRealName(phone), '实名信息') },
    { label: '所属部门', value: phone.department || primaryDevice?.department || '未录入' },
    { label: '管理责任人', value: phone.owner || '未分配' },
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
      {renderPhoneRelationshipOverview(phone)}
      {renderPhoneIdentityCard(phone)}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
        {renderPhoneOwnershipCard(phone)}
        {renderPhonePlanCard(phone)}
      </Box>
    </Stack>
  );

  const accountEmptyValue = (label = '未录入') => (
    <Typography component="span" sx={{ color: shell.muted, fontWeight: 700 }}>{label}</Typography>
  );

  const renderAccountSummaryCard = (account: AssetInternetAccount) => (
    <Paper elevation={0} sx={{ ...detailCardSx, p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.75} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
          <PlatformBrandMark platform={account.platform} size={56} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ color: shell.ink, fontSize: 22, lineHeight: 1.25, fontWeight: 950, overflowWrap: 'anywhere' }}>
              {account.accountName}
            </Typography>
            <Stack direction="row" spacing={0.5} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 0.35 }}>
              <Typography variant="body2" sx={{ color: shell.muted, fontWeight: 800 }}>{account.platform}</Typography>
              <Typography variant="body2" sx={{ color: shell.softLine }}>·</Typography>
              {renderOperationalValue(displayAccountLogin(account), '登录账号')}
            </Stack>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.85 }}>
              <Chip size="small" label={account.accountStatus} sx={chipSx(statusTone(account.accountStatus))} />
              <Chip size="small" label={readAccountControlStatus(account)} sx={chipSx(statusTone(readAccountControlStatus(account)))} />
              <Chip size="small" label={account.accountCategory || '主账号'} variant="outlined" sx={{ height: 24, borderRadius: '6px', fontWeight: 800 }} />
            </Stack>
          </Box>
        </Stack>
        <Box sx={{ minWidth: { sm: 190 }, textAlign: { xs: 'left', sm: 'right' } }}>
          <Typography variant="caption" sx={{ color: shell.muted }}>账号编号</Typography>
          <Stack direction="row" spacing={0.25} alignItems="center" justifyContent={{ xs: 'flex-start', sm: 'flex-end' }}>
            <Typography sx={{ color: shell.ink, fontWeight: 900 }}>{account.accountNo}</Typography>
            {renderCopyButton(account.accountNo, '账号编号')}
          </Stack>
          <Typography variant="caption" sx={{ color: shell.muted }}>
            {account.currentUser ? `主要使用人：${account.currentUser}` : '主要使用人：未分配'}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );

  const renderAccountIdentitySection = (account: AssetInternetAccount) => renderDetailCard('账号身份', renderInfoRows([
    { label: '账号编号', value: <Stack direction="row" alignItems="center" spacing={0.25}>{account.accountNo}{renderCopyButton(account.accountNo, '账号编号')}</Stack> },
    { label: '业务平台', value: <Stack direction="row" spacing={0.75} alignItems="center"><PlatformBrandMark platform={account.platform} size={28} /><Box>{account.platform}</Box></Stack> },
    { label: '账号类型', value: account.accountCategory || '主账号' },
    { label: '实名主体', value: account.realNameSubject || accountEmptyValue() },
    {
      label: '实名信息',
      value: displayAccountRealName(account)
        ? renderSensitiveInline('account', account.id, 'accountRealName', displayAccountRealName(account))
        : accountEmptyValue(),
    },
  ], 2));

  const renderAccountSecuritySection = (account: AssetInternetAccount) => renderDetailCard('登录与安全', (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
      {[
        { label: '登录方式', value: account.loginMethod || '密码登录' },
        { label: '绑定邮箱', value: renderOperationalValue(displayAccountEmail(account), '绑定邮箱') },
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
        { label: '二次验证', value: account.twoFactorMethod || accountEmptyValue('未配置') },
        { label: '凭证更新', value: account.credentialUpdatedAt ? formatDate(account.credentialUpdatedAt, 'yyyy-MM-dd HH:mm') : accountEmptyValue('暂无记录') },
      ].map((item) => (
        <Paper key={item.label} variant="outlined" sx={{ borderColor: shell.softLine, borderRadius: 1.25, p: 1.4, minWidth: 0 }}>
          <Typography variant="caption" sx={{ color: shell.muted }}>{item.label}</Typography>
          <Box sx={{ color: shell.ink, fontWeight: 850, mt: 0.45, minWidth: 0 }}>{item.value}</Box>
        </Paper>
      ))}
    </Box>
  ));

  const renderAccountBindingSection = (account: AssetInternetAccount) => {
    const identityAccounts = detail?.relatedAccounts || lookupAccounts;
    const appleAccount = findIdentityAccountForProvider(account, identityAccounts, 'Apple ID');
    const googleAccount = findIdentityAccountForProvider(account, identityAccounts, 'Google账号');
    const renderIdentityBinding = (label: AssetIdentityAccountPlatform, identityAccount?: AssetInternetAccount) => (
      <Paper variant="outlined" sx={{ borderColor: shell.softLine, borderRadius: 1.25, p: 1.4, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <PlatformBrandMark platform={label} size={34} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ color: shell.muted }}>绑定{label}</Typography>
            <Box sx={{ minWidth: 0 }}>
              {identityAccount
                ? renderAssetNameLink(`${identityAccount.accountName} / ${displayAccountLogin(identityAccount)}`, () => openDetail('account', identityAccount.id))
                : accountEmptyValue('未绑定')}
            </Box>
          </Box>
        </Stack>
      </Paper>
    );
    return renderDetailCard('绑定关系', (
      <Stack spacing={1.25}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
          <Paper variant="outlined" sx={{ borderColor: shell.softLine, borderRadius: 1.25, p: 1.4, minWidth: 0 }}>
            <Typography variant="caption" sx={{ color: shell.muted }}>绑定手机号</Typography>
            <Box sx={{ mt: 0.45, minWidth: 0 }}>
              {primaryPhone
                ? renderAssetNameLink(displayPhoneNumber(primaryPhone), () => openDetail('phone', primaryPhone.id))
                : accountEmptyValue('未绑定')}
            </Box>
            {primaryPhone ? <Typography variant="caption" sx={{ color: shell.muted }}>{primaryPhone.operator || '未录入运营商'}</Typography> : null}
          </Paper>
          {renderIdentityBinding('Apple ID', appleAccount)}
          {renderIdentityBinding('Google账号', googleAccount)}
        </Box>
        <Box>
          <Typography sx={{ color: shell.ink, fontWeight: 900, mb: 0.75 }}>登录设备 ({accountLoginDevices.length})</Typography>
          {accountLoginDevices.length ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
              {accountLoginDevices.map((device) => (
                <Paper key={device.id} variant="outlined" sx={{ borderColor: shell.softLine, borderRadius: 1.25, p: 1.25, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <DeviceBrandMark brand={device.brand} size={34} />
                    <Box sx={{ minWidth: 0 }}>
                      {renderAssetNameLink(`${device.deviceCode} / ${device.deviceName}`, () => openDetail('device', device.id))}
                      <Typography variant="caption" display="block" sx={{ color: shell.muted }}>{formatDeviceBrandModel(device)}</Typography>
                    </Box>
                    <Chip size="small" label={device.status} sx={{ ...chipSx(statusTone(device.status)), ml: 'auto' }} />
                  </Stack>
                </Paper>
              ))}
            </Box>
          ) : (
            <Box sx={{ py: 1.5, px: 1.25, border: `1px dashed ${shell.softLine}`, borderRadius: 1.25, color: shell.muted, textAlign: 'center' }}>
              尚未配置登录设备
            </Box>
          )}
        </Box>
      </Stack>
    ));
  };

  const renderAccountOwnershipSection = (account: AssetInternetAccount) => renderDetailCard('归属与使用', renderInfoRows([
    { label: '所属主体', value: account.ownerSubject || '公司' },
    { label: '所属部门', value: account.department || accountEmptyValue() },
    { label: '账号负责人', value: account.owner || accountEmptyValue('未分配') },
    { label: '主要使用人', value: account.currentUser || accountEmptyValue('未分配') },
  ], 2));

  const renderAccountBusinessSection = (account: AssetInternetAccount) => renderDetailCard('经营与状态', (
    <Stack spacing={1.25}>
      {renderInfoRows([
        { label: '业务场景', value: account.businessScene || accountEmptyValue() },
        { label: '服务商', value: account.serviceProvider || accountEmptyValue() },
        { label: '月费用', value: formatCurrency(account.monthlyFee) },
        { label: '到期日', value: account.expiresAt ? formatDate(account.expiresAt, 'yyyy-MM-dd') : accountEmptyValue() },
        { label: '账号状态', value: <Chip size="small" label={account.accountStatus} sx={chipSx(statusTone(account.accountStatus))} /> },
        { label: '更新时间', value: formatDate(account.updatedAt, 'yyyy-MM-dd HH:mm') },
      ], 2)}
      {(account.purpose || account.remark) ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          {account.purpose ? (
            <Paper variant="outlined" sx={{ borderColor: shell.softLine, borderRadius: 1.25, p: 1.4 }}>
              <Typography variant="caption" sx={{ color: shell.muted }}>用途</Typography>
              <Typography sx={{ color: shell.ink, fontWeight: 750, whiteSpace: 'pre-wrap', mt: 0.45 }}>{account.purpose}</Typography>
            </Paper>
          ) : null}
          {account.remark ? (
            <Paper variant="outlined" sx={{ borderColor: shell.softLine, borderRadius: 1.25, p: 1.4 }}>
              <Typography variant="caption" sx={{ color: shell.muted }}>备注</Typography>
              <Typography sx={{ color: shell.ink, fontWeight: 750, whiteSpace: 'pre-wrap', mt: 0.45 }}>{account.remark}</Typography>
            </Paper>
          ) : null}
        </Box>
      ) : null}
    </Stack>
  ));

  const renderAccountIdentityCard = (account: AssetInternetAccount) => {
    const related = detail?.relatedAccounts || [];
    const outboundIds = new Set(normalizeIdentityAccountIds(account.identityAccountIds));
    const outboundAccounts = related.filter((item) => item.id !== account.id && outboundIds.has(item.id));
    const inboundAccounts = related.filter((item) => item.id !== account.id && normalizeIdentityAccountIds(item.identityAccountIds).includes(account.id));
    const renderIdentityRelations = (title: string, items: AssetInternetAccount[], emptyText: string) => (
      <Box>
        <Typography sx={{ color: shell.ink, fontWeight: 900, mb: 0.75 }}>{title}</Typography>
        {items.length ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
            {items.map((item) => (
              <Paper key={item.id} variant="outlined" sx={{ borderColor: shell.softLine, borderRadius: 1.25, p: 1.25, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <PlatformBrandMark platform={item.platform} size={36} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="space-between">
                      {renderAssetNameLink(item.accountName, () => openDetail('account', item.id))}
                      <Chip size="small" label={readAccountControlStatus(item)} sx={chipSx(statusTone(readAccountControlStatus(item)))} />
                    </Stack>
                    <Typography variant="caption" sx={{ color: shell.muted, overflowWrap: 'anywhere' }}>
                      {item.platform} · {displayAccountLogin(item)}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Box>
        ) : (
          <Box sx={{ py: 1.4, px: 1.25, border: `1px dashed ${shell.softLine}`, borderRadius: 1.25, color: shell.muted, textAlign: 'center' }}>{emptyText}</Box>
        )}
      </Box>
    );
    return renderDetailCard('身份账号关联', (
      <Stack spacing={1.5}>
        {renderIdentityRelations('此账号使用的身份账号', outboundAccounts, '暂未绑定 Apple ID 或 Google 账号')}
        {renderIdentityRelations('使用此账号的业务账号', inboundAccounts, '暂无业务账号依赖此账号')}
      </Stack>
    ));
  };

  const renderAccountDetailSections = (account: AssetInternetAccount) => (
    <Stack spacing={1.25}>
      {renderAccountSummaryCard(account)}
      {renderAccountBindingSection(account)}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
        {renderAccountIdentitySection(account)}
        {renderAccountOwnershipSection(account)}
      </Box>
      {renderAccountSecuritySection(account)}
      {renderAccountBusinessSection(account)}
      {renderAccountIdentityCard(account)}
    </Stack>
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
    return detail.account ? renderAccountDetailSections(detail.account) : null;
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
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { borderRadius: 1, overflow: 'hidden', maxWidth: 1120, maxHeight: '88vh' } }}
      >
        <DialogTitle sx={{ p: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ px: { xs: 1.5, sm: 2.25 }, py: 1.5, borderBottom: `1px solid ${shell.softLine}` }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ color: shell.ink, fontSize: { xs: 18, sm: 20 }, fontWeight: 950, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detail ? detailTitleMap[detail.type] : '查看资产资料'}</Typography>
              {detailSaveNotice ? (
                <>
                  <Tooltip title={detailSaveNotice}>
                    <Box
                      role="status"
                      aria-label={detailSaveNotice}
                      sx={{ display: { xs: 'inline-flex', sm: 'none' }, width: 28, flexShrink: 0, color: 'success.main', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <CheckCircleOutlineIcon sx={{ fontSize: 21 }} />
                    </Box>
                  </Tooltip>
                  <Chip size="small" color="success" label={detailSaveNotice} sx={{ display: { xs: 'none', sm: 'inline-flex' }, flexShrink: 0 }} />
                </>
              ) : null}
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
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
                  aria-label="编辑资料"
                  sx={{
                    fontWeight: 900,
                    minWidth: { xs: 40, sm: 'auto' },
                    px: { xs: 1, sm: 2 },
                    '& .MuiButton-startIcon': { m: { xs: 0, sm: '0 8px 0 -4px' } },
                  }}
                >
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>编辑资料</Box>
                </Button>
              ) : null}
              <IconButton aria-label="关闭资产详情" onClick={closeDetailDialog} sx={{ color: shell.muted }}>
                <CloseIcon />
              </IconButton>
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#FBFCFE', p: 1.5 }}>
          {!detail ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography sx={{ color: assetError ? '#C62828' : shell.muted, fontWeight: 800 }}>
                {loading ? '正在加载资产详情' : assetError || '资产资料不存在或无权查看'}
              </Typography>
            </Box>
          ) : renderDetailBody()}
        </DialogContent>
        <DialogActions sx={{ px: 2.25, py: 1.5, borderTop: `1px solid ${shell.softLine}` }}>
          <Button onClick={closeDetailDialog}>关闭</Button>
        </DialogActions>
      </Dialog>
    );
  };

  const togglePasswordVisibility = (field: string) => {
    setVisiblePasswordFields((current) => ({ ...current, [field]: !current[field] }));
  };

  const passwordEndAdornment = (field: string) => (
    <InputAdornment position="end">
      <Tooltip title={visiblePasswordFields[field] ? '隐藏密码' : '显示密码'}>
        <IconButton
          edge="end"
          size="small"
          aria-label={visiblePasswordFields[field] ? '隐藏密码' : '显示密码'}
          onClick={() => togglePasswordVisibility(field)}
          onMouseDown={(event) => event.preventDefault()}
        >
          {visiblePasswordFields[field] ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </InputAdornment>
  );

  const renderTextField = (name: string, label: string, props: { required?: boolean; type?: string; multiline?: boolean; helperText?: string } = {}) => {
    const isPassword = props.type === 'password';
    return (
    <TextField
      size="small"
      label={label}
      value={formState.values[name] || ''}
      onChange={(event) => updateFormValue(name, event.target.value)}
      required={props.required}
      type={isPassword && visiblePasswordFields[name] ? 'text' : props.type}
      multiline={props.multiline}
      minRows={props.multiline ? 2 : undefined}
      helperText={props.helperText}
      autoComplete={isPassword ? 'new-password' : undefined}
      InputProps={isPassword ? { endAdornment: passwordEndAdornment(name) } : undefined}
      InputLabelProps={props.type === 'date' ? { shrink: true } : undefined}
      fullWidth
    />
    );
  };

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

  const renderPlatformSelectField = () => (
    <FormControl size="small" fullWidth required>
      <InputLabel>业务平台</InputLabel>
      <Select
        label="业务平台"
        value={formState.values.platform || ''}
        onChange={(event) => updateFormValue('platform', event.target.value)}
        renderValue={(selected) => selected ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <PlatformBrandMark platform={String(selected)} size={26} />
            <Box component="span">{String(selected)}</Box>
          </Stack>
        ) : '未选择'}
      >
        <MenuItem value="">未选择</MenuItem>
        {platformOptions.map((option) => (
          <MenuItem key={option} value={option}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <PlatformBrandMark platform={option} size={30} />
              <Box component="span">{option}</Box>
            </Stack>
          </MenuItem>
        ))}
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
        {renderUserSelectField('owner', '管理责任人')}
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

  const phoneSlotMenuProps = {
    PaperProps: {
      sx: {
        mt: 0.5,
        border: `1px solid ${shell.line}`,
        borderRadius: 2,
        boxShadow: 'none',
      },
    },
    MenuListProps: { sx: { py: 0.5 } },
  };

  const renderPhoneSlotImeiOption = (slot: '卡槽1' | '卡槽2') => {
    const imeiIndex = slot === '卡槽2' ? 2 : 1;
    const device = deviceById.get(formState.values.deviceId);
    const imei = device ? displayDeviceImei(device, imeiIndex) : '';
    return (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '64px 72px minmax(0, 1fr)',
          alignItems: 'center',
          width: '100%',
          minWidth: 0,
          columnGap: 1,
        }}
      >
        <Typography component="span" sx={{ fontWeight: 750 }}>{slot}</Typography>
        <Typography component="span" sx={{ color: shell.muted }}>{`IMEI ${imeiIndex}`}</Typography>
        <Typography
          component="span"
          sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {imei || '未录入'}
        </Typography>
      </Box>
    );
  };

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
          MenuProps={phoneSlotMenuProps}
          renderValue={(selected) => renderPhoneSlotImeiOption(selected as '卡槽1' | '卡槽2')}
        >
          {phoneSlotOptionsForDevice(formState.values.deviceId).map((option) => (
            <MenuItem key={option} value={option}>{renderPhoneSlotImeiOption(option as '卡槽1' | '卡槽2')}</MenuItem>
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
        {renderUserSelectField('owner', '管理责任人')}
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
            type={visiblePasswordFields.servicePassword ? 'text' : 'password'}
            autoComplete="new-password"
            disabled={formState.values.clearServicePassword === 'true'}
            InputProps={{ endAdornment: passwordEndAdornment('servicePassword') }}
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
    const candidates = Array.from(accountById.values()).filter((account) => (
      account.platform === platform
      && account.id !== formState.id
      && !['异常', '封禁', '已注销'].includes(account.accountStatus)
      && readAccountControlStatus(account) === '已掌控'
    ));
    const selected = accountById.get(formState.values[fieldName] || '') || null;
    return (
      <Autocomplete
        options={candidates}
        value={selected}
        filterOptions={(options) => options}
        getOptionLabel={(account) => `${account.accountName} / ${displayAccountLogin(account)}`}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        onChange={(_, account) => updateFormValue(fieldName, account?.id || '')}
        onInputChange={(_, query, reason) => {
          if (reason !== 'input') return;
          void assetApi.fetchInternetAccounts({
            platform,
            search: query.trim(),
            page: 1,
            pageSize: IDENTITY_ACCOUNT_LOOKUP_PAGE_SIZE,
          }).then((res) => {
            if (res.code !== 0) return;
            setIdentityAccountCandidates((current) => Array.from(
              new Map([...current, ...res.data.items].map((account) => [account.id, account])).values(),
            ));
          });
        }}
        noOptionsText={`暂无可绑定的${platform}，请先建档`}
        renderOption={(props, account) => (
          <Box component="li" {...props} key={account.id}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
              <PlatformBrandMark platform={account.platform} size={28} />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 850 }}>{account.accountName}</Typography>
                <Typography variant="caption" sx={{ color: shell.muted }}>{displayAccountLogin(account)} / {account.currentUser || '未分配'}</Typography>
              </Box>
            </Stack>
          </Box>
        )}
        renderInput={(params) => <TextField {...params} label={label} placeholder={`搜索${platform}账号`} />}
      />
    );
  };

  const renderAccountFields = () => (
    <>
      <BusinessFormSection step={1} solidStep title={ASSET_FORM_SECTIONS.account[0].title} summary={sectionSummary(['platform', 'accountCategory', 'accountName', 'loginAccount', 'realNameSubject'], ASSET_FORM_SECTIONS.account[0].summary)} errorCount={sectionErrorCount(['platform', 'accountCategory', 'accountName', 'loginAccount']) + (formState.validationErrorSection === 1 ? 1 : 0)}>
        {renderPlatformSelectField()}
        {renderSelectField('accountCategory', '账号类型', ['主账号', '员工号', '直播号', '投放号', '客服号', '其他'], { required: true })}
        {renderTextField('accountName', '账号名称', { required: true })}
        {renderTextField('loginAccount', '登录账号', { required: true })}
        {renderTextField('realNameSubject', '实名主体')}
        {renderTextField('realName', '实名信息')}
      </BusinessFormSection>
      <BusinessFormSection step={2} solidStep title={ASSET_FORM_SECTIONS.account[1].title} summary={sectionSummary(['loginMethod', 'loginPassword', 'paymentPassword', 'phoneId', 'loginDeviceIds', 'appleIdentityAccountId', 'googleIdentityAccountId', 'twoFactorMethod'], ASSET_FORM_SECTIONS.account[1].summary)} errorCount={formState.validationErrorSection === 2 ? 1 : 0}>
        {renderSelectField('loginMethod', '登录方式', ['密码登录', '手机验证码', '扫码登录', 'SSO'], { required: true })}
        {formState.values.loginMethod === '密码登录' ? renderTextField('loginPassword', '登录密码', {
          type: 'password',
          required: formState.mode === 'create',
          helperText: formState.mode === 'edit' ? '留空表示不修改原登录密码' : '加密保存，仅授权人员可查看',
        }) : null}
        <Box
          sx={{
            gridColumn: '1 / -1',
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            alignItems: 'start',
            gap: 2,
          }}
        >
          <FormControlLabel
            sx={{ minHeight: 40, m: 0 }}
            control={<Checkbox checked={formState.values.requiresPaymentPassword === 'true'} onChange={(event) => updateFormValue('requiresPaymentPassword', event.target.checked ? 'true' : 'false')} />}
            label="该账号涉及支付，需要保存支付密码"
          />
          {formState.values.requiresPaymentPassword === 'true' ? renderTextField('paymentPassword', '支付密码', {
            type: 'password',
            required: formState.mode === 'create',
            helperText: formState.mode === 'edit' ? '留空表示不修改原支付密码' : '与登录密码独立加密保存',
          }) : null}
        </Box>
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
        <FormControl size="small" fullWidth>
          <InputLabel>登录设备（可多选）</InputLabel>
          <Select
            label="登录设备（可多选）"
            multiple
            value={readFormIdList(formState.values.loginDeviceIds)}
            onChange={(event) => {
              const selected = typeof event.target.value === 'string'
                ? event.target.value.split(',')
                : event.target.value;
              updateFormValue('loginDeviceIds', JSON.stringify(normalizeAccountLoginDeviceIds(selected)));
            }}
            renderValue={(selected) => selected
              .map((id) => deviceById.get(id))
              .filter((device): device is AssetDevice => Boolean(device))
              .map((device) => `${device.deviceCode} / ${device.deviceName}`)
              .join('、') || '暂不配置'}
          >
            {lookupDevices.map((device) => {
              const selected = readFormIdList(formState.values.loginDeviceIds).includes(device.id);
              return (
                <MenuItem key={device.id} value={device.id}>
                  <Checkbox checked={selected} />
                  <ListItemText primary={`${device.deviceCode} / ${device.deviceName}`} secondary={formatDeviceBrandModel(device)} />
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
        {renderTextField('boundEmail', '绑定邮箱')}
        {!['Apple ID', 'Google账号'].includes(formState.values.platform)
          ? renderIdentityAccountSelect('Apple ID', 'appleIdentityAccountId', '绑定 Apple ID')
          : null}
        {!['Apple ID', 'Google账号'].includes(formState.values.platform)
          ? renderIdentityAccountSelect('Google账号', 'googleIdentityAccountId', '绑定 Google 账号')
          : null}
        {renderTextField('twoFactorMethod', '二次验证方式')}
      </BusinessFormSection>
      <BusinessFormSection step={3} solidStep title={ASSET_FORM_SECTIONS.account[2].title} summary={sectionSummary(['ownerSubject', 'department', 'owner', 'currentUser'], ASSET_FORM_SECTIONS.account[2].summary)} errorCount={sectionErrorCount(['ownerSubject'])}>
        {renderSelectField('ownerSubject', '所属主体', ['公司', '法人', '员工个人'], { required: true })}
        {renderDepartmentSelectField()}
        {renderUserSelectField('owner', '账号负责人')}
        {renderUserSelectField('currentUser', '主要使用人')}
        {renderTextField('serviceProvider', '外部服务商')}
      </BusinessFormSection>
      <BusinessFormSection step={4} solidStep title={ASSET_FORM_SECTIONS.account[3].title} summary={sectionSummary(['businessScene', 'controlStatus', 'monthlyFee', 'accountStatus'], ASSET_FORM_SECTIONS.account[3].summary)} errorCount={sectionErrorCount(['controlStatus', 'accountStatus'])}>
        {renderTextField('businessScene', '业务场景')}
        {renderSelectField('controlStatus', '账号控制权', ['已掌控', '待交接', '离职待回收', '已回收'], { required: true })}
        {renderTextField('monthlyFee', '月费用', { type: 'number' })}
        {renderTextField('expiresAt', '到期日', { type: 'date' })}
        {renderSelectField('accountStatus', '账号状态', ['使用中', '闲置', '异常', '封禁', '已注销'], { required: true })}
        <Box
          sx={{
            gridColumn: '1 / -1',
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            alignItems: 'stretch',
            gap: 2,
          }}
        >
          {renderTextField('purpose', '用途', { multiline: true })}
          {renderTextField('remark', '备注', { multiline: true })}
        </Box>
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
        创建发布批次
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
                  showFeedback('当前账号没有发布批次权限');
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
                      secondary={disabled ? '缺少主要使用人，不能派发' : `${account.currentUser} / ${account.department || '-'}`}
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
          创建批次并派发员工任务
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

  const renderDeviceAccountDrawer = () => {
    const device = deviceAccountDrawer.device
      || (deviceAccountDrawer.deviceId ? deviceById.get(deviceAccountDrawer.deviceId) : undefined);
    const deviceTitle = device ? `${device.deviceCode} / ${device.deviceName}` : '设备';
    return (
      <Drawer
        anchor="right"
        open={deviceAccountDrawer.open}
        onClose={closeDeviceAccountDrawer}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 680, md: 760 },
            maxWidth: '100vw',
            bgcolor: '#F7F9FC',
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.25, bgcolor: '#fff', borderBottom: `1px solid ${shell.softLine}` }}>
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                  <Typography variant="h6" sx={{ fontWeight: 900, color: shell.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {deviceTitle}
                  </Typography>
                  <Chip size="small" label={`${deviceAccountDrawer.total} 个`} sx={{ fontWeight: 900, bgcolor: '#EAF2FF', color: shell.blue }} />
                </Stack>
                <Typography variant="body2" sx={{ color: shell.muted, mt: 0.5 }}>
                  当前实际登录在该设备上的互联网账号
                </Typography>
              </Box>
              <IconButton aria-label="关闭互联网账号明细" onClick={closeDeviceAccountDrawer} sx={{ flexShrink: 0 }}>
                <CloseIcon />
              </IconButton>
            </Stack>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 1.5, sm: 3 }, py: 2 }}>
            {deviceAccountDrawer.loading ? (
              <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: shell.muted }}>正在加载互联网账号...</Paper>
            ) : deviceAccountDrawer.error ? (
              <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                <Typography sx={{ color: '#C62828', mb: 1.5 }}>{deviceAccountDrawer.error}</Typography>
                <Button
                  variant="outlined"
                  onClick={() => deviceAccountDrawer.deviceId && void loadDeviceAccountDrawer(
                    deviceAccountDrawer.deviceId,
                    deviceAccountDrawer.page,
                    deviceAccountDrawer.pageSize,
                  )}
                >
                  重新加载
                </Button>
              </Paper>
            ) : deviceAccountDrawer.items.length ? (
              <Stack spacing={1.25}>
                {deviceAccountDrawer.items.map((account) => (
                  <Paper
                    key={account.id}
                    variant="outlined"
                    sx={{ p: { xs: 1.5, sm: 2 }, borderColor: shell.softLine, borderRadius: 2, boxShadow: '0 3px 12px rgba(15, 23, 42, 0.04)' }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <PlatformBrandMark platform={account.platform} size={44} />
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={0.75}>
                          <Typography sx={{ fontWeight: 900, color: shell.ink, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {account.accountName}
                          </Typography>
                          <Chip size="small" label={account.accountStatus} sx={chipSx(statusTone(account.accountStatus))} />
                        </Stack>
                        <Typography variant="body2" sx={{ color: shell.muted, mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {displayAccountLogin(account)}
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        endIcon={<ChevronRightIcon />}
                        onClick={() => openAccountDetailFromDeviceDrawer(account.id)}
                        sx={{ flexShrink: 0, fontWeight: 900 }}
                      >
                        查看详情
                      </Button>
                    </Stack>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25, mt: 1.5, pt: 1.5, borderTop: `1px solid ${shell.softLine}` }}>
                      <Box>
                        <Typography variant="caption" sx={{ color: shell.muted }}>账号类型</Typography>
                        <Typography variant="body2" sx={{ color: shell.ink, fontWeight: 800 }}>{account.accountCategory || '未配置'}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: shell.muted }}>当前使用人</Typography>
                        <Typography variant="body2" sx={{ color: shell.ink, fontWeight: 800 }}>{account.currentUser || '未分配'}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: shell.muted }}>控制权</Typography>
                        <Typography variant="body2" sx={{ color: shell.ink, fontWeight: 800 }}>{readAccountControlStatus(account) || account.permissionStatus}</Typography>
                      </Box>
                    </Box>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Paper variant="outlined" sx={{ p: 5, textAlign: 'center' }}>
                <Typography sx={{ color: shell.ink, fontWeight: 900 }}>暂无互联网账号</Typography>
                <Typography variant="body2" sx={{ color: shell.muted, mt: 0.5 }}>可在互联网账号资料中选择该设备作为登录设备。</Typography>
              </Paper>
            )}
          </Box>

          <Box sx={{ bgcolor: '#fff', borderTop: `1px solid ${shell.softLine}` }}>
            {deviceAccountDrawer.total > 0 ? (
              <TablePagination
                count={deviceAccountDrawer.total}
                page={deviceAccountDrawer.page}
                rowsPerPage={deviceAccountDrawer.pageSize}
                rowsPerPageOptions={[10, 20, 50]}
                onPageChange={(_, nextPage) => deviceAccountDrawer.deviceId && void loadDeviceAccountDrawer(deviceAccountDrawer.deviceId, nextPage, deviceAccountDrawer.pageSize)}
                onRowsPerPageChange={(event) => deviceAccountDrawer.deviceId && void loadDeviceAccountDrawer(deviceAccountDrawer.deviceId, 0, Number(event.target.value))}
                sx={{ ...assetPaginationSx, border: 0, borderRadius: 0, '& .MuiTablePagination-toolbar': { minHeight: 52, px: { xs: 1, sm: 2 } } }}
              />
            ) : null}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: { xs: 2, sm: 3 }, py: 1.5, borderTop: deviceAccountDrawer.total > 0 ? `1px solid ${shell.softLine}` : 0 }}>
              <Button onClick={goToDeviceAccounts} endIcon={<ChevronRightIcon />} sx={{ fontWeight: 900 }}>
                前往互联网账号管理
              </Button>
            </Box>
          </Box>
        </Box>
      </Drawer>
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
        description="管理设备、手机号与互联网账号，明确管理责任、实际使用与资产交接。"
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
      {renderDeviceAccountDrawer()}
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
