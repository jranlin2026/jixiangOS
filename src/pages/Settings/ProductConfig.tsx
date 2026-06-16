import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, Button, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField,
  Switch, FormControlLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { productApi } from '../../api';
import type { Product } from '../../types/product';
import type { ProductLevel } from '../../types/common';
import { formatCurrency } from '../../shared/utils/formatters';
import {
  DELIVERY_STAGES_899,
  DELIVERY_STAGES_AGENT,
  DELIVERY_STAGES_COURSE,
  DELIVERY_STAGES_OEM,
  PRODUCT_LEVEL_COLOR_MAP,
} from '../../shared/utils/constants';

type ProductForm = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;

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

const splitLines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
const joinLines = (value: string[]) => value.join('\n');

const ProductConfigPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [featuresText, setFeaturesText] = useState('');
  const [stagesText, setStagesText] = useState(joinLines(emptyForm.deliveryStages));

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await productApi.getAllProducts();
      if (res.code === 0) setProducts(res.data);
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
      setFeaturesText(joinLines(product.features));
      setStagesText(joinLines(product.deliveryStages));
    } else {
      setEditingProduct(null);
      setForm(emptyForm);
      setFeaturesText('');
      setStagesText(joinLines(emptyForm.deliveryStages));
    }
    setFormOpen(true);
  };

  const updateForm = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const knownLevels = Array.from(new Set([...Object.keys(levelStages), ...products.map((product) => product.level)]));

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
      features: splitLines(featuresText),
      deliveryStages: splitLines(stagesText),
    };

    if (editingProduct) {
      await productApi.updateProduct(editingProduct.id, payload);
    } else {
      await productApi.createProduct(payload);
    }
    setFormOpen(false);
    loadProducts();
  };

  const handleToggleActive = async (product: Product) => {
    await productApi.updateProduct(product.id, { isActive: !product.isActive });
    loadProducts();
  };

  const handleDelete = async (product: Product) => {
    if (!window.confirm(`确定删除产品「${product.name}」吗？`)) return;
    await productApi.deleteProduct(product.id);
    loadProducts();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>产品配置</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            维护产品档位、价格、功能和交付阶段，订单新增时会读取启用产品。
          </Typography>
        </Box>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => openForm()}>
          新增产品
        </Button>
      </Box>

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
              const levelColor = PRODUCT_LEVEL_COLOR_MAP[prod.level] || '#9ca3af';
              return (
                <TableRow key={prod.id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{prod.name}</TableCell>
                  <TableCell>
                    <Chip label={prod.level} size="small" sx={{ bgcolor: `${levelColor}18`, color: levelColor, fontWeight: 600 }} />
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
        <DialogTitle>{editingProduct ? '编辑产品' : '新增产品'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2, mt: 1 }}>
            <TextField label="产品名称" value={form.name} onChange={(e) => updateForm('name', e.target.value)} fullWidth required />
            <TextField
              label="产品等级/业务分类"
              value={form.level}
              onChange={(e) => handleLevelChange(e.target.value)}
              fullWidth
              helperText={`可自定义；常用：${knownLevels.join('、')}`}
            />
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
              label="功能列表（每行一个）"
              value={featuresText}
              onChange={(e) => setFeaturesText(e.target.value)}
              fullWidth
              multiline
              minRows={4}
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
          <Button onClick={() => setFormOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={!form.name || loading}>
            {editingProduct ? '保存' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProductConfigPage;
