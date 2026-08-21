import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Breadcrumbs, Button, Chip, CircularProgress, Divider, LinearProgress,
  Paper, Stack, Tab, Tabs, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { customerApi, orderApi } from '../../api';
import { customerTodoApi } from '../../api/customerTodoApi';
import { ROUTES, getLifecycleConfigByCode, normalizeLifecycleStatusCode } from '../../shared/utils/constants';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import { getCustomerManagementCategory, getCustomerProfileCompleteness } from '../../shared/utils/customerManagementState';
import { hasExplicitPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import useAuthStore from '../../store/useAuthStore';
import type { Customer, CustomerOpportunityStageCode } from '../../types/customer';
import type { CustomerTodo } from '../../types/customerTodo';
import type { Order } from '../../types/order';
import CustomerDetail from './CustomerDetail';
import CustomerManagementCommandLayer from './components/CustomerManagementCommandLayer';

type ViewMode = 'management' | 'profile';

const InfoItem: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{ mt: 0.35, fontWeight: 800, overflowWrap: 'anywhere' }}>{value || '未填写'}</Typography></Box>;

const CustomerRecordPage: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useAuthStore((state) => state.currentUser);
  const view = searchParams.get('view') === 'profile' ? 'profile' : 'management';
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [todos, setTodos] = useState<CustomerTodo[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [customerResponse, todoResponse, orderResponse] = await Promise.all([
        customerApi.fetchCustomerById(id), customerTodoApi.list(id), orderApi.fetchOrders({ customerId: id, pageSize: 100 }),
      ]);
      if (customerResponse.code !== 0 || !customerResponse.data) throw new Error(customerResponse.message || '客户资料加载失败');
      setCustomer(customerResponse.data);
      setTodos(todoResponse.code === 0 ? todoResponse.data || [] : []);
      setOrders(orderResponse.code === 0 ? orderResponse.data?.items || [] : []);
    } catch (value) { setError(value instanceof Error ? value.message : '客户资料加载失败'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const setView = (next: ViewMode) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', next);
    setSearchParams(params, { replace: true });
  };

  const saveProgress = async (stage: CustomerOpportunityStageCode, amount: number | null) => {
    if (!customer || saving) return false;
    setSaving(true);
    try {
      const response = await customerApi.updateCustomer(customer.id, { opportunityStageCode: stage, opportunityAmount: amount });
      if (response.code !== 0 || !response.data) { setError(response.message || '销售进度保存失败'); return false; }
      setCustomer(response.data); return true;
    } finally { setSaving(false); }
  };

  if (loading && !customer) return <Box sx={{ minHeight: 500, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  if (!customer) return <Box sx={{ p: 3 }}><Alert severity="error" action={<Button onClick={() => navigate(ROUTES.CUSTOMERS)}>返回客户列表</Button>}>{error || '客户不存在'}</Alert></Box>;

  const completeness = getCustomerProfileCompleteness(customer);
  const category = getCustomerManagementCategory(customer, todos);
  const lifecycle = getLifecycleConfigByCode(normalizeLifecycleStatusCode(customer.lifecycleStatusCode));
  const canSetProgress = hasExplicitPermission(currentUser, PERMISSION_KEYS.CUSTOMER_SET_PROGRESS, 'write') || hasExplicitPermission(currentUser, PERMISSION_KEYS.CUSTOMER_EDIT, 'write');
  const activity = [...(customer.activityRecords || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return <Box sx={{ minHeight: '100%', bgcolor: '#F7F6FB', px: { xs: 2, md: 3 }, py: 3 }}>
    <Box sx={{ maxWidth: 1480, mx: 'auto' }}>
      <Breadcrumbs separator="/" sx={{ mb: 1.5, color: '#8A8794' }}><Button size="small" color="inherit" onClick={() => navigate(ROUTES.DASHBOARD)} sx={{ minWidth: 0, px: 0 }}>经营驾驶舱</Button><Button size="small" color="inherit" onClick={() => navigate(ROUTES.SALES_MANAGEMENT)} sx={{ minWidth: 0, px: 0 }}>销售部经营战情</Button><Typography variant="body2" color="text.primary">{customer.name}</Typography></Breadcrumbs>

      <Paper elevation={0} sx={{ p: { xs: 2, md: 2.5 }, border: '1px solid #E7E1F1', borderRadius: 3, mb: 2 }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" spacing={2}>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <Button onClick={() => navigate(-1)} sx={{ minWidth: 38, width: 38, height: 38, borderRadius: '50%' }}><ArrowBackIcon /></Button>
            <Box><Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap"><Typography variant="h4" fontWeight={950}>{customer.name}</Typography><Chip size="small" label={customer.customerLevel || '未评级'} color="primary" variant="outlined" /><Chip size="small" label={lifecycle.name} /><Chip size="small" label={category.label} color={category.code === 'business_risk' ? 'error' : category.code === 'normal' ? 'success' : 'warning'} /></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{customer.company || '公司未填写'} · 负责人 {customer.owner || '未分配'} · 客户编号 {customer.id}</Typography></Box>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <Box sx={{ minWidth: 180 }}><Stack direction="row" justifyContent="space-between"><Typography variant="caption" color="text.secondary">资料完整度</Typography><Typography variant="caption" fontWeight={900} color={completeness.percentage < 70 ? 'error.main' : 'success.main'}>{completeness.percentage}%</Typography></Stack><LinearProgress variant="determinate" value={completeness.percentage} color={completeness.percentage < 70 ? 'warning' : 'success'} sx={{ height: 7, borderRadius: 99, mt: 0.5 }} /></Box>
            <Button variant={view === 'management' ? 'contained' : 'outlined'} startIcon={<ManageAccountsOutlinedIcon />} onClick={() => setView('management')}>经营管理</Button>
            <Button variant={view === 'profile' ? 'contained' : 'outlined'} startIcon={<PersonOutlineOutlinedIcon />} onClick={() => setView('profile')}>完整资料</Button>
          </Stack>
        </Stack>
        {completeness.missingFields.length > 0 && <Alert severity="warning" icon={false} sx={{ mt: 1.5, py: 0.25 }}>资料待完善：{completeness.missingFields.join('、')}<Button size="small" onClick={() => setEditOpen(true)} sx={{ ml: 1 }}>立即完善</Button></Alert>}
      </Paper>

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      {view === 'management' ? <>
        <CustomerManagementCommandLayer
          customer={customer} todos={todos} currentUser={currentUser} onRefreshCustomer={load}
          canSetProgress={canSetProgress} progressSaving={saving} onSaveProgress={saveProgress}
          onOpenTodos={() => { setView('profile'); setTab(1); }}
        />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.75fr 1.55fr 0.8fr' }, gap: 2 }}>
          <Paper elevation={0} sx={{ p: 2.25, border: '1px solid #E7E1F1', borderRadius: 3 }}>
            <Typography fontWeight={950}>客户资料</Typography>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ my: 2 }}><Box sx={{ width: 68, height: 68, position: 'relative', display: 'grid', placeItems: 'center' }}><CircularProgress variant="determinate" value={100} size={68} thickness={4} sx={{ color: '#EEEAF7', position: 'absolute' }} /><CircularProgress variant="determinate" value={completeness.percentage} size={68} thickness={4} sx={{ color: '#7C3AED', position: 'absolute' }} /><Typography fontWeight={950} color="#6D28D9">{completeness.percentage}%</Typography></Box><Box><Typography variant="body2" fontWeight={850}>{completeness.missingFields.length ? `缺 ${completeness.missingFields.length} 项` : '资料已完整'}</Typography><Typography variant="caption" color="text.secondary">{completeness.missingFields.slice(0, 3).join('、') || '已满足经营管理要求'}</Typography></Box></Stack>
            <Button fullWidth variant="outlined" onClick={() => setView('profile')}>查看完整资料</Button>
          </Paper>
          <Paper elevation={0} sx={{ p: 2.25, border: '1px solid #E7E1F1', borderRadius: 3 }}>
            <Stack direction="row" justifyContent="space-between"><Typography fontWeight={950}>最近经营动态</Typography><Button size="small" onClick={() => { setView('profile'); setTab(0); }}>查看全部</Button></Stack>
            <Stack divider={<Divider flexItem />} spacing={1.35} sx={{ mt: 1.25 }}>{activity.slice(0, 3).map((item) => <Box key={item.id}><Stack direction="row" justifyContent="space-between" spacing={1}><Typography variant="body2" fontWeight={850}>{item.title || '客户动态'}</Typography><Typography variant="caption" color="text.secondary">{formatDate(item.createdAt, 'MM-dd HH:mm')}</Typography></Stack><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }}>{item.content || '无详细内容'}</Typography></Box>)}{!activity.length && <Typography variant="body2" color="text.secondary">暂无动态</Typography>}</Stack>
          </Paper>
          <Paper elevation={0} sx={{ p: 2.25, border: '1px solid #E7E1F1', borderRadius: 3 }}>
            <Typography fontWeight={950}>下一步动作</Typography>
            {todos.find((item) => item.status === 'pending') ? <Box sx={{ mt: 1.75 }}><Chip size="small" color="warning" label="待执行" /><Typography sx={{ mt: 1, fontWeight: 900 }}>{todos.find((item) => item.status === 'pending')?.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>负责人：{todos.find((item) => item.status === 'pending')?.assigneeName || '未分配'}</Typography><Typography variant="body2" color="text.secondary">截止：{todos.find((item) => item.status === 'pending')?.dueAt ? formatDate(todos.find((item) => item.status === 'pending')!.dueAt, 'MM-dd HH:mm') : '未设置'}</Typography></Box> : <Alert severity="info" icon={false} sx={{ mt: 1.5 }}>尚未设置下一步动作</Alert>}
            <Button fullWidth sx={{ mt: 1.5 }} onClick={() => { setView('profile'); setTab(1); }}>查看待办</Button>
          </Paper>
        </Box>
      </> : <Stack spacing={2}>
        <Paper elevation={0} sx={{ border: '1px solid #E7E1F1', borderRadius: 3, overflow: 'hidden' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2.5, py: 1.75, borderBottom: '1px solid #EEEAF4' }}><Typography fontWeight={950}>客户完整档案</Typography><Button startIcon={<EditOutlinedIcon />} variant="outlined" onClick={() => setEditOpen(true)}>编辑完整资料</Button></Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', md: 'repeat(4,1fr)' }, gap: 2.25, p: 2.5 }}>
            <InfoItem label="客户全名" value={customer.name} /><InfoItem label="公司" value={customer.company} /><InfoItem label="手机" value={customer.phone} /><InfoItem label="微信" value={customer.wechat} />
            <InfoItem label="客户等级" value={customer.customerLevel} /><InfoItem label="意向产品" value={customer.intendedProduct || customer.productLevel} /><InfoItem label="预计金额" value={customer.opportunityAmount == null ? '待评估' : formatCurrency(customer.opportunityAmount)} /><InfoItem label="销售负责人" value={customer.owner} />
            <InfoItem label="行业" value={customer.industry} /><InfoItem label="城市" value={customer.city} /><InfoItem label="线索来源" value={[customer.leadSource, customer.sourceName].filter(Boolean).join(' · ')} /><InfoItem label="创建时间" value={formatDate(customer.createdAt, 'yyyy-MM-dd HH:mm')} />
          </Box>
          {customer.remark && <><Divider /><Box sx={{ p: 2.5 }}><Typography variant="caption" color="text.secondary">备注</Typography><Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{customer.remark}</Typography></Box></>}
        </Paper>

        <Paper elevation={0} sx={{ border: '1px solid #E7E1F1', borderRadius: 3, overflow: 'hidden' }}>
          <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ px: 1.5, borderBottom: '1px solid #EEEAF4' }}><Tab label={`沟通动态 ${activity.length}`} /><Tab label={`待办 ${todos.length}`} /><Tab label={`订单 ${orders.length}`} /></Tabs>
          <Box sx={{ p: 2.5 }}>
            {tab === 0 && (activity.length ? <Stack divider={<Divider flexItem />} spacing={1.5}>{activity.map((item) => <Box key={item.id}><Stack direction="row" justifyContent="space-between" spacing={2}><Typography variant="body2" fontWeight={850}>{item.title || '客户动态'}</Typography><Typography variant="caption" color="text.secondary">{formatDate(item.createdAt, 'MM-dd HH:mm')}</Typography></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{item.content || '无详细内容'}</Typography></Box>)}</Stack> : <Typography color="text.secondary">暂无动态</Typography>)}
            {tab === 1 && (todos.length ? <Table size="small"><TableHead><TableRow><TableCell>动作</TableCell><TableCell>执行人</TableCell><TableCell>截止时间</TableCell><TableCell>状态</TableCell></TableRow></TableHead><TableBody>{todos.map((item) => <TableRow key={item.id}><TableCell>{item.title}</TableCell><TableCell>{item.assigneeName || '未分配'}</TableCell><TableCell>{item.dueAt ? formatDate(item.dueAt, 'yyyy-MM-dd HH:mm') : '未设置'}</TableCell><TableCell>{item.status}</TableCell></TableRow>)}</TableBody></Table> : <Typography color="text.secondary">暂无待办</Typography>)}
            {tab === 2 && (orders.length ? <Table size="small"><TableHead><TableRow><TableCell>订单号</TableCell><TableCell>状态</TableCell><TableCell align="right">金额</TableCell><TableCell>创建时间</TableCell></TableRow></TableHead><TableBody>{orders.map((item) => <TableRow key={item.id}><TableCell>{item.orderNo}</TableCell><TableCell>{item.status}</TableCell><TableCell align="right">{formatCurrency(item.actualAmount || item.amount || 0)}</TableCell><TableCell>{formatDate(item.createdAt, 'yyyy-MM-dd')}</TableCell></TableRow>)}</TableBody></Table> : <Typography color="text.secondary">暂无订单</Typography>)}
          </Box>
        </Paper>
      </Stack>}
    </Box>
    <CustomerDetail customer={customer} open={editOpen} onClose={() => setEditOpen(false)} onUpdated={(updated) => setCustomer(updated)} />
  </Box>;
};

export default CustomerRecordPage;
