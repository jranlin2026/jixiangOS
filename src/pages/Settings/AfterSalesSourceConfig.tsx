import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
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
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import { settingsApi } from '../../api';
import type { AfterSalesSourceConfig } from '../../types/settings';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import OperationFeedbackDialog, { type OperationFeedbackSeverity } from '../../shared/components/OperationFeedbackDialog';
import BusinessPlatformBrand, {
  BUSINESS_PLATFORM_PRESETS,
  findBusinessPlatformPreset,
  type BusinessPlatformPresetKey,
} from '../../shared/components/BusinessPlatformBrand';

type EditorState = {
  kind: 'platform' | 'shop';
  item: AfterSalesSourceConfig | null;
  parentId?: string;
  name: string;
  platformChoice?: BusinessPlatformPresetKey | 'custom';
};

const emptyEditor: EditorState = { kind: 'platform', item: null, name: '' };

const AfterSalesSourceConfigPage: React.FC = () => {
  const [, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<AfterSalesSourceConfig[]>([]);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [editorOpen, setEditorOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: OperationFeedbackSeverity; message: string } | null>(null);
  const platforms = useMemo(() => items.filter((item) => !item.parentId).sort((a, b) => a.sortOrder - b.sortOrder), [items]);

  const load = async () => {
    const response = await settingsApi.fetchAfterSalesSourceConfigs();
    if (response.code === 0) setItems(response.data);
  };
  useEffect(() => { void load(); }, []);

  const openEditor = (kind: EditorState['kind'], item?: AfterSalesSourceConfig, parentId?: string) => {
    const preset = kind === 'platform' ? findBusinessPlatformPreset(item?.name) : undefined;
    setEditor({
      kind,
      item: item || null,
      parentId: parentId || item?.parentId,
      name: item?.name || '',
      platformChoice: kind === 'platform' && item ? (preset?.key || 'custom') : undefined,
    });
    setEditorOpen(true);
  };

  const save = async () => {
    const name = editor.name.trim();
    if (!name) return;
    setSubmitting(true);
    try {
      const siblings = items.filter((item) => (item.parentId || '') === (editor.parentId || ''));
      const response = editor.item
        ? await settingsApi.updateAfterSalesSourceConfig(editor.item.id, { name })
        : await settingsApi.createAfterSalesSourceConfig({ name, parentId: editor.parentId, isActive: true, sortOrder: siblings.length + 1 });
      setFeedback({ severity: response.code === 0 ? 'success' : 'error', message: response.code === 0 ? `${editor.kind === 'platform' ? '平台' : '店铺'}已保存` : response.message });
      if (response.code === 0) {
        setEditorOpen(false);
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (item: AfterSalesSourceConfig) => {
    const response = await settingsApi.updateAfterSalesSourceConfig(item.id, { isActive: !item.isActive });
    setFeedback({ severity: response.code === 0 ? 'success' : 'error', message: response.code === 0 ? `${item.name}已${item.isActive ? '停用' : '启用'}` : response.message });
    if (response.code === 0) await load();
  };

  const manageMappings = (shopId: string) => {
    setSearchParams({ group: 'product', tab: 'platformMapping', businessShopId: shopId });
  };

  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  const visiblePlatforms = platforms.filter((platform) => {
    const shops = items.filter((item) => item.parentId === platform.id);
    return !normalizedQuery || platform.name.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
      || shops.some((shop) => shop.name.toLocaleLowerCase('zh-CN').includes(normalizedQuery));
  });
  const existingPresetKeys = new Set(platforms.map((platform) => findBusinessPlatformPreset(platform.name)?.key).filter(Boolean));
  const customPlatformExists = platforms.some((platform) => !findBusinessPlatformPreset(platform.name));

  return <Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={1.5}>
      <Box>
        <Typography variant="h6" fontWeight={800}>业务平台与店铺</Typography>
        <Typography variant="body2" color="text.secondary">统一维护平台和店铺主数据，商品映射、线索、客户和订单共同引用这里的店铺。</Typography>
      </Box>
      <Button data-testid="add-after-sales-platform" variant="contained" startIcon={<AddIcon />} onClick={() => openEditor('platform')}>新增业务平台</Button>
    </Stack>

    <TextField
      size="small" placeholder="搜索平台或店铺" value={query} onChange={(event) => setQuery(event.target.value)}
      sx={{ mt: 2.5, width: { xs: '100%', sm: 360 } }}
    />

    <Stack spacing={2} sx={{ mt: 2 }}>
      {visiblePlatforms.map((platform) => {
        const shops = items.filter((item) => item.parentId === platform.id).sort((a, b) => a.sortOrder - b.sortOrder);
        return <Paper key={platform.id} variant="outlined" sx={{ borderColor: '#dbe4f0', borderRadius: 2.5, overflow: 'hidden' }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={1.5}
            sx={{ px: { xs: 2, sm: 2.5 }, py: 2, bgcolor: '#f8fbff', borderBottom: '1px solid #dbe4f0' }}
          >
            <Stack direction="row" alignItems="center" spacing={1.25}>
              <BusinessPlatformBrand platform={platform.name} compact />
              <Box>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="subtitle1" fontWeight={800}>{platform.name}</Typography>
                  <Chip size="small" label={`${shops.length} 家店铺`} sx={{ bgcolor: '#e2e8f0', fontWeight: 700 }} />
                  <Chip size="small" color={platform.isActive ? 'success' : 'default'} label={platform.isActive ? '启用' : '停用'} />
                </Stack>
                <Typography variant="caption" color="text.secondary">平台下的店铺可分别配置商品映射和插件接入。</Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              <Button size="small" startIcon={<AddIcon />} onClick={() => openEditor('shop', undefined, platform.id)}>新增店铺</Button>
              <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => openEditor('platform', platform)}>编辑平台</Button>
              <Button size="small" color={platform.isActive ? 'warning' : 'success'} onClick={() => void toggle(platform)}>{platform.isActive ? '停用' : '启用'}</Button>
            </Stack>
          </Stack>

          {shops.length ? <>
            <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
              <Table size="small">
                <TableHead><TableRow><TableCell>店铺名称</TableCell><TableCell>所属平台</TableCell><TableCell>状态</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
                <TableBody>{shops.map((shop) => <TableRow key={shop.id} hover>
                  <TableCell><Stack direction="row" alignItems="center" spacing={1}><BusinessPlatformBrand platform={platform.name} compact /><Typography fontWeight={700}>{shop.name}</Typography></Stack></TableCell>
                  <TableCell>{platform.name}</TableCell>
                  <TableCell><Chip size="small" color={shop.isActive ? 'success' : 'default'} variant={shop.isActive ? 'filled' : 'outlined'} label={shop.isActive ? '启用' : '停用'} /></TableCell>
                  <TableCell align="right">
                    <Button size="small" startIcon={<LinkOutlinedIcon />} onClick={() => manageMappings(shop.id)}>管理商品映射</Button>
                    <Button size="small" onClick={() => openEditor('shop', shop)}>编辑</Button>
                    <Button size="small" color={shop.isActive ? 'warning' : 'success'} onClick={() => void toggle(shop)}>{shop.isActive ? '停用' : '启用'}</Button>
                  </TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </TableContainer>

            <Stack spacing={1} sx={{ display: { xs: 'flex', md: 'none' }, p: 1.5 }}>
              {shops.map((shop) => <Paper key={shop.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                  <Box><Stack direction="row" alignItems="center" spacing={0.75}><BusinessPlatformBrand platform={platform.name} compact /><Typography fontWeight={800}>{shop.name}</Typography></Stack><Typography variant="caption" color="text.secondary">{platform.name}</Typography></Box>
                  <Chip size="small" color={shop.isActive ? 'success' : 'default'} label={shop.isActive ? '启用' : '停用'} />
                </Stack>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                  <Button size="small" onClick={() => manageMappings(shop.id)}>管理商品映射</Button>
                  <Button size="small" onClick={() => openEditor('shop', shop)}>编辑</Button>
                  <Button size="small" color={shop.isActive ? 'warning' : 'success'} onClick={() => void toggle(shop)}>{shop.isActive ? '停用' : '启用'}</Button>
                </Stack>
              </Paper>)}
            </Stack>
          </> : <Box sx={{ px: 2.5, py: 4, textAlign: 'center' }}>
            <Typography fontWeight={700}>该平台还没有店铺</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>添加店铺后，才能配置插件接入和商品映射。</Typography>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => openEditor('shop', undefined, platform.id)}>添加第一家店铺</Button>
          </Box>}
        </Paper>;
      })}
      {!visiblePlatforms.length ? <Paper variant="outlined" sx={{ py: 6, px: 2, textAlign: 'center', borderStyle: 'dashed' }}>
        <HubOutlinedIcon sx={{ fontSize: 42, color: '#94a3b8' }} />
        <Typography fontWeight={800} sx={{ mt: 1 }}>{platforms.length ? '没有找到符合条件的平台或店铺' : '还没有业务平台'}</Typography>
        <Typography variant="body2" color="text.secondary">先创建业务平台，再为平台添加店铺。</Typography>
      </Paper> : null}
    </Stack>

    <Dialog open={editorOpen} onClose={() => !submitting && setEditorOpen(false)} maxWidth="xs" fullWidth>
      <DialogCloseTitle onClose={() => setEditorOpen(false)} closeDisabled={submitting}>{editor.item ? '编辑' : '新增'}{editor.kind === 'platform' ? '业务平台' : '店铺'}</DialogCloseTitle>
      <DialogContent dividers>
        {editor.kind === 'platform' && !editor.item ? <Stack spacing={2}>
          <Box>
            <Typography fontWeight={800}>选择业务平台</Typography>
            <Typography variant="body2" color="text.secondary">常用平台直接选择；只有接入其他平台时才需要填写名称。</Typography>
          </Box>
          <Box data-testid="business-platform-preset-list" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
            {BUSINESS_PLATFORM_PRESETS.map((preset) => {
              const added = existingPresetKeys.has(preset.key);
              const selected = editor.platformChoice === preset.key;
              return <ButtonBase
                data-testid={`business-platform-preset-${preset.key}`}
                key={preset.key}
                disabled={added}
                onClick={() => setEditor((current) => ({ ...current, platformChoice: preset.key, name: preset.name }))}
                sx={{
                  minHeight: 88, px: 2, py: 1.5, border: '1px solid', borderRadius: 2, textAlign: 'left', justifyContent: 'space-between',
                  borderColor: selected ? 'primary.main' : '#dbe4f0', bgcolor: selected ? '#eff6ff' : '#fff',
                  '&:hover': { borderColor: '#60a5fa', bgcolor: '#f8fbff' },
                  '&.Mui-disabled': { opacity: 0.58 },
                }}
              >
                <BusinessPlatformBrand platform={preset.name} />
                {added ? <Chip size="small" label="已添加" /> : selected ? <CheckCircleRoundedIcon color="primary" /> : null}
              </ButtonBase>;
            })}
            <ButtonBase
              data-testid="business-platform-preset-custom"
              disabled={customPlatformExists}
              onClick={() => setEditor((current) => ({ ...current, platformChoice: 'custom', name: '' }))}
              sx={{
                minHeight: 88, px: 2, py: 1.5, border: '1px solid', borderRadius: 2, textAlign: 'left', justifyContent: 'space-between',
                borderColor: editor.platformChoice === 'custom' ? 'primary.main' : '#dbe4f0', bgcolor: editor.platformChoice === 'custom' ? '#eff6ff' : '#fff',
                '&:hover': { borderColor: '#60a5fa', bgcolor: '#f8fbff' }, '&.Mui-disabled': { opacity: 0.58 },
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1.25}><Box sx={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 2, bgcolor: '#eef2f7', color: '#64748b' }}><LanguageOutlinedIcon /></Box><Box><Typography fontWeight={800}>第三方平台</Typography><Typography variant="caption" color="text.secondary">最多添加 1 个自定义平台</Typography></Box></Stack>
              {customPlatformExists ? <Chip size="small" label="已添加" /> : editor.platformChoice === 'custom' ? <CheckCircleRoundedIcon color="primary" /> : null}
            </ButtonBase>
          </Box>
          {editor.platformChoice === 'custom' ? <TextField
            autoFocus fullWidth label="第三方平台名称" value={editor.name}
            onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))}
            helperText="请填写对外使用的正式平台名称"
          /> : null}
        </Stack> : editor.kind === 'platform' ? <Stack spacing={1.5}>
          {findBusinessPlatformPreset(editor.name) ? <BusinessPlatformBrand platform={editor.name} /> : null}
          <TextField
            autoFocus fullWidth label="平台名称" value={editor.name}
            disabled={Boolean(findBusinessPlatformPreset(editor.name))}
            onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))}
            helperText={findBusinessPlatformPreset(editor.name) ? '系统预设平台名称固定，避免插件和商品映射失去关联' : '可修改第三方平台名称'}
          />
        </Stack> : <TextField
          autoFocus fullWidth label="店铺名称" value={editor.name}
          onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))}
          helperText="请输入客户能够辨认的真实店铺名称"
        />}
      </DialogContent>
      <DialogActions><Button onClick={() => setEditorOpen(false)} disabled={submitting}>取消</Button><Button variant="contained" onClick={() => void save()} disabled={submitting || !editor.name.trim()}>保存</Button></DialogActions>
    </Dialog>

    <OperationFeedbackDialog open={Boolean(feedback)} severity={feedback?.severity} message={feedback?.message || ''} onClose={() => setFeedback(null)} />
  </Box>;
};

export default AfterSalesSourceConfigPage;
