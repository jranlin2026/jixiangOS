import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Box, ButtonBase, Chip, Collapse, Divider, Drawer, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Tooltip, Typography } from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GroupsIcon from '@mui/icons-material/Groups';
import HomeIcon from '@mui/icons-material/Home';
import LockResetIcon from '@mui/icons-material/LockReset';
import LogoutIcon from '@mui/icons-material/Logout';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import PaidIcon from '@mui/icons-material/Paid';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import { ROUTES } from '../shared/utils/constants';
import { hasPermission, PERMISSION_KEYS } from '../shared/utils/permissions';
import { ensureOrganizationConfigData } from '../shared/utils/organizationConfig';
import useAuthStore from '../store/useAuthStore';
import ChangePasswordDialog from '../shared/components/ChangePasswordDialog';
import NotificationBell from '../shared/components/NotificationBell';
import { getVisibleSidebarNavigation, isNavigationItemActive } from './sidebarNavigation';
import { shellSurfaceShadow, shellVisualTokens as shell } from './shellVisualTokens';

interface SidebarProps {
  width: number;
  layoutWidth: number;
  variant: 'permanent' | 'temporary';
  open: boolean;
  onClose: () => void;
  onNavigate?: () => void;
}

const fixedIcons: Record<string, React.ReactElement> = { workbench: <HomeIcon />, cockpit: <DashboardIcon /> };
const groupIcons: Record<string, React.ReactElement> = {
  customer: <GroupsIcon />, finance: <PaidIcon />, growth: <CampaignOutlinedIcon />,
  organization: <AccountTreeOutlinedIcon />, management: <BusinessOutlinedIcon />, settings: <SettingsIcon />,
};

