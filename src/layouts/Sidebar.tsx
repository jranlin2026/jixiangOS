import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Avatar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
  Divider,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import GroupsIcon from '@mui/icons-material/Groups';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PaidIcon from '@mui/icons-material/Paid';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SettingsIcon from '@mui/icons-material/Settings';
import HomeIcon from '@mui/icons-material/Home';
import RefundIcon from '@mui/icons-material/AssignmentReturn';
import UpgradePoolIcon from '@mui/icons-material/Pool';
import LogoutIcon from '@mui/icons-material/Logout';
import { ROUTES } from '../shared/utils/constants';
import { hasPermission, PERMISSION_KEYS } from '../shared/utils/permissions';
import useAuthStore from '../store/useAuthStore';

interface SidebarProps {
  width: number;
}

interface NavItem {
  label: string;
  icon: React.ReactElement;
  path: string;
  permissionKey: string;
}

const navItems: NavItem[] = [
  { label: '首页', icon: <HomeIcon />, path: ROUTES.HOME, permissionKey: PERMISSION_KEYS.HOME },
  { label: '驾驶舱', icon: <DashboardIcon />, path: ROUTES.HOME, permissionKey: PERMISSION_KEYS.DASHBOARD },
  { label: '线索', icon: <PeopleAltIcon />, path: ROUTES.LEADS, permissionKey: PERMISSION_KEYS.LEADS },
  { label: '客户', icon: <GroupsIcon />, path: ROUTES.CUSTOMERS, permissionKey: PERMISSION_KEYS.CUSTOMERS },
  { label: '订单', icon: <ReceiptLongIcon />, path: ROUTES.ORDERS, permissionKey: PERMISSION_KEYS.ORDERS },
  { label: '交付', icon: <LocalShippingIcon />, path: ROUTES.DELIVERY, permissionKey: PERMISSION_KEYS.DELIVERY },
  { label: '财务结算台', icon: <AccountBalanceWalletIcon />, path: ROUTES.COMMISSION, permissionKey: PERMISSION_KEYS.COMMISSION },
  { label: '财务', icon: <PaidIcon />, path: ROUTES.FINANCE, permissionKey: PERMISSION_KEYS.FINANCE },
  { label: '退款中心', icon: <RefundIcon />, path: ROUTES.REFUND_CENTER, permissionKey: PERMISSION_KEYS.REFUND_CENTER },
  { label: '升单池', icon: <UpgradePoolIcon />, path: ROUTES.UPGRADE_POOL, permissionKey: PERMISSION_KEYS.UPGRADE_POOL },
  { label: '升单分析', icon: <TrendingUpIcon />, path: ROUTES.UPGRADE_ANALYSIS, permissionKey: PERMISSION_KEYS.UPGRADE_ANALYSIS },
  { label: 'AI助手', icon: <SmartToyIcon />, path: ROUTES.AI_ASSISTANT, permissionKey: PERMISSION_KEYS.AI_ASSISTANT },
  { label: '设置', icon: <SettingsIcon />, path: ROUTES.SETTINGS, permissionKey: PERMISSION_KEYS.SETTINGS },
];

const Sidebar: React.FC<SidebarProps> = ({ width }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuthStore();
  const visibleNavItems = navItems.filter((item) => hasPermission(currentUser, item.permissionKey));

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width,
          boxSizing: 'border-box',
          bgcolor: '#ffffff',
          borderRight: '1px solid #e5e7eb',
          boxShadow: 'none',
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5, height: 64 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 2,
              bgcolor: '#2196F3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.875rem',
            }}
          >
            AI
          </Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1a1a2e', fontSize: '0.9375rem' }}>
            AI智能体运营
          </Typography>
        </Box>

        <Divider sx={{ borderColor: '#f0f0f0' }} />

        <List sx={{ px: 1.5, py: 1, flex: 1, overflowY: 'auto' }}>
          {visibleNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <ListItem key={`${item.label}-${item.path}`} disablePadding sx={{ mb: 0.25 }}>
                <ListItemButton
                  onClick={() => navigate(item.path)}
                  sx={{
                    borderRadius: 2,
                    py: 1,
                    px: 1.5,
                    bgcolor: isActive ? '#E3F2FD' : 'transparent',
                    color: isActive ? '#2196F3' : '#6b7280',
                    '&:hover': { bgcolor: isActive ? '#E3F2FD' : '#f5f5f5' },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36, color: isActive ? '#2196F3' : '#9ca3af' }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: isActive ? 600 : 400 }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>

        {currentUser && (
          <Box sx={{ borderTop: '1px solid #f0f0f0', p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: '#E3F2FD', color: '#1976D2', fontSize: 14 }}>
              {currentUser.name.slice(0, 1)}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser.name}
              </Typography>
              <Typography variant="caption" sx={{ color: '#6b7280' }}>
                {currentUser.role}
              </Typography>
            </Box>
            <Tooltip title="退出登录">
              <IconButton size="small" onClick={handleLogout}>
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
    </Drawer>
  );
};

export default Sidebar;
