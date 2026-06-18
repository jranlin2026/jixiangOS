import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, Button, IconButton, Dialog,
  DialogContent, DialogActions, TextField,
  Switch, FormControlLabel, MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { productApi } from '../../api';
import type { Product, ProductLevelConfig } from '../../types/product';
import type { ProductLevel } from '../../types/common';
import { formatCurrency } from '../../shared/utils/formatters';
import {
  DELIVERY_STAGES_899,
  DELIVERY_STAGES_AGENT,
  DELIVERY_STAGES_COURSE,
  DELIVERY_STAGES_OEM,
  getProductLevelColor,
} from '../../shared/utils/constants';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

type ProductForm = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;
type ProductLevelConfigForm = Omit<ProductLevelConfig, 'id' | 'createdAt' | 'updatedAt'>;

const levelStages: Record<string, string[]> = {
  '899': [...DELIVERY_STAGES_899],
  '课程': [...DELIVERY_STAGES_COURSE],
  '代理': [...DELIVERY_STAGES_AGENT],
  '贴牌': [...DELIVERY_STAGES_OEM],
  '合伙人': [...DELIVERY_STAGES_899],
};

const emptyForm: ProductForm = {
  name: '',
  level: '899',
  price: 899,
  originalPrice: 1299,
  description: '',
  features: [],
  deliveryStages: [...DELIVERY_STAGES_899],
  isActive: true,
  sortOrder: 100,
};

const emptyLevelForm: ProductLevelConfigForm = {
  name: '',
  color: '#2196F3',
  isActive: true,
  sortOrder: 100,
};

const splitLines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
const joinLines = (value: string[]) => value.join('\n');

const ProductConfigPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [levelConfigs, setLevelConfigs] = useState<ProductLevelConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [stagesText, setStagesText] = useState(joinLines(emptyForm.deliveryStages));
  const [levelManagerOpen, setLevelManagerOpen] = useState(false);
  const [levelFormOpen, setLevelFormOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<ProductLevelConfig | null>(null);
  const [levelForm, setLevelForm] = useState<ProductLevelConfigForm>(emptyLevelForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [productRes, levelRes] = await Promise.all([
        productApi.getAllProducts(),
        productApi.getProductLevelConfigs(),
      ]);
      if (productRes.code === 0) setProducts(productRes.data);
      if (levelRes.code === 0) setLevelConfigs(levelRes.data);
    } finally {
      setLoading(false);
    }
  };

  const openForm = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setForm({
        name: product.name,
        level: product.level,
        price: product.price,
        originalPrice: product.originalPrice,
        description: product.description,
        features: product.features,
        deliveryStages: product.deliveryStages,
        isActive: product.isActive,
        sortOrder: product.sortOrder,
      });
      setStagesText(joinLines(product.deliveryStages));
    } else {
      setEditingProduct(null);
      setForm(emptyForm);
      setStagesText(joinLines(emptyForm.deliveryStages));
    }
    setFormOpen(true);
  };

  const openLevelForm = (level?: ProductLevelConfig) => {
    if (level) {
      setEditingLevel(level);
      setLevelForm({
        name: level.name,
        color: level.color,
        isActive: level.isActive,
        sortOrder: level.sortOrder,
      });
    } else {
      setEditingLevel(null);
      setLevelForm(emptyLevelForm);
    }
    setLevelFormOpen(true);
  };

  const updateForm = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateLevelForm = <K extends keyof ProductLevelConfigForm>(key: K, value: ProductLevelConfigForm[K]) => {
    setLevelForm((prev) => ({ ...prev, [key]: value }));
  };

  const activeLevelConfigs = levelConfigs.filter((level) => level.isActive);

  const handleLevelChange = (level: ProductLevel) => {
    const nextStages = levelStages[level];
    setForm((prev) => ({ ...prev, level, deliveryStages: nextStages || prev.deliveryStages }));
    if (nextStages) {
      setStagesText(joinLines(nextStages));
    }
  };

  const handleSubmit = async () => {
    const payload: ProductForm = {
      ...form,
      price: Number(form.price),
      originalPrice: form.originalPrice ? Number(form.originalPrice) : undefined,
      sortOrder: Number(form.sortOrder),
      features: form.features || [],
      deliveryStages: splitLines(stagesText),
    };

    if (editingProduct) {
      await productApi.updateProduct(editingProduct.id, payload);
    } else {
      await productApi.createProduct(payload);
    }
    setFormOpen(false);
    loadData();
  };

  const handleLevelSubmit = async () => {
    const payload = {
      ...levelForm,
      name: levelForm.name.trim(),
      sortOrder: Number(levelForm.sortOrder),
    };
    const res = editingLevel
      ? await productApi.updateProductLevelConfig(editingLevel.id, payload)
      : await productApi.createProductLevelConfig(payload);
    if (res.code !== 0) {
      window.alert(res.message);
      return;
    }
    setLevelFormOpen(false);
    loadData();
  };

  const handleToggleActive = async (product: Product) => {
    await productApi.updateProduct(product.id, { isActive: !product.isActive });
    loadData();
  };

  const handleDelete = async (product: Product) => {
    if (!window.confirm(`确定删除产品「${product.name}」吗？`)) return;
    await productApi.deleteProduct(product.id);
    loadData();
  };

  const handleDeleteLevel = async (level: ProductLevelConfig) => {
    if (!window.confirm(`确定删除等级「${level.name}」吗？`)) return;
    const res = await productApi.deleteProductLevelConfig(level.id);
    if (res.code !== 0) {
      window.alert(res.message);
      return;
    }
    loadData();
  };

  const handleToggleLevelActive = async (level: ProductLevelConfig) => {
    await productApi.updateProductLevelConfig(level.id, { isActive: !level.isActive });
    loadData();
  };

  const isLevelInUse = (levelName: string) => products.some((product) => product.level === levelName);

  const levelColorMap = levelConfigs.reduce<Record<string, string>>((acc, level) => {
    acc[level.name] = level.color;
    return acc;
  }, {});

  const getLevelColor = (level: string) => levelColorMap[level] || getProductLevelColor(level);

  const colorOptions = ['#2196F3', '#00BCD4', '#4CAF50', '#9C27B0', '#FF9800', '#F44336', '#607D8B', '#111827'];

  const defaultLevel = activeLevelConfigs[0]?.name || '899';

  useEffect(() => {
    if (!formOpen || editingProduct || activeLevelConfigs.length === 0) return;
    if (activeLevelConfigs.some((level) => level.name === form.level)) return;
    handleLevelChange(defaultLevel);
  }, [formOpen, editingProduct, activeLevelConfigs, form.level, defaultLevel]);

  useEffect(() => {
    if (levelConfigs.length === 0) return;
    setForm((prev) => (
      levelConfigs.some((level) => level.name === prev.level)
        ? prev
        : { ...prev, level: defaultLevel }
    ));
  }, [levelConfigs, defaultLevel]);

  const productLevelOptions = activeLevelConfigs.length ? activeLevelConfigs : levelConfigs;

  const renderLevelChip = (level: string) => {
    const color = getLevelColor(level);
    return <Chip label={level} size="small" sx={{ bgcolor: `${color}18`, color, fontWeight: 600 }} />;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>产品配置</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            维护产品等级、价格和交付阶段，订单新增时会读取启用产品。
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" onClick={() => setLevelManagerOpen(true)}>
            分类管理
          </Button>
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => openForm()}>
            新增产品
          </Button>
        </Box>
      </Box>

      <Dialog open={levelManagerOpen} onClose={() => setLevelManagerOpen(false)} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={() => setLevelManagerOpen(false)}>产品等级/业务分类管理</DialogCloseTitle>
        <DialogContent dividers>
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0', mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, borderBottom: '1px solid #f0f0f0' }}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>产品等级/业务分类配置</Typography>
            <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
              控制产品下拉选项和系统内分类标签颜色。
            </Typography>
          </Box>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => openLevelForm()}>
            新增等级
          </Button>
        </Box>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>等级名称</TableCell>
              <TableCell>颜色</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>排序</TableCell>
              <TableCell>使用情况</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {levelConfigs.map((level) => {
              const used = isLevelInUse(level.name);
              return (
                <TableRow key={level.id} hover>
                  <TableCell>{renderLevelChip(level.name)}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 18, height: 18, borderRadius: '4px', bgcolor: level.color, border: '1px solid #e5e7eb' }} />
                      <Typography variant="body2">{level.color}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={level.isActive ? '启用' : '停用'} size="small" color={level.isActive ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell>{level.sortOrder}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: used ? '#111827' : '#9ca3af' }}>
                      {used ? '已有产品使用' : '未使用'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Switch checked={level.isActive} size="small" onChange={() => handleToggleLevelActive(level)} />
                    <IconButton size="small" onClick={() => openLevelForm(level)} title="编辑">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      disabled={used}
                      onClick={() => handleDeleteLevel(level)}
                      title={used ? '已有产品使用，不能删除' : '删除'}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
        </DialogContent>
      </Dialog>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>产品名称</TableCell>
              <TableCell>等级</TableCell>
              <TableCell>价格</TableCell>
              <TableCell>原价</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>排序</TableCell>
              <TableCell>描述</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {products.map((prod) => {
              return (
                <TableRow key={prod.id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{prod.name}</TableCell>
                  <TableCell>
                    {renderLevelChip(prod.level)}
                  </TableCell>
                  <TableCell>{formatCurrency(prod.price)}</TableCell>
                  <TableCell>{prod.originalPrice ? formatCurrency(prod.originalPrice) : '-'}</TableCell>
                  <TableCell>
                    <Chip label={prod.isActive ? '启用' : '停用'} size="small" color={prod.isActive ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell>{prod.sortOrder}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ maxWidth: 280 }}>{prod.description}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Switch checked={prod.isActive} size="small" onChange={() => handleToggleActive(prod)} />
                    <IconButton size="small" onClick={() => openForm(prod)} title="编辑">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(prod)} title="删除">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                  {loading ? '加载中...' : '暂无产品'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={() => setFormOpen(false)}>{editingProduct ? '编辑产品' : '新增产品'}</DialogCloseTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2, mt: 1 }}>
            <TextField label="产品名称" value={form.name} onChange={(e) => updateForm('name', e.target.value)} fullWidth required />
            <TextField
              select
              label="产品等级/业务分类"
              value={form.level}
              onChange={(e) => handleLevelChange(e.target.value)}
              fullWidth
              helperText="从上方产品等级配置读取"
            >
              {productLevelOptions.map((level) => (
                <MenuItem key={level.id} value={level.name}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: level.color }} />
                    {level.name}
                  </Box>
                </MenuItem>
              ))}
            </TextField>
            <TextField label="价格" type="number" value={form.price} onChange={(e) => updateForm('price', Number(e.target.value))} fullWidth />
            <TextField label="原价" type="number" value={form.originalPrice || ''} onChange={(e) => updateForm('originalPrice', Number(e.target.value) || undefined)} fullWidth />
            <TextField label="排序" type="number" value={form.sortOrder} onChange={(e) => updateForm('sortOrder', Number(e.target.value))} fullWidth />
            <FormControlLabel
              control={<Switch checked={form.isActive} onChange={(e) => updateForm('isActive', e.target.checked)} />}
              label={form.isActive ? '启用' : '停用'}
            />
            <TextField
              label="描述"
              value={form.description}
              onChange={(e) => updateForm('description', e.target.value)}
              fullWidth
              multiline
              minRows={2}
              sx={{ gridColumn: '1 / -1' }}
            />
            <TextField
              label="交付阶段（每行一个）"
              value={stagesText}
              onChange={(e) => setStagesText(e.target.value)}
              fullWidth
              multiline
              minRows={4}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={handleSubmit} disabled={!form.name || loading}>
            {editingProduct ? '保存' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={levelFormOpen} onClose={() => setLevelFormOpen(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setLevelFormOpen(false)}>{editingLevel ? '编辑产品等级' : '新增产品等级'}</DialogCloseTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <TextField
              label="等级名称"
              value={levelForm.name}
              onChange={(e) => updateLevelForm('name', e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="颜色"
              type="color"
              value={levelForm.color}
              onChange={(e) => updateLevelForm('color', e.target.value)}
              fullWidth
            />
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {colorOptions.map((color) => (
                <IconButton
                  key={color}
                  size="small"
                  onClick={() => updateLevelForm('color', color)}
                  sx={{
                    width: 28,
                    height: 28,
                    bgcolor: color,
                    border: levelForm.color === color ? '2px solid #111827' : '1px solid #e5e7eb',
                    '&:hover': { bgcolor: color },
                  }}
                  title={color}
                />
              ))}
            </Box>
            <TextField
              label="排序"
              type="number"
              value={levelForm.sortOrder}
              onChange={(e) => updateLevelForm('sortOrder', Number(e.target.value))}
              fullWidth
            />
            <FormControlLabel
              control={<Switch checked={levelForm.isActive} onChange={(e) => updateLevelForm('isActive', e.target.checked)} />}
              label={levelForm.isActive ? '启用' : '停用'}
            />
            {levelForm.name && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ color: '#6b7280' }}>预览</Typography>
                <Chip
                  label={levelForm.name}
                  size="small"
                  sx={{ bgcolor: `${levelForm.color}18`, color: levelForm.color, fontWeight: 600 }}
                />
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={handleLevelSubmit} disabled={!levelForm.name.trim()}>
            {editingLevel ? '保存' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProductConfigPage;
