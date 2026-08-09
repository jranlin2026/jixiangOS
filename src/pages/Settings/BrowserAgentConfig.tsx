import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
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
import AddIcon from '@mui/icons-material/Add';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { browserAgentConfigApi, productApi } from '../../api';
import type { Product } from '../../types/product';
import type {
  BrowserAgentCatalog,
  BrowserProductMapping,
  BrowserProductMappingInput,
  BrowserShopBinding,
  BrowserShopInput,
} from '../../types/browserAgent';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import TablePagination from '../../shared/components/TablePagination';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import { formatCurrency, formatDateTime, formatPaginationRows } from '../../shared/utils/formatters';

type StatusFilter = 'all' | 'active' | 'inactive';

export type BrowserMappingPage = {
  rows: BrowserProductMapping[];
  total: number;
  page: number;
  pageSize: number;
};

function clampPage(total: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
  return Math.min(Math.max(page, 0), totalPages - 1);
}

function matchesStatus(active: boolean, status: StatusFilter) {
  return status === 'all' || (status === 'active' ? active : !active);
}

export function buildBrowserMappingPage(
  mappings: BrowserProductMapping[],
  filters: { query: string; status: StatusFilter },
  page: number,
  pageSize: number,
): BrowserMappingPage {
  const query = filters.query.trim().toLocaleLowerCase('zh-CN');
  const filtered = mappings.filter((mapping) => {
    if (!matchesStatus(mapping.active, filters.status)) return false;
    if (!query) return true;
    return [
      mapping.platformProductName,
      mapping.platformProductId,
      mapping.platformSkuId,
      mapping.osProductName,
      ...mapping.aliases,
    ].some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(query));
  });
  const safePage = clampPage(filtered.length, page, pageSize);
  const start = safePage * pageSize;
  return { rows: filtered.slice(start, start + pageSize), total: filtered.length, page: safePage, pageSize };
}

function buildBrowserShopPage(
  shops: BrowserShopBinding[],
  filters: { query: string; status: StatusFilter },
  page: number,
  pageSize: number,
) {
  const query = filters.query.trim().toLocaleLowerCase('zh-CN');
  const filtered = shops.filter((shop) => {
    if (!matchesStatus(shop.active, filters.status)) return false;
    if (!query) return true;
    return [shop.displayName, shop.shopKey, shop.platformShopId, ...shop.aliases]
      .some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(query));
  });
  const safePage = clampPage(filtered.length, page, pageSize);
  return {
    rows: filtered.slice(safePage * pageSize, (safePage + 1) * pageSize),
    total: filtered.length,
    page: safePage,
    pageSize,
  };
}

function sourceLabel(shop: BrowserShopBinding) {
  return [shop.sourceType, shop.source, shop.sourceName].filter(Boolean).join(' / ') || '-';
}

function statusChip(active: boolean) {
  return <Chip size="small" color={active ? 'success' : 'default'} variant={active ? 'filled' : 'outlined'} label={active ? '启用' : '停用'} />;
}

type ShopListProps = {
  rows: BrowserShopBinding[];
  selectedShopId: string;
  mappingCounts: Map<string, number>;
  onSelect: (shop: BrowserShopBinding) => void;
};

const platformLabel = (platform: string) => platform.toUpperCase() === 'DOUYIN' ? '抖音小店' : platform;

