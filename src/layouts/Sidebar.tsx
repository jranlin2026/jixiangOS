import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Box, Chip, Collapse, Divider, Drawer, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Tooltip, Typography } from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GroupsIcon from '@mui/icons-material/Groups';
import HomeIcon from '@mui/icons-material/Home';
import LockResetIcon from '@mui/icons-material/LockReset';
import LogoutIcon from '@mui/icons-material/Logout';
import PaidIcon from '@mui/icons-material/Paid';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { ROUTES } from '../shared/utils/constants';
import { hasPermission, PERMISSION_KEYS } from '../shared/utils/permissions';
import { ensureOrganizationConfigData } from '../shared/utils/organizationConfig';
import useAuthStore from '../store/useAuthStore';
import ChangePasswordDialog from '../shared/components/ChangePasswordDialog';
import NotificationBell from '../shared/components/NotificationBell';
import { getVisibleSidebarNavigation, isNavigationItemActive } from './sidebarNavigation';

interface SidebarProps {
  width: number;
  layoutWidth: number;
  variant: 'permanent' | 'temporary';
  open: boolean;
  onClose: () => void;
  onNavigate?: () => void;
}

const shell = { ink: '#101828', muted: '#667085', line: '#DDE4EC', softLine: '#EEF2F6', blue: '#1E6BFF', surface: '#FFFFFF', page: '#F6F8FB' };
const fixedIcons: Record<string, React.ReactElement> = { workbench: <HomeIcon />, cockpit: <DashboardIcon /> };
const groupIcons: Record<string, React.ReactElement> = {
  customer: <GroupsIcon />, finance: <PaidIcon />, growth: <CampaignOutlinedIcon />,
  organization: <AccountTreeOutlinedIcon />, management: <SettingsIcon />,
};

