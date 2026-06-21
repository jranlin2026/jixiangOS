import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Avatar,
  Box,
  Collapse,
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
import PaidIcon from '@mui/icons-material/Paid';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SettingsIcon from '@mui/icons-material/Settings';
import HomeIcon from '@mui/icons-material/Home';
import UpgradePoolIcon from '@mui/icons-material/Pool';
import LogoutIcon from '@mui/icons-material/Logout';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
  permissionKeys?: string[];
  children?: NavChildItem[];
}

interface NavChildItem {
  label: string;
  path: string;
  permissionKeys: string[];
}

const navItems: NavItem[] = [
  { label: '首页', icon: <HomeIcon />, path: ROUTES.HOME, permissionKey: PERMISSION_KEYS.HOME },
  { label: '驾驶舱', icon: <DashboardIcon />, path: ROUTES.DASHBOARD, permissionKey: PERMISSION_KEYS.DASHBOARD },
  { label: '线索', icon: <PeopleAltIcon />, path: ROUTES.LEADS, permissionKey: PERMISSION_KEYS.LEADS },
  { label: '客户', icon: <GroupsIcon />, path: ROUTES.CUSTOMERS, permissionKey: PERMISSION_KEYS.CUSTOMERS },
  { label: '订单', icon: <ReceiptLongIcon />, path: ROUTES.ORDERS, permissionKey: PERMISSION_KEYS.ORDERS },
  { label: '交付', icon: <LocalShippingIcon />, path: ROUTES.DELIVERY, permissionKey: PERMISSION_KEYS.DELIVERY },
  {
    label: '财务中心',
    icon: <PaidIcon />,
    path: ROUTES.FINANCE,
    permissionKey: PERMISSION_KEYS.FINANCE,
    permissionKeys: [PERMISSION_KEYS.FINANCE, PERMISSION_KEYS.COMMISSION, PERMISSION_KEYS.REFUND_CENTER],
  },
  {
    label: '升单中心',
    icon: <UpgradePoolIcon />,
    path: ROUTES.UPGRADE_CENTER,
    permissionKey: PERMISSION_KEYS.UPGRADE_POOL,
    permissionKeys: [PERMISSION_KEYS.UPGRADE_POOL, PERMISSION_KEYS.UPGRADE_ANALYSIS],
  },
  { label: 'AI助手', icon: <SmartToyIcon />, path: ROUTES.AI_ASSISTANT, permissionKey: PERMISSION_KEYS.AI_ASSISTANT },
  {
    label: '系统设置',
    icon: <SettingsIcon />,
    path: ROUTES.SETTINGS,
    permissionKey: PERMISSION_KEYS.SETTINGS,
    children: [
      {
        label: '组织架构',
        path: `${ROUTES.SETTINGS}?group=organization`,
        permissionKeys: [
          PERMISSION_KEYS.SETTINGS_USERS,
          PERMISSION_KEYS.SETTINGS_DEPARTMENTS,
          PERMISSION_KEYS.SETTINGS_POSITIONS,
          PERMISSION_KEYS.SETTINGS_ROLES,
        ],
      },
      {
        label: '产品设置',
        path: `${ROUTES.SETTINGS}?group=product`,
        permissionKeys: [PERMISSION_KEYS.SETTINGS_PRODUCTS, PERMISSION_KEYS.SETTINGS_ORDER_TYPES],
      },
      {
        label: '客户管理',
        path: `${ROUTES.SETTINGS}?group=leadCustomer`,
        permissionKeys: [
          PERMISSION_KEYS.SETTINGS,
          PERMISSION_KEYS.SETTINGS_LIFECYCLE,
          PERMISSION_KEYS.SETTINGS_LEAD_SOURCES,
          PERMISSION_KEYS.LEADS_FLOW_CONFIG,
        ],
      },
      {
        label: '系统维护',
        path: `${ROUTES.SETTINGS}?group=maintenance`,
        permissionKeys: [PERMISSION_KEYS.SETTINGS],
      },
    ],
  },
];

const Sidebar: React.FC<SidebarProps> = ({ width }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuthStore();
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const currentFullPath = `${location.pathname}${location.search}`;
  const visibleNavItems = useMemo(() => navItems.map((item) => ({
    ...item,
    children: item.children?.filter((child) => (
      child.permissionKeys.some((permissionKey) => hasPermission(currentUser, permissionKey))
    )),
  })).filter((item) => (
    (item.permissionKeys || [item.permissionKey]).some((permissionKey) => hasPermission(currentUser, permissionKey))
    || Boolean(item.children?.length)
  )), [currentUser]);

  const isChildActive = (child: NavChildItem) => currentFullPath === child.path;

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
            const hasChildren = Boolean(item.children?.length);
            const hasActiveChild = Boolean(item.children?.some(isChildActive));
            const isActive = location.pathname === item.path
              || hasActiveChild
              || (item.path === ROUTES.FINANCE && [ROUTES.REFUND_CENTER as string].includes(location.pathname))
              || (item.path === ROUTES.UPGRADE_CENTER && [ROUTES.UPGRADE_POOL as string, ROUTES.UPGRADE_ANALYSIS as string].includes(location.pathname));
            const isExpanded = hasChildren ? (expandedPaths[item.path] ?? isActive) : false;
            const handleNavClick = () => {
              if (!hasChildren) {
                navigate(item.path);
                return;
              }
              setExpandedPaths((prev) => ({ ...prev, [item.path]: !(prev[item.path] ?? isActive) }));
              if (!isActive) navigate(item.children?.[0]?.path || item.path);
            };
            return (
              <React.Fragment key={`${item.label}-${item.path}`}>
                <ListItem disablePadding sx={{ mb: 0.25 }}>
                  <ListItemButton
                    onClick={handleNavClick}
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
                    {hasChildren && (isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />)}
                  </ListItemButton>
                </ListItem>
                {hasChildren && (
                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding sx={{ pl: 5, pr: 0.5, pb: 0.5 }}>
                      {item.children?.map((child) => {
                        const childActive = isChildActive(child);
                        return (
                          <ListItem key={child.path} disablePadding sx={{ mb: 0.25 }}>
                            <ListItemButton
                              onClick={() => navigate(child.path)}
                              sx={{
                                borderRadius: 1.5,
                                py: 0.75,
                                px: 1.25,
                                minHeight: 34,
                                bgcolor: childActive ? '#EEF6FF' : 'transparent',
                                color: childActive ? '#1976D2' : '#64748b',
                                '&:hover': { bgcolor: childActive ? '#EEF6FF' : '#f8fafc' },
                              }}
                            >
                              <ListItemText
                                primary={child.label}
                                primaryTypographyProps={{
                                  fontSize: '0.765rem',
                                  fontWeight: childActive ? 700 : 500,
                                }}
                              />
                            </ListItemButton>
                          </ListItem>
                        );
                      })}
                    </List>
                  </Collapse>
                )}
              </React.Fragment>
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