export function BrowserShopBindingList({ rows, selectedShopId, mappingCounts, onSelect }: ShopListProps) {
  if (!rows.length) return <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', color: '#64748b', borderStyle: 'dashed' }}>没有找到符合条件的店铺</Paper>;

  const selectWithKeyboard = (event: React.KeyboardEvent, shop: BrowserShopBinding) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target instanceof Element ? event.target : null;
    const interactiveTarget = target?.closest('button, input, select, textarea, a, [role="button"]');
    if (interactiveTarget && interactiveTarget !== event.currentTarget) return;
    event.preventDefault();
    onSelect(shop);
  };

  const list = (view: 'desktop' | 'mobile') => <Stack role="listbox" aria-label="店铺绑定" spacing={1}>
    {rows.map((shop) => {
      const selected = selectedShopId === shop.id;
      return <Paper
        data-view={view} data-row-id={shop.id} key={shop.id} variant="outlined"
        role="option" tabIndex={0} aria-selected={selected}
        aria-label={`选择店铺 ${shop.displayName}`}
        onClick={() => onSelect(shop)} onKeyDown={(event) => selectWithKeyboard(event, shop)}
        sx={{
          position: 'relative', p: 1.75, pl: 2, cursor: 'pointer', overflow: 'hidden',
          borderColor: selected ? 'primary.main' : '#e2e8f0',
          bgcolor: selected ? '#eff6ff' : '#fff',
          boxShadow: selected ? '0 8px 24px rgba(37, 99, 235, 0.10)' : 'none',
          transition: 'border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease',
          '&::before': selected ? { content: '""', position: 'absolute', inset: '0 auto 0 0', width: 4, bgcolor: 'primary.main' } : undefined,
          '&:hover': { borderColor: selected ? 'primary.main' : '#93c5fd', bgcolor: selected ? '#eff6ff' : '#f8fbff' },
          '&:focus-visible': { outline: '3px solid rgba(37, 99, 235, 0.24)', outlineOffset: 2 },
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Typography fontWeight={800} noWrap>{shop.displayName}</Typography>
              {selected ? <CheckCircleRoundedIcon color="primary" sx={{ fontSize: 18 }} /> : null}
            </Stack>
            <Typography variant="caption" color="text.secondary">{platformLabel(shop.platform)} · {shop.active ? '已启用' : '已停用'}</Typography>
          </Box>
          <Chip size="small" label={`${mappingCounts.get(shop.id) || 0} 个映射`} sx={{ bgcolor: selected ? '#dbeafe' : '#f1f5f9', color: selected ? '#1d4ed8' : '#475569', fontWeight: 700 }} />
        </Stack>
      </Paper>;
    })}
  </Stack>;

  return <>
    <Box sx={{ display: { xs: 'none', md: 'block' } }}>{list('desktop')}</Box>
    <Box sx={{ display: { xs: 'block', md: 'none' } }}>{list('mobile')}</Box>
  </>;
}

type MappingResultsProps = {
  pageResult: BrowserMappingPage;
  productPrices: Map<string, number>;
  onEdit: (mapping: BrowserProductMapping) => void;
  onDisable: (mapping: BrowserProductMapping) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function BrowserMappingResults({
  pageResult,
  productPrices,
  onEdit,
  onDisable,
  onPageChange,
  onPageSizeChange,
}: MappingResultsProps) {
  const price = (mapping: BrowserProductMapping) => formatCurrency(productPrices.get(mapping.osProductId) ?? 0);
  return <>
    {pageResult.rows.length ? <>
      <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: 'none', md: 'block' } }}>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>平台商品名称</TableCell>
            <TableCell>平台商品ID</TableCell>
            <TableCell>SKU</TableCell>
            <TableCell>OS标准产品</TableCell>
            <TableCell>OS参考价</TableCell>
            <TableCell>状态</TableCell>
            <TableCell>最近更新时间</TableCell>
            <TableCell align="right">操作</TableCell>
          </TableRow></TableHead>
          <TableBody>{pageResult.rows.map((mapping) => <TableRow data-view="desktop" data-row-id={mapping.id} key={mapping.id} hover>
            <TableCell><Typography variant="body2" fontWeight={600}>{mapping.platformProductName || '-'}</Typography><Typography variant="caption" color="text.secondary">别名：{mapping.aliases.join('、') || '-'}</Typography></TableCell>
            <TableCell>{mapping.platformProductId || '-'}</TableCell>
            <TableCell>{mapping.platformSkuId || '-'}</TableCell>
            <TableCell>{mapping.osProductName}</TableCell>
            <TableCell>{price(mapping)}</TableCell>
            <TableCell>{statusChip(mapping.active)}</TableCell>
            <TableCell>{formatDateTime(mapping.updatedAt || mapping.confirmedAt)}</TableCell>
            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
              <Tooltip title="编辑映射" arrow>
                <IconButton size="small" color="primary" aria-label={`编辑商品映射 ${mapping.platformProductName}`} onClick={() => onEdit(mapping)}>
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {mapping.active ? <Tooltip title="停用映射" arrow>
                <IconButton size="small" color="warning" aria-label={`停用商品映射 ${mapping.platformProductName}`} onClick={() => onDisable(mapping)}>
                  <BlockOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip> : null}
            </TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </TableContainer>

      <Stack spacing={1.25} sx={{ display: { xs: 'flex', md: 'none' } }}>
        {pageResult.rows.map((mapping) => <Paper data-view="mobile" data-row-id={mapping.id} key={mapping.id} variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" gap={1}><Typography fontWeight={700}>{mapping.platformProductName || '-'}</Typography>{statusChip(mapping.active)}</Stack>
          <Stack spacing={0.5} sx={{ mt: 1.5 }}>
            <Typography variant="body2">平台商品ID：{mapping.platformProductId || '-'}</Typography>
            <Typography variant="body2">SKU：{mapping.platformSkuId || '-'}</Typography>
            <Typography variant="body2">平台商品别名：{mapping.aliases.join('、') || '-'}</Typography>
            <Typography variant="body2">OS标准产品：{mapping.osProductName}</Typography>
            <Typography variant="body2">OS参考价：{price(mapping)}</Typography>
            <Typography variant="body2">最近更新时间：{formatDateTime(mapping.updatedAt || mapping.confirmedAt)}</Typography>
          </Stack>
          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
            <Tooltip title="编辑映射" arrow><IconButton size="small" color="primary" aria-label={`编辑商品映射 ${mapping.platformProductName}`} onClick={() => onEdit(mapping)}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
            {mapping.active ? <Tooltip title="停用映射" arrow><IconButton size="small" color="warning" aria-label={`停用商品映射 ${mapping.platformProductName}`} onClick={() => onDisable(mapping)}><BlockOutlinedIcon fontSize="small" /></IconButton></Tooltip> : null}
          </Stack>
        </Paper>)}
      </Stack>
    </> : <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: '#64748b' }}>暂无符合条件的商品映射</Paper>}

    <TablePagination
      count={pageResult.total}
      page={pageResult.page}
      rowsPerPage={pageResult.pageSize}
      rowsPerPageOptions={[5, 10, 20, 50]}
      onPageChange={(_event, page) => onPageChange(page)}
      onRowsPerPageChange={(event) => onPageSizeChange(Number(event.target.value))}
      labelRowsPerPage="每页条数"
      labelDisplayedRows={formatPaginationRows}
      sx={{ mt: 1.5 }}
    />
  </>;
}

