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
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
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
  onSelect: (shop: BrowserShopBinding) => void;
  onEdit: (shop: BrowserShopBinding) => void;
  onToggleActive: (shop: BrowserShopBinding) => void;
};

export function BrowserShopBindingList({ rows, selectedShopId, onSelect, onEdit, onToggleActive }: ShopListProps) {
  if (!rows.length) return <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: '#64748b' }}>暂无符合条件的店铺绑定</Paper>;

  const selectWithKeyboard = (event: React.KeyboardEvent, shop: BrowserShopBinding) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(shop);
  };

  return <>
    <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: 'none', md: 'block' } }}>
      <Table size="small">
        <TableHead><TableRow>
          <TableCell>店铺名称</TableCell>
          <TableCell>稳定店铺标识</TableCell>
          <TableCell>平台店铺ID</TableCell>
          <TableCell>店铺别名</TableCell>
          <TableCell>来源</TableCell>
          <TableCell>状态</TableCell>
          <TableCell align="right">操作</TableCell>
        </TableRow></TableHead>
        <TableBody role="listbox" aria-label="店铺绑定">{rows.map((shop) => <TableRow
          data-view="desktop" data-row-id={shop.id} key={shop.id} hover selected={selectedShopId === shop.id}
          role="option" tabIndex={0} aria-selected={selectedShopId === shop.id}
          aria-label={`选择店铺 ${shop.displayName}`}
          onClick={() => onSelect(shop)} onKeyDown={(event) => selectWithKeyboard(event, shop)} sx={{ cursor: 'pointer' }}
        >
          <TableCell sx={{ fontWeight: 700 }}>{shop.displayName}</TableCell>
          <TableCell>{shop.shopKey}</TableCell>
          <TableCell>{shop.platformShopId || '-'}</TableCell>
          <TableCell>{shop.aliases.join('、') || '-'}</TableCell>
          <TableCell>{sourceLabel(shop)}</TableCell>
          <TableCell>{statusChip(shop.active)}</TableCell>
          <TableCell align="right" onClick={(event) => event.stopPropagation()}>
            <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => onEdit(shop)}>编辑</Button>
            <Button size="small" color={shop.active ? 'warning' : 'success'} onClick={() => onToggleActive(shop)}>
              {shop.active ? '停用' : '启用'}
            </Button>
          </TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </TableContainer>

    <Stack spacing={1.25} role="listbox" aria-label="店铺绑定" sx={{ display: { xs: 'flex', md: 'none' } }}>
      {rows.map((shop) => <Paper
        data-view="mobile" data-row-id={shop.id} key={shop.id} variant="outlined"
        role="option" tabIndex={0} aria-selected={selectedShopId === shop.id}
        aria-label={`选择店铺 ${shop.displayName}`}
        onClick={() => onSelect(shop)} onKeyDown={(event) => selectWithKeyboard(event, shop)}
        sx={{ p: 2, borderColor: selectedShopId === shop.id ? 'primary.main' : undefined }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
          <Box><Typography fontWeight={700}>{shop.displayName}</Typography><Typography variant="caption" color="text.secondary">{shop.platform}</Typography></Box>
          {statusChip(shop.active)}
        </Stack>
        <Stack spacing={0.5} sx={{ mt: 1.5 }}>
          <Typography variant="body2">稳定店铺标识：{shop.shopKey}</Typography>
          <Typography variant="body2">平台店铺ID：{shop.platformShopId || '-'}</Typography>
          <Typography variant="body2">店铺别名：{shop.aliases.join('、') || '-'}</Typography>
          <Typography variant="body2">来源：{sourceLabel(shop)}</Typography>
        </Stack>
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }} onClick={(event) => event.stopPropagation()}>
          <Button size="small" onClick={() => onEdit(shop)}>编辑</Button>
          <Button size="small" color={shop.active ? 'warning' : 'success'} onClick={() => onToggleActive(shop)}>{shop.active ? '停用' : '启用'}</Button>
        </Stack>
      </Paper>)}
    </Stack>
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
            <TableCell align="right"><Button size="small" onClick={() => onEdit(mapping)}>编辑</Button>{mapping.active ? <Button size="small" color="warning" onClick={() => onDisable(mapping)}>停用</Button> : null}</TableCell>
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
          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}><Button size="small" onClick={() => onEdit(mapping)}>编辑</Button>{mapping.active ? <Button size="small" color="warning" onClick={() => onDisable(mapping)}>停用</Button> : null}</Stack>
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
  platform: string;
  shopKey: string;
  platformShopId: string;
  displayName: string;
  aliasesText: string;
  active: boolean;
};