const Sidebar: React.FC<SidebarProps> = ({ width, layoutWidth, variant, open, onClose, onNavigate }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuthStore();
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const currentDepartmentName = useMemo(() => {
    if (!currentUser?.departmentId) return '';
    return ensureOrganizationConfigData().departments.find((department) => department.id === currentUser.departmentId)?.name || '';
  }, [currentUser?.departmentId]);
  const currentUserMeta = currentDepartmentName ? `${currentUser?.role || ''} · ${currentDepartmentName}` : currentUser?.role;
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
    await logout();
    navigate('/login', { replace: true });
  };
  const navigateTo = (path: string) => {
    navigate(path);
    onNavigate?.();
  };
  const renderBadge = (badge?: string) => badge ? (
    <Chip label={badge} size="small" sx={{ height: 20, ml: 0.75, bgcolor: '#FFF6E5', color: '#B46A08', fontSize: '0.625rem', fontWeight: 900 }} />
  ) : null;

  return (
    <Drawer variant={variant} open={open} onClose={onClose} ModalProps={{ keepMounted: true }} sx={{ width: layoutWidth, flexShrink: 0, '& .MuiDrawer-paper': { width, boxSizing: 'border-box', bgcolor: shell.surface, borderRight: `1px solid ${shell.line}`, boxShadow: 'none' } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ px: 2, display: 'flex', alignItems: 'center', gap: 1.25, height: 76, borderBottom: `1px solid ${shell.softLine}` }}>
          <Box component="img" src="/jixiang-os-logo.png" alt="极享OS" sx={{ width: 36, height: 36, borderRadius: 1.5, objectFit: 'contain', flexShrink: 0 }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#1a1a2e', fontSize: '1rem', lineHeight: 1.1 }}>极享OS</Typography>
            <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.75rem', lineHeight: 1.3 }}>员工工作台</Typography>
          </Box>
          {canUseAiAssistant && (
            <Tooltip title="AI岗位助手 · 试运行">
              <IconButton size="small" aria-label="打开AI岗位助手" onClick={() => navigateTo(ROUTES.AI_ASSISTANT)} sx={{ color: shell.blue, bgcolor: '#EEF5FF', '&:hover': { bgcolor: '#DDEAFF' } }}>
                <SmartToyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <List sx={{ px: 1.25, py: 1.25, flex: 1, overflowY: 'auto' }}>
          {visibleFixedItems.map((item) => {
            const isActive = isNavigationItemActive(item, location.pathname, location.search);
            return (
              <ListItem key={item.id} disablePadding sx={{ mb: 0.25 }}>
                <ListItemButton onClick={() => navigateTo(item.path)} sx={{ position: 'relative', borderRadius: 1.25, py: 0.95, px: 1.25, minHeight: 44, bgcolor: isActive ? '#EEF5FF' : 'transparent', color: isActive ? shell.blue : shell.muted, border: `1px solid ${isActive ? '#C7DAFF' : 'transparent'}`, '&:hover': { bgcolor: isActive ? '#EEF5FF' : shell.page }, '&::before': { content: '""', position: 'absolute', left: 6, top: 10, bottom: 10, width: 3, borderRadius: 3, bgcolor: isActive ? shell.blue : 'transparent' } }}>
                  <ListItemIcon sx={{ minWidth: 36, color: isActive ? shell.blue : '#98A2B3' }}>{fixedIcons[item.id]}</ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: isActive ? 900 : 700 }} />
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
                  <ListItemButton onClick={() => setExpandedGroupId((current) => current === group.id ? null : group.id)} aria-expanded={isExpanded} sx={{ borderRadius: 1.25, py: 0.85, px: 1.25, minHeight: 42, color: isActive ? shell.blue : shell.ink, '&:hover': { bgcolor: shell.page } }}>
                    <ListItemIcon sx={{ minWidth: 36, color: isActive ? shell.blue : '#98A2B3' }}>{groupIcons[group.id]}</ListItemIcon>
                    <ListItemText primary={group.label} primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: 900 }} />
                    {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </ListItemButton>
                </ListItem>
                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding sx={{ pl: 5, pr: 0.5, pb: 0.75, pt: 0.25 }}>
                    {group.children.map((item) => {
                      const childActive = isNavigationItemActive(item, location.pathname, location.search);
                      return (
                        <ListItem key={item.id} disablePadding sx={{ mb: 0.25 }}>
                          <ListItemButton onClick={() => navigateTo(item.path)} sx={{ borderRadius: 1.25, py: 0.7, px: 1.25, minHeight: 34, bgcolor: childActive ? '#F0F6FF' : 'transparent', color: childActive ? shell.blue : shell.muted, '&:hover': { bgcolor: childActive ? '#F0F6FF' : shell.page } }}>
                            <ListItemText primary={<Box sx={{ display: 'flex', alignItems: 'center' }}>{item.label}{renderBadge(item.badge)}</Box>} primaryTypographyProps={{ fontSize: '0.765rem', fontWeight: childActive ? 900 : 700 }} />
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
          <Box sx={{ borderTop: `1px solid ${shell.softLine}`, p: 1.5, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#FBFCFE' }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: '#EEF5FF', color: shell.blue, fontSize: 14, fontWeight: 900 }}>{currentUser.name.slice(0, 1)}</Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 900, color: shell.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</Typography>
              <Typography variant="caption" sx={{ color: shell.muted, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={currentUserMeta}>{currentUserMeta}</Typography>
            </Box>
            <NotificationBell />
            <Tooltip title="修改密码"><IconButton size="small" onClick={() => setPasswordDialogOpen(true)}><LockResetIcon fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="退出登录"><IconButton size="small" onClick={handleLogout}><LogoutIcon fontSize="small" /></IconButton></Tooltip>
          </Box>
        )}
        <ChangePasswordDialog open={passwordDialogOpen} onClose={() => setPasswordDialogOpen(false)} onChanged={handleLogout} />
      </Box>
    </Drawer>
  );
};

export default Sidebar;