type ShopDraft = {
  businessShopId: string;
  shopKey: string;
  platformShopId: string;
  aliasesText: string;
  active: boolean;
};

type MappingDraft = BrowserProductMappingInput & { aliasesText: string };

const emptyCatalog: BrowserAgentCatalog = { shops: [], mappings: [], products: [] };
const emptyShopDraft: ShopDraft = { businessShopId: '', shopKey: '', platformShopId: '', aliasesText: '', active: true };
const selectedShopStorageKey = 'jixiangos_browser_mapping_selected_shop';

const splitLines = (value: string) => [...new Set(value.split(/[\n，,]/).map((item) => item.trim()).filter(Boolean))];

const BrowserAgentConfigPage: React.FC = () => {
  const [catalog, setCatalog] = useState<BrowserAgentCatalog>(emptyCatalog);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [shopQuery, setShopQuery] = useState('');
  const [shopStatus, setShopStatus] = useState<StatusFilter>('all');
  const [mappingQuery, setMappingQuery] = useState('');
  const [mappingStatus, setMappingStatus] = useState<StatusFilter>('all');
  const [mappingPage, setMappingPage] = useState(0);
  const [mappingPageSize, setMappingPageSize] = useState(5);
  const [shopFormOpen, setShopFormOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<BrowserShopBinding | null>(null);
  const [shopDraft, setShopDraft] = useState<ShopDraft>(emptyShopDraft);
  const [mappingFormOpen, setMappingFormOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<BrowserProductMapping | null>(null);
  const [mappingDraft, setMappingDraft] = useState<MappingDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { alert, confirm, dialog: feedbackDialog } = useAppFeedback();

  const load = async (preferredShopId?: string): Promise<boolean> => {
    setLoading(true);
    try {
      const [catalogResponse, productResponse] = await Promise.all([
        browserAgentConfigApi.getCatalog(),
        productApi.getAllProducts(),
      ]);
      if (catalogResponse.code !== 0 || !catalogResponse.data) {
        await alert(catalogResponse.message || '平台商品映射加载失败', '加载失败');
        return false;
      }
      setCatalog(catalogResponse.data);
      if (productResponse.code === 0) setProducts(productResponse.data);
      setSelectedShopId((current) => {
        const params = new URLSearchParams(window.location.search);
        const requestedShopId = preferredShopId || params.get('shopId') || current || localStorage.getItem(selectedShopStorageKey) || '';
        const requestedBusinessShopId = params.get('businessShopId') || '';
        const requestedShop = catalogResponse.data!.shops.find((shop) => (
          shop.id === requestedShopId || (requestedBusinessShopId && shop.businessShopId === requestedBusinessShopId)
        ));
        return requestedShop?.id || catalogResponse.data!.shops.find((shop) => shop.active)?.id || catalogResponse.data!.shops[0]?.id || '';
      });
      return true;
    } catch (error) {
      await alert(error instanceof Error ? error.message : '平台商品映射加载失败', '加载失败');
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const showMutationTransportError = async (error: unknown, title: string) => {
    const message = error instanceof Error && error.message.trim()
      ? error.message
      : '网络请求失败，请检查连接后重试';
    await alert(message, title);
  };

  const shopResult = useMemo(
    () => buildBrowserShopPage(catalog.shops, { query: shopQuery, status: shopStatus }, 0, Math.max(catalog.shops.length, 1)),
    [catalog.shops, shopQuery, shopStatus],
  );
  const selectedShop = catalog.shops.find((shop) => shop.id === selectedShopId) || null;
  const mappingResult = useMemo(() => buildBrowserMappingPage(
    catalog.mappings.filter((mapping) => mapping.shopBindingId === selectedShopId),
    { query: mappingQuery, status: mappingStatus },
    mappingPage,
    mappingPageSize,
  ), [catalog.mappings, mappingPage, mappingPageSize, mappingQuery, mappingStatus, selectedShopId]);
  const activeProducts = useMemo(() => products.filter((product) => product.isActive), [products]);
  const businessShops = useMemo(() => (catalog.businessShops || []).filter((shop) => (
    shop.active && shop.platformCode.toUpperCase() === 'DOUYIN'
  )), [catalog.businessShops]);
  const selectableBusinessShops = useMemo(() => businessShops.filter((shop) => (
    shop.id === editingShop?.businessShopId
    || !catalog.shops.some((binding) => binding.businessShopId === shop.id && binding.id !== editingShop?.id)
  )), [businessShops, catalog.shops, editingShop?.businessShopId, editingShop?.id]);
  const productPrices = useMemo(() => new Map([
    ...catalog.products.map((product) => [product.id, product.price] as const),
    ...products.map((product) => [product.id, product.price] as const),
  ]), [catalog.products, products]);
  const mappingCounts = useMemo(() => {
    const counts = new Map<string, number>();
    catalog.mappings.forEach((mapping) => counts.set(mapping.shopBindingId, (counts.get(mapping.shopBindingId) || 0) + 1));
    return counts;
  }, [catalog.mappings]);

  useEffect(() => { if (mappingResult.page !== mappingPage) setMappingPage(mappingResult.page); }, [mappingPage, mappingResult.page]);

  const selectShop = (shop: BrowserShopBinding) => {
    setSelectedShopId(shop.id);
    setMappingPage(0);
    localStorage.setItem(selectedShopStorageKey, shop.id);
    const url = new URL(window.location.href);
    url.searchParams.set('shopId', shop.id);
    url.searchParams.delete('businessShopId');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const openShopForm = (shop?: BrowserShopBinding) => {
    setEditingShop(shop || null);
    setShopDraft(shop ? {
      businessShopId: shop.businessShopId || '',
      shopKey: shop.shopKey,
      platformShopId: shop.platformShopId || '',
      aliasesText: shop.aliases.join('\n'),
      active: shop.businessShopId ? shop.active : true,
    } : emptyShopDraft);
    setShopFormOpen(true);
  };

  const saveShop = async () => {
    const input: BrowserShopInput = {
      businessShopId: shopDraft.businessShopId,
      shopKey: shopDraft.shopKey,
      platformShopId: shopDraft.platformShopId,
      aliases: splitLines(shopDraft.aliasesText),
      active: shopDraft.active,
    };
    setSubmitting(true);
    try {
      const response = editingShop
        ? await browserAgentConfigApi.updateShop(editingShop.id, input)
        : await browserAgentConfigApi.createShop(input);
      if (response.code !== 0) return void await alert(response.message, '保存失败');
      setShopFormOpen(false);
      if (await load()) void alert('业务店铺接入已保存', '保存成功');
    } catch (error) {
      await showMutationTransportError(error, '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleShop = async (shop: BrowserShopBinding) => {
    if (shop.active && !await confirm(
      '停用后插件不能以该店铺创建新线索，历史记录保留',
      '停用店铺',
      { confirmText: '确认停用' },
    )) return;
    try {
      const response = await browserAgentConfigApi.updateShop(shop.id, { active: !shop.active });
      if (response.code !== 0) return void await alert(response.message, '更新失败');
      if (await load()) void alert(shop.active ? '店铺已停用' : '店铺已启用', '更新成功');
    } catch (error) {
      await showMutationTransportError(error, '更新失败');
    }
  };

  const openMappingForm = (mapping?: BrowserProductMapping) => {
    if (!selectedShopId) return void alert('请先新增并选择店铺');
    setEditingMapping(mapping || null);
    setMappingDraft({
      shopBindingId: selectedShopId,
      platformProductId: mapping?.platformProductId || '',
      platformSkuId: mapping?.platformSkuId || '',
      platformProductName: mapping?.platformProductName || '',
      aliases: mapping?.aliases || [],
      aliasesText: mapping?.aliases.join('\n') || '',
      osProductId: mapping?.osProductId || activeProducts[0]?.id || '',
      active: mapping?.active ?? true,
    });
    setMappingFormOpen(true);
  };

  const saveMapping = async () => {
    if (!mappingDraft) return;
    const input: BrowserProductMappingInput = {
      shopBindingId: mappingDraft.shopBindingId,
      platformProductId: mappingDraft.platformProductId || undefined,
      platformSkuId: mappingDraft.platformSkuId || undefined,
      platformProductName: mappingDraft.platformProductName,
      aliases: splitLines(mappingDraft.aliasesText),
      osProductId: mappingDraft.osProductId,
      active: mappingDraft.active,
    };
    setSubmitting(true);
    try {
      const response = editingMapping
        ? await browserAgentConfigApi.updateMapping(editingMapping.id, input)
        : await browserAgentConfigApi.createMapping(input);
      if (response.code !== 0) return void await alert(response.message, '保存失败');
      setMappingFormOpen(false);
      if (await load(input.shopBindingId)) void alert('商品映射已保存', '保存成功');
    } catch (error) {
      await showMutationTransportError(error, '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const disableMapping = async (mapping: BrowserProductMapping) => {
    if (!await confirm(`确定停用平台商品映射「${mapping.platformProductName}」吗？`, '停用商品映射')) return;
    try {
      const response = await browserAgentConfigApi.disableMapping(mapping.id);
      if (response.code !== 0) return void await alert(response.message, '停用失败');
      if (await load()) void alert('商品映射已停用', '停用成功');
    } catch (error) {
      await showMutationTransportError(error, '停用失败');
    }
  };

  return <Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={1}>
      <Box><Typography variant="h6" fontWeight={700}>平台商品映射</Typography><Typography variant="body2" color="text.secondary">店铺统一来自“业务平台与店铺”，本页只配置插件识别参数和商品映射。</Typography></Box>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => openShopForm()} disabled={!selectableBusinessShops.length}>接入已有业务店铺</Button>
    </Stack>

    {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress size={28} /></Box> : <Box
      sx={{ mt: 3, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2.5, alignItems: 'stretch' }}
    >
      <Paper
        variant="outlined"
        component="aside"
        aria-label="店铺导航"
        sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0, p: 2, bgcolor: '#f8fafc', borderColor: '#e2e8f0', borderRadius: 2.5 }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          <StorefrontOutlinedIcon color="primary" />
          <Typography variant="subtitle1" fontWeight={800}>选择店铺</Typography>
          <Chip size="small" label={`${shopResult.total} 家`} sx={{ ml: 'auto', bgcolor: '#e2e8f0', fontWeight: 700 }} />
        </Stack>
        <Typography variant="caption" color="text.secondary">选择后，右侧只显示该店铺的商品映射。</Typography>

        <TextField
          size="small" placeholder="搜索店铺" value={shopQuery}
          onChange={(event) => setShopQuery(event.target.value)}
          fullWidth sx={{ mt: 2, bgcolor: '#fff' }}
        />
        <TextField
          select size="small" label="店铺状态" value={shopStatus}
          onChange={(event) => setShopStatus(event.target.value as StatusFilter)}
          fullWidth sx={{ mt: 1, bgcolor: '#fff' }}
        >
          <MenuItem value="all">全部状态</MenuItem><MenuItem value="active">已启用</MenuItem><MenuItem value="inactive">已停用</MenuItem>
        </TextField>

        <Box sx={{ mt: 1.5, maxHeight: { md: 560 }, overflowY: { md: 'auto' }, pr: { md: 0.5 } }}>
          <BrowserShopBindingList rows={shopResult.rows} selectedShopId={selectedShopId} mappingCounts={mappingCounts} onSelect={selectShop} />
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ flex: 1, minWidth: 0, borderColor: '#dbe4f0', borderRadius: 2.5, overflow: 'hidden' }}>
        {selectedShop ? <>
          <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2.25, bgcolor: '#f8fbff', borderBottom: '1px solid #dbe4f0' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }} gap={2}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="overline" color="primary.main" fontWeight={800} letterSpacing={1}>当前店铺</Typography>
                <Typography variant="h5" fontWeight={800} sx={{ lineHeight: 1.25 }}>{selectedShop.displayName}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>当前店铺：{selectedShop.displayName}</Typography>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
                  <Chip size="small" label={platformLabel(selectedShop.platform)} variant="outlined" />
                  {statusChip(selectedShop.active)}
                  <Chip size="small" icon={<Inventory2OutlinedIcon />} label={`${mappingCounts.get(selectedShop.id) || 0} 个商品映射`} sx={{ bgcolor: '#eaf2ff', color: '#1d4ed8', fontWeight: 700 }} />
                  <Chip size="small" label={selectedShop.platformShopId ? `店铺ID：${selectedShop.platformShopId}` : '未填写平台店铺ID'} variant="outlined" />
                </Stack>
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => openShopForm(selectedShop)}>编辑接入</Button>
                <Button size="small" color={selectedShop.active ? 'warning' : 'success'} onClick={() => void toggleShop(selectedShop)}>
                  {selectedShop.active ? '停用店铺' : '启用店铺'}
                </Button>
                <Button variant="contained" size="small" startIcon={<LinkOutlinedIcon />} disabled={!selectedShop.active || activeProducts.length === 0} onClick={() => openMappingForm()}>新增商品映射</Button>
              </Stack>
            </Stack>
          </Box>

          <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={1.5}>
              <Box><Typography variant="subtitle1" fontWeight={800}>商品映射</Typography><Typography variant="body2" color="text.secondary">平台商品识别后，将自动匹配到对应的OS标准产品。</Typography></Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField size="small" placeholder="搜索平台商品或OS产品" value={mappingQuery} onChange={(event) => { setMappingQuery(event.target.value); setMappingPage(0); }} sx={{ minWidth: { sm: 260 } }} />
                <TextField select size="small" label="状态" value={mappingStatus} onChange={(event) => { setMappingStatus(event.target.value as StatusFilter); setMappingPage(0); }} sx={{ minWidth: 120 }}>
                  <MenuItem value="all">全部</MenuItem><MenuItem value="active">启用</MenuItem><MenuItem value="inactive">停用</MenuItem>
                </TextField>
              </Stack>
            </Stack>
            <Box sx={{ mt: 2 }}>
              <BrowserMappingResults pageResult={mappingResult} productPrices={productPrices} onEdit={openMappingForm} onDisable={(mapping) => void disableMapping(mapping)} onPageChange={setMappingPage} onPageSizeChange={(value) => { setMappingPageSize(value); setMappingPage(0); }} />
            </Box>
          </Box>
        </> : <Box sx={{ py: 10, px: 3, textAlign: 'center' }}>
          <StorefrontOutlinedIcon sx={{ fontSize: 48, color: '#94a3b8' }} />
          <Typography variant="h6" fontWeight={800} sx={{ mt: 1 }}>请先选择店铺</Typography>
          <Typography variant="body2" color="text.secondary">选择左侧店铺后，即可配置接入参数和商品映射。</Typography>
        </Box>}
      </Paper>
    </Box>}

    <Dialog open={shopFormOpen} onClose={() => !submitting && setShopFormOpen(false)} maxWidth="sm" fullWidth>
      <DialogCloseTitle onClose={() => setShopFormOpen(false)} closeDisabled={submitting}>{editingShop ? '编辑店铺接入' : '接入已有业务店铺'}</DialogCloseTitle>
      <DialogContent dividers><Stack spacing={2}>
        <TextField select label="业务平台 / 店铺" value={shopDraft.businessShopId} disabled={Boolean(editingShop?.businessShopId)} onChange={(event) => setShopDraft((draft) => ({ ...draft, businessShopId: event.target.value }))} helperText="店铺名称和启停状态请在“业务平台与店铺”统一维护">
          {selectableBusinessShops.map((shop) => <MenuItem key={shop.id} value={shop.id}>{shop.platformName} / {shop.name}</MenuItem>)}
        </TextField>
        <TextField label="稳定店铺标识" value={shopDraft.shopKey} disabled={Boolean(editingShop)} helperText="创建后不可修改" onChange={(event) => setShopDraft((draft) => ({ ...draft, shopKey: event.target.value }))} />
        <TextField label="平台店铺ID" value={shopDraft.platformShopId} onChange={(event) => setShopDraft((draft) => ({ ...draft, platformShopId: event.target.value }))} />
        <TextField label="店铺别名" value={shopDraft.aliasesText} multiline minRows={2} helperText="每行一个，用于校验页面店铺" onChange={(event) => setShopDraft((draft) => ({ ...draft, aliasesText: event.target.value }))} />
        <TextField label="来源" value={editingShop ? sourceLabel(editingShop) : '公司资源 / 抖音电商 / 飞鸽客服'} InputProps={{ readOnly: true }} helperText="来源由系统固定，不参与映射条件" />
        {!editingShop ? <FormControlLabel control={<Switch checked={shopDraft.active} onChange={(_event, checked) => setShopDraft((draft) => ({ ...draft, active: checked }))} />} label="启用店铺" /> : null}
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setShopFormOpen(false)} disabled={submitting}>取消</Button><Button variant="contained" onClick={() => void saveShop()} disabled={submitting || !shopDraft.businessShopId || !shopDraft.shopKey.trim()}>保存</Button></DialogActions>
    </Dialog>

    <Dialog open={mappingFormOpen} onClose={() => !submitting && setMappingFormOpen(false)} maxWidth="sm" fullWidth>
      <DialogCloseTitle onClose={() => setMappingFormOpen(false)} closeDisabled={submitting}>{editingMapping ? '编辑商品映射' : '新增商品映射'}</DialogCloseTitle>
      <DialogContent dividers>{mappingDraft ? <Stack spacing={2}>
        <TextField select label="所属店铺" value={mappingDraft.shopBindingId} disabled={Boolean(editingMapping)} onChange={(event) => setMappingDraft((draft) => draft && ({ ...draft, shopBindingId: event.target.value }))} helperText={editingMapping ? '商品映射创建后不能换店；需要换店请新建映射' : '可直接选择要配置的店铺'}>
          {catalog.shops.map((shop) => <MenuItem key={shop.id} value={shop.id} disabled={!shop.active && shop.id !== mappingDraft.shopBindingId}>{shop.displayName}{shop.active ? '' : '（已停用）'}</MenuItem>)}
        </TextField>
        <TextField label="平台商品名称" value={mappingDraft.platformProductName} onChange={(event) => setMappingDraft((draft) => draft && ({ ...draft, platformProductName: event.target.value }))} />
        <TextField label="平台商品ID" value={mappingDraft.platformProductId || ''} onChange={(event) => setMappingDraft((draft) => draft && ({ ...draft, platformProductId: event.target.value }))} />
        <TextField label="SKU" value={mappingDraft.platformSkuId || ''} onChange={(event) => setMappingDraft((draft) => draft && ({ ...draft, platformSkuId: event.target.value }))} />
        <TextField label="平台商品别名" value={mappingDraft.aliasesText} multiline minRows={3} helperText="每行一个；名称与别名按行编辑" onChange={(event) => setMappingDraft((draft) => draft && ({ ...draft, aliasesText: event.target.value }))} />
        <TextField select label="OS标准产品" value={mappingDraft.osProductId} onChange={(event) => setMappingDraft((draft) => draft && ({ ...draft, osProductId: event.target.value }))} helperText="仅显示OS已启用产品">
          {activeProducts.map((product) => <MenuItem key={product.id} value={product.id}>{product.name} / 参考价 {formatCurrency(product.price)}</MenuItem>)}
        </TextField>
        <FormControlLabel control={<Switch checked={mappingDraft.active} onChange={(_event, checked) => setMappingDraft((draft) => draft && ({ ...draft, active: checked }))} />} label="启用映射" />
      </Stack> : null}</DialogContent>
      <DialogActions><Button onClick={() => setMappingFormOpen(false)} disabled={submitting}>取消</Button><Button variant="contained" onClick={() => void saveMapping()} disabled={submitting || !mappingDraft?.platformProductName.trim() || !mappingDraft?.osProductId}>保存</Button></DialogActions>
    </Dialog>
    {feedbackDialog}
  </Box>;
};

export default BrowserAgentConfigPage;
