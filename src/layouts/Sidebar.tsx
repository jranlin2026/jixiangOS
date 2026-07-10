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
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import PaidIcon from '@mui/icons-material/Paid';
import StorefrontIcon from '@mui/icons-material/Storefront';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SchoolIcon from '@mui/icons-material/School';
import SettingsIcon from '@mui/icons-material/Settings';
import HomeIcon from '@mui/icons-material/Home';
import LogoutIcon from '@mui/icons-material/Logout';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { ROUTES } from '../shared/utils/constants';
import { hasPermission, PERMISSION_KEYS } from '../shared/utils/permissions';
import { ensureOrganizationConfigData } from '../shared/utils/organizationConfig';
import useAuthStore from '../store/useAuthStore';

interface SidebarProps {
  width: number;
}

const shell = {
  ink: '#101828',
  muted: '#667085',
  line: '#DDE4EC',
  softLine: '#EEF2F6',
  blue: '#1E6BFF',
  surface: '#FFFFFF',
  page: '#F6F8FB',
};

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
  { label: '线索管理', icon: <PeopleAltIcon />, path: ROUTES.LEADS, permissionKey: PERMISSION_KEYS.LEADS },
  {
    label: '客户管理',
    icon: <GroupsIcon />,
    path: ROUTES.CUSTOMERS,
    permissionKey: PERMISSION_KEYS.CUSTOMERS,
    children: [
      {
        label: '客户列表',
        path: `${ROUTES.CUSTOMERS}?tab=active`,
        permissionKeys: [PERMISSION_KEYS.CUSTOMERS, PERMISSION_KEYS.CUSTOMER_LIST],
      },
      {
        label: '公海池',
        path: `${ROUTES.CUSTOMERS}?tab=public_pool`,
        permissionKeys: [PERMISSION_KEYS.CUSTOMERS, PERMISSION_KEYS.CUSTOMER_LIST],
      },
    ],
  },
  { label: '订单管理', icon: <ReceiptLongIcon />, path: ROUTES.ORDERS, permissionKey: PERMISSION_KEYS.ORDERS },
  { label: '交付中心', icon: <LocalShippingIcon />, path: ROUTES.DELIVERY, permissionKey: PERMISSION_KEYS.DELIVERY },
  {
    label: '售后服务',
    icon: <SupportAgentIcon />,
    path: ROUTES.AFTER_SALES,
    permissionKey: PERMISSION_KEYS.AFTER_SALES,
    permissionKeys: [
      PERMISSION_KEYS.AFTER_SALES,
      PERMISSION_KEYS.AFTER_SALES_RECOVERY,
      PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE,
      PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW,
    ],
  },
  {
    label: '财务中心',
    icon: <PaidIcon />,
    path: ROUTES.FINANCE,
    permissionKey: PERMISSION_KEYS.FINANCE,
    permissionKeys: [
      PERMISSION_KEYS.FINANCE,
      PERMISSION_KEYS.FINANCE_MY_COMMISSION,
      PERMISSION_KEYS.FINANCE_SETTLEMENT,
      PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT,
      PERMISSION_KEYS.FINANCE_PAYOUT,
      PERMISSION_KEYS.FINANCE_FLOW,
      PERMISSION_KEYS.FINANCE_RULES,
    ],
  },
  {
    label: '电商结算中心',
    icon: <StorefrontIcon />,
    path: ROUTES.ECOMMERCE_SETTLEMENT,
    permissionKey: PERMISSION_KEYS.ECOMMERCE_SETTLEMENT,
    permissionKeys: [
      PERMISSION_KEYS.ECOMMERCE_SETTLEMENT,
      PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_WORKBENCH,
      PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_HISTORY,
      PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_EXCEPTIONS,
      PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_TALENTS,
      PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_SETTINGS,
      PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_RULES,
    ],
  },
  {
    label: '资产管理',
    icon: <Inventory2Icon />,
    path: ROUTES.ASSETS,
    permissionKey: PERMISSION_KEYS.ASSETS,
    permissionKeys: [
      PERMISSION_KEYS.ASSETS,
      PERMISSION_KEYS.ASSETS_OVERVIEW,
      PERMISSION_KEYS.ASSETS_DEVICES,
      PERMISSION_KEYS.ASSETS_PHONES,
      PERMISSION_KEYS.ASSETS_ACCOUNTS,
      PERMISSION_KEYS.ASSETS_RISKS,
      PERMISSION_KEYS.ASSETS_LOGS,
      PERMISSION_KEYS.ASSETS_OFFBOARDING,
    ],
  },
  {
    label: 'GEO增长中心',
    icon: <TravelExploreIcon />,
    path: ROUTES.GEO,
    permissionKey: PERMISSION_KEYS.GEO,
    permissionKeys: [
      PERMISSION_KEYS.GEO,
      PERMISSION_KEYS.GEO_OVERVIEW,
      PERMISSION_KEYS.GEO_CONTENT,
      PERMISSION_KEYS.GEO_ANALYTICS,
    ],
  },
  { label: 'AI助手', icon: <SmartToyIcon />, path: ROUTES.AI_ASSISTANT, permissionKey: PERMISSION_KEYS.AI_ASSISTANT },
  { label: '赋能中台', icon: <SchoolIcon />, path: ROUTES.ENABLEMENT, permissionKey: PERMISSION_KEYS.ENABLEMENT },
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
          PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS,
          PERMISSION_KEYS.SETTINGS_ROLES,
          PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE,
        ],
      },
      {
        label: '产品设置',
        path: `${ROUTES.SETTINGS}?group=product`,
        permissionKeys: [PERMISSION_KEYS.SETTINGS_PRODUCTS, PERMISSION_KEYS.SETTINGS_ORDER_TYPES],
      },
      {
        label: '客户设置',
        path: `${ROUTES.SETTINGS}?group=leadCustomer`,
        permissionKeys: [
          PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS,
          PERMISSION_KEYS.SETTINGS_LIFECYCLE,
          PERMISSION_KEYS.SETTINGS_LEAD_SOURCES,
          PERMISSION_KEYS.SETTINGS_LEAD_FLOW,
        ],
      },
      {
        label: '系统维护',
        path: `${ROUTES.SETTINGS}?group=maintenance`,
        permissionKeys: [PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE],
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
  const currentDepartmentName = useMemo(() => {
    if (!currentUser?.departmentId) return '';
    return ensureOrganizationConfigData().departments.find((department) => department.id === currentUser.departmentId)?.name || '';
  }, [currentUser?.departmentId]);
  const currentUserMeta = currentDepartmentName ? `${currentUser?.role || ''} · ${currentDepartmentName}` : currentUser?.role;
  const visibleNavItems = useMemo(() => navItems.map((item) => ({
    ...item,
    children: item.children?.filter((child) => (
      child.permissionKeys.some((permissionKey) => hasPermission(currentUser, permissionKey))
    )),
  })).filter((item) => (
    (item.permissionKeys || [item.permissionKey]).some((permissionKey) => hasPermission(currentUser, permissionKey))
    || Boolean(item.children?.length)
  )), [currentUser]);

  const isChildActive = (child: NavChildItem) => (
    currentFullPath === child.path
    || (child.path === `${ROUTES.CUSTOMERS}?tab=active` && location.pathname === ROUTES.CUSTOMERS && !location.search)
  );

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
          bgcolor: shell.surface,
          borderRight: `1px solid ${shell.line}`,
          boxShadow: 'none',
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.25, height: 76, borderBottom: `1px solid ${shell.softLine}` }}>
          <Box
            component="img"
            src="/jixiang-os-logo.png"
            alt="极享OS"
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              objectFit: 'contain',
              flexShrink: 0,
            }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#1a1a2e', fontSize: '1rem', lineHeight: 1.1 }}>
              极享OS
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.75rem', lineHeight: 1.3 }}>
              AI企业运营系统
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ borderColor: shell.softLine }} />

        <List sx={{ px: 1.25, py: 1.25, flex: 1, overflowY: 'auto' }}>
          {visibleNavItems.map((item) => {
            const hasChildren = Boolean(item.children?.length);
            const hasActiveChild = Boolean(item.children?.some(isChildActive));
            const isActive = location.pathname === item.path
              || hasActiveChild
              || (item.path === ROUTES.AFTER_SALES && [ROUTES.REFUND_CENTER as string].includes(location.pathname));
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
                      position: 'relative',
                      borderRadius: 1.25,
                      py: 0.95,
                      px: 1.25,
                      minHeight: 44,
                      bgcolor: isActive ? '#EEF5FF' : 'transparent',
                      color: isActive ? shell.blue : shell.muted,
                      border: `1px solid ${isActive ? '#C7DAFF' : 'transparent'}`,
                      '&:hover': { bgcolor: isActive ? '#EEF5FF' : shell.page },
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        left: 6,
                        top: 10,
                        bottom: 10,
                        width: 3,
                        borderRadius: 3,
                        bgcolor: isActive ? shell.blue : 'transparent',
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36, color: isActive ? shell.blue : '#98A2B3' }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: isActive ? 900 : 700 }}
                    />
                    {hasChildren && (isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />)}
                  </ListItemButton>
                </ListItem>
                {hasChildren && (
                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding sx={{ pl: 5, pr: 0.5, pb: 0.5, pt: 0.25 }}>
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
                                bgcolor: childActive ? '#F0F6FF' : 'transparent',
                                color: childActive ? shell.blue : shell.muted,
                                '&:hover': { bgcolor: childActive ? '#F0F6FF' : shell.page },
                              }}
                            >
                              <ListItemText
                                primary={child.label}
                                primaryTypographyProps={{
                                  fontSize: '0.765rem',
                                  fontWeight: childActive ? 900 : 700,
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
          <Box sx={{ borderTop: `1px solid ${shell.softLine}`, p: 1.5, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#FBFCFE' }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: '#EEF5FF', color: shell.blue, fontSize: 14, fontWeight: 900 }}>
              {currentUser.name.slice(0, 1)}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 900, color: shell.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser.name}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: shell.muted, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={currentUserMeta}
              >
                {currentUserMeta}
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