type MappingDraft = BrowserProductMappingInput & { aliasesText: string };

const emptyCatalog: BrowserAgentCatalog = { shops: [], mappings: [], products: [] };
const emptyShopDraft: ShopDraft = { platform: 'DOUYIN', shopKey: '', platformShopId: '', displayName: '', aliasesText: '', active: true };

const splitLines = (value: string) => [...new Set(value.split(/[\n，,]/).map((item) => item.trim()).filter(Boolean))];

const BrowserAgentConfigPage: React.FC = () => {
  const [catalog, setCatalog] = useState<BrowserAgentCatalog>(emptyCatalog);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [shopQuery, setShopQuery] = useState('');
  const [shopStatus, setShopStatus] = useState<StatusFilter>('all');
  const [shopPage, setShopPage] = useState(0);
  const [shopPageSize, setShopPageSize] = useState(5);
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

  const load = async (): Promise<boolean> => {
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
      setSelectedShopId((current) => catalogResponse.data!.shops.some((shop) => shop.id === current)
        ? current
        : (catalogResponse.data!.shops[0]?.id || ''));
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
    () => buildBrowserShopPage(catalog.shops, { query: shopQuery, status: shopStatus }, shopPage, shopPageSize),
    [catalog.shops, shopPage, shopPageSize, shopQuery, shopStatus],
  );
  const selectedShop = catalog.shops.find((shop) => shop.id === selectedShopId) || null;
  const mappingResult = useMemo(() => buildBrowserMappingPage(
    catalog.mappings.filter((mapping) => mapping.shopBindingId === selectedShopId),
    { query: mappingQuery, status: mappingStatus },
    mappingPage,
    mappingPageSize,
  ), [catalog.mappings, mappingPage, mappingPageSize, mappingQuery, mappingStatus, selectedShopId]);
  const activeProducts = useMemo(() => products.filter((product) => product.isActive), [products]);
  const productPrices = useMemo(() => new Map([
    ...catalog.products.map((product) => [product.id, product.price] as const),
    ...products.map((product) => [product.id, product.price] as const),
  ]), [catalog.products, products]);

  useEffect(() => { if (shopResult.page !== shopPage) setShopPage(shopResult.page); }, [shopPage, shopResult.page]);
  useEffect(() => { if (mappingResult.page !== mappingPage) setMappingPage(mappingResult.page); }, [mappingPage, mappingResult.page]);

  const openShopForm = (shop?: BrowserShopBinding) => {
    setEditingShop(shop || null);
    setShopDraft(shop ? {
      platform: shop.platform,
      shopKey: shop.shopKey,
      platformShopId: shop.platformShopId || '',
      displayName: shop.displayName,
      aliasesText: shop.aliases.join('\n'),
      active: shop.active,
    } : emptyShopDraft);
    setShopFormOpen(true);
  };

  const saveShop = async () => {
    const input: BrowserShopInput = {
      platform: shopDraft.platform,
      shopKey: shopDraft.shopKey,
      platformShopId: shopDraft.platformShopId,
      displayName: shopDraft.displayName,
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
      if (await load()) void alert('店铺绑定已保存', '保存成功');
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
      if (await load()) void alert('商品映射已保存', '保存成功');
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
      <Box><Typography variant="h6" fontWeight={700}>平台商品映射</Typography><Typography variant="body2" color="text.secondary">管理插件可选店铺，并把平台商品名称与OS标准产品稳定绑定。</Typography></Box>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => openShopForm()}>新增店铺绑定</Button>
    </Stack>

    {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress size={28} /></Box> : <>
      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" fontWeight={700}>店铺绑定</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ my: 1.5 }}>
          <TextField size="small" label="搜索店铺" value={shopQuery} onChange={(event) => { setShopQuery(event.target.value); setShopPage(0); }} sx={{ minWidth: 240 }} />
          <TextField select size="small" label="状态" value={shopStatus} onChange={(event) => { setShopStatus(event.target.value as StatusFilter); setShopPage(0); }} sx={{ minWidth: 120 }}>
            <MenuItem value="all">全部</MenuItem><MenuItem value="active">启用</MenuItem><MenuItem value="inactive">停用</MenuItem>
          </TextField>
        </Stack>
        <BrowserShopBindingList rows={shopResult.rows} selectedShopId={selectedShopId} onSelect={(shop) => { setSelectedShopId(shop.id); setMappingPage(0); }} onEdit={openShopForm} onToggleActive={(shop) => void toggleShop(shop)} />
        <TablePagination count={shopResult.total} page={shopResult.page} rowsPerPage={shopResult.pageSize} rowsPerPageOptions={[5, 10, 20, 50]} onPageChange={(_event, page) => setShopPage(page)} onRowsPerPageChange={(event) => { setShopPageSize(Number(event.target.value)); setShopPage(0); }} labelRowsPerPage="每页条数" labelDisplayedRows={formatPaginationRows} sx={{ mt: 1.5 }} />
      </Box>

      <Box sx={{ mt: 4 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={1}>
          <Box><Typography variant="subtitle1" fontWeight={700}>商品映射</Typography><Typography variant="body2" color="text.secondary">当前店铺：{selectedShop?.displayName || '未选择'}</Typography></Box>
          <Button variant="outlined" startIcon={<LinkOutlinedIcon />} disabled={!selectedShopId || activeProducts.length === 0} onClick={() => openMappingForm()}>新增商品映射</Button>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ my: 1.5 }}>
          <TextField size="small" label="搜索平台商品或OS产品" value={mappingQuery} onChange={(event) => { setMappingQuery(event.target.value); setMappingPage(0); }} sx={{ minWidth: 280 }} />
          <TextField select size="small" label="状态" value={mappingStatus} onChange={(event) => { setMappingStatus(event.target.value as StatusFilter); setMappingPage(0); }} sx={{ minWidth: 120 }}>
            <MenuItem value="all">全部</MenuItem><MenuItem value="active">启用</MenuItem><MenuItem value="inactive">停用</MenuItem>
          </TextField>
        </Stack>
        <BrowserMappingResults pageResult={mappingResult} productPrices={productPrices} onEdit={openMappingForm} onDisable={(mapping) => void disableMapping(mapping)} onPageChange={setMappingPage} onPageSizeChange={(value) => { setMappingPageSize(value); setMappingPage(0); }} />
      </Box>
    </>}

    <Dialog open={shopFormOpen} onClose={() => !submitting && setShopFormOpen(false)} maxWidth="sm" fullWidth>
      <DialogCloseTitle onClose={() => setShopFormOpen(false)} closeDisabled={submitting}>{editingShop ? '编辑店铺绑定' : '新增店铺绑定'}</DialogCloseTitle>
      <DialogContent dividers><Stack spacing={2}>
        <TextField label="平台" value={shopDraft.platform} disabled={Boolean(editingShop)} onChange={(event) => setShopDraft((draft) => ({ ...draft, platform: event.target.value }))} />
        <TextField label="店铺名称" value={shopDraft.displayName} onChange={(event) => setShopDraft((draft) => ({ ...draft, displayName: event.target.value }))} />
        <TextField label="稳定店铺标识" value={shopDraft.shopKey} disabled={Boolean(editingShop)} helperText="创建后不可修改" onChange={(event) => setShopDraft((draft) => ({ ...draft, shopKey: event.target.value }))} />
        <TextField label="平台店铺ID" value={shopDraft.platformShopId} onChange={(event) => setShopDraft((draft) => ({ ...draft, platformShopId: event.target.value }))} />
        <TextField label="店铺别名" value={shopDraft.aliasesText} multiline minRows={2} helperText="每行一个，用于校验页面店铺" onChange={(event) => setShopDraft((draft) => ({ ...draft, aliasesText: event.target.value }))} />
        <TextField label="来源" value={editingShop ? sourceLabel(editingShop) : '公司资源 / 抖音电商 / 飞鸽客服'} InputProps={{ readOnly: true }} helperText="来源由系统固定，不参与映射条件" />
        {!editingShop ? <FormControlLabel control={<Switch checked={shopDraft.active} onChange={(_event, checked) => setShopDraft((draft) => ({ ...draft, active: checked }))} />} label="启用店铺" /> : null}
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setShopFormOpen(false)} disabled={submitting}>取消</Button><Button variant="contained" onClick={() => void saveShop()} disabled={submitting || !shopDraft.displayName.trim() || !shopDraft.shopKey.trim()}>保存</Button></DialogActions>
    </Dialog>

    <Dialog open={mappingFormOpen} onClose={() => !submitting && setMappingFormOpen(false)} maxWidth="sm" fullWidth>
      <DialogCloseTitle onClose={() => setMappingFormOpen(false)} closeDisabled={submitting}>{editingMapping ? '编辑商品映射' : '新增商品映射'}</DialogCloseTitle>
      <DialogContent dividers>{mappingDraft ? <Stack spacing={2}>
        <TextField label="所属店铺" value={selectedShop?.displayName || ''} InputProps={{ readOnly: true }} />
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