const Sidebar: React.FC<SidebarProps> = ({ width, layoutWidth, variant, open, onClose, onNavigate }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuthStore();
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const currentDepartmentName = useMemo(() => {
    if (!currentUser?.departmentId) return '';
    return ensureOrganizationConfigData().departments.find((department) => department.id === currentUser.departmentId)?.name || '';
  }, [currentUser?.departmentId]);
  const currentUserRole = currentUser?.positionName || currentUser?.role || '员工';
  const currentUserMeta = currentDepartmentName ? `${currentUserRole} · ${currentDepartmentName}` : currentUserRole;
  const canUseAiAssistant = [PERMISSION_KEYS.AI_ASSISTANT, PERMISSION_KEYS.AI_POSITION_ASSISTANT]
    .some((permissionKey) => hasPermission(currentUser, permissionKey));
  const { fixedItems: visibleFixedItems, groups: visibleGroups } = useMemo(
    () => getVisibleSidebarNavigation(currentUser),
    [currentUser],
  );
  const activeGroupId = visibleGroups.find((group) => group.children.some((item) => isNavigationItemActive(item, location.pathname, location.search)))?.id || null;

  useEffect(() => {
    if (activeGroupId) setExpandedGroupId(activeGroupId);
  }, [activeGroupId]);

  const handleLogout = async () => {
    setAccountAnchor(null);
    await logout();
    navigate('/login', { replace: true });
  };
  const navigateTo = (path: string) => {
    navigate(path);
    onNavigate?.();
  };
  const renderBadge = (badge?: string) => badge ? (
    <Chip label={badge} size="small" sx={{ height: 20, ml: 0.75, bgcolor: '#FFF3D9', color: '#B46A08', fontSize: '0.625rem', fontWeight: 900 }} />
  ) : null;

  return (
    <Drawer variant={variant} open={open} onClose={onClose} ModalProps={{ keepMounted: true }} sx={{ width: layoutWidth, flexShrink: 0, '& .MuiDrawer-paper': { width, boxSizing: 'border-box', bgcolor: shell.sidebar, borderRight: `1px solid ${shell.line}`, boxShadow: shellSurfaceShadow } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ px: 2.25, display: 'flex', alignItems: 'center', gap: 1.25, height: 64, bgcolor: shell.header, borderBottom: `1px solid ${shell.softLine}` }}>
          <Box component="img" src="/jixiang-os-logo.png" alt="极享OS" sx={{ width: 42, height: 42, borderRadius: 2, objectFit: 'contain', flexShrink: 0 }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 900, color: shell.ink, fontSize: '1.125rem', lineHeight: 1.15 }}>极享OS 2.0</Typography>
            <Typography variant="caption" sx={{ color: '#8A849A', fontSize: '0.8125rem', lineHeight: 1.3 }}>AI企业运营系统</Typography>
          </Box>
          {canUseAiAssistant && (
            <Tooltip title="AI岗位助手 · 试运行">
              <IconButton size="small" aria-label="打开AI岗位助手" onClick={() => navigateTo(ROUTES.AI_ASSISTANT)} sx={{ color: shell.violet, bgcolor: '#F2ECFF', '&:hover': { bgcolor: '#E9DEFF' } }}>
                <SmartToyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <List sx={{ px: 1.5, py: 1.5, flex: 1, overflowY: 'auto' }}>
          {visibleFixedItems.map((item) => {
            const isActive = isNavigationItemActive(item, location.pathname, location.search);
            return (
              <ListItem key={item.id} disablePadding sx={{ mb: 0.25 }}>
                <ListItemButton onClick={() => navigateTo(item.path)} sx={{ position: 'relative', overflow: 'hidden', borderRadius: 2.5, py: 1, px: 1.35, minHeight: 48, bgcolor: isActive ? shell.violetSoft : 'transparent', color: isActive ? shell.violet : shell.mutedStrong, '&::before': isActive ? { content: '""', position: 'absolute', left: 0, top: 10, bottom: 10, width: 4, borderRadius: '0 4px 4px 0', bgcolor: shell.violet } : undefined, '&:hover': { bgcolor: isActive ? shell.violetSoft : shell.violetHover } }}>
                  <ListItemIcon sx={{ minWidth: 36, color: isActive ? shell.violet : shell.icon }}>{fixedIcons[item.id]}</ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.9375rem', fontWeight: isActive ? 900 : 700 }} />
                </ListItemButton>
              </ListItem>
            );
          })}

          <Divider sx={{ my: 1, borderColor: shell.softLine }} />

          {visibleGroups.map((group) => {
            const isActive = group.id === activeGroupId;
            const isExpanded = group.id === expandedGroupId;
            return (
              <React.Fragment key={group.id}>
                <ListItem disablePadding sx={{ mb: 0.25 }}>
                  <ListItemButton onClick={() => setExpandedGroupId((current) => current === group.id ? null : group.id)} aria-expanded={isExpanded} sx={{ borderRadius: 2.5, py: 0.9, px: 1.35, minHeight: 46, bgcolor: isActive ? '#F7F5FF' : 'transparent', color: isActive ? shell.violet : shell.ink, '&:hover': { bgcolor: shell.violetHover } }}>
                    <ListItemIcon sx={{ minWidth: 36, color: isActive ? shell.violet : shell.icon }}>{groupIcons[group.id]}</ListItemIcon>
                    <ListItemText primary={group.label} primaryTypographyProps={{ fontSize: '0.9375rem', fontWeight: 900 }} />
                    {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </ListItemButton>
                </ListItem>
                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding sx={{ pl: 4.8, pr: 0.25, pb: 0.75, pt: 0.25 }}>
                    {group.children.map((item) => {
                      const childActive = isNavigationItemActive(item, location.pathname, location.search);
                      return (
                        <ListItem key={item.id} disablePadding sx={{ mb: 0.25 }}>
                          <ListItemButton onClick={() => navigateTo(item.path)} sx={{ position: 'relative', overflow: 'hidden', borderRadius: 2.5, py: 0.75, px: 1.25, minHeight: 38, bgcolor: childActive ? shell.violetSoft : 'transparent', color: childActive ? shell.violet : shell.mutedStrong, '&::before': childActive ? { content: '""', position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: '0 3px 3px 0', bgcolor: shell.violet } : undefined, '&:hover': { bgcolor: childActive ? shell.violetSoft : shell.violetHover } }}>
                            <ListItemText primary={<Box sx={{ display: 'flex', alignItems: 'center' }}>{item.label}{renderBadge(item.badge)}</Box>} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: childActive ? 900 : 700 }} />
                          </ListItemButton>
                        </ListItem>
                      );
                    })}
                  </List>
                </Collapse>
              </React.Fragment>
            );
          })}
        </List>

        {currentUser && (
          <Box data-sidebar-account-dock="true" sx={{ borderTop: `1px solid ${shell.softLine}`, p: 1.25, bgcolor: shell.header }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, border: `1px solid ${shell.line}`, borderRadius: 2.5, bgcolor: '#F9F6FF', boxShadow: '0 8px 22px rgba(86, 48, 201, 0.05)', p: 0.5 }}>
              <ButtonBase
                aria-label="打开账号菜单"
                aria-haspopup="menu"
                aria-expanded={Boolean(accountAnchor)}
                onClick={(event) => setAccountAnchor(event.currentTarget)}
                sx={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', borderRadius: 2, px: 0.75, py: 0.5, '&:hover': { bgcolor: shell.violetHover } }}
              >
                <Avatar src={currentUser.avatar} sx={{ width: 36, height: 36, bgcolor: '#EEE7FF', color: shell.violet, fontSize: 14, fontWeight: 900, flexShrink: 0 }}>{currentUser.name.slice(0, 1)}</Avatar>
                <Box sx={{ ml: 1, flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <Typography variant="body2" sx={{ fontWeight: 900, color: shell.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</Typography>
                  <Typography variant="caption" sx={{ color: shell.muted, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${currentUserMeta} · 企业版`}>{currentUserMeta} · 企业版</Typography>
                </Box>
                <ExpandMoreIcon sx={{ color: shell.muted, fontSize: 18, flexShrink: 0, transform: accountAnchor ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }} />
              </ButtonBase>
              <NotificationBell onUnreadCountChange={setUnreadNotificationCount} />
            </Box>
            <Menu
              anchorEl={accountAnchor}
              open={Boolean(accountAnchor)}
              onClose={() => setAccountAnchor(null)}
              anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
              transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
              <MenuItem onClick={() => { setAccountAnchor(null); navigateTo(ROUTES.NOTIFICATIONS); }}>
                <ListItemIcon><NotificationsNoneIcon fontSize="small" /></ListItemIcon>
                消息中心
                <Chip size="small" label={`${unreadNotificationCount} 未读`} sx={{ ml: 2, height: 22, fontSize: '0.6875rem', fontWeight: 800 }} />
              </MenuItem>
              <MenuItem onClick={() => { setAccountAnchor(null); setPasswordDialogOpen(true); }}>
                <ListItemIcon><LockResetIcon fontSize="small" /></ListItemIcon>
                修改密码
              </MenuItem>
              <MenuItem onClick={() => void handleLogout()}>
                <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                退出登录
              </MenuItem>
            </Menu>
          </Box>
        )}
        <ChangePasswordDialog open={passwordDialogOpen} onClose={() => setPasswordDialogOpen(false)} onChanged={handleLogout} />
      </Box>
    </Drawer>
  );
};

export default Sidebar;
