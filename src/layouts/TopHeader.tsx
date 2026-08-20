import React, { useEffect, useRef, useState } from 'react';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import KeyboardCommandKeyIcon from '@mui/icons-material/KeyboardCommandKey';
import LockResetOutlinedIcon from '@mui/icons-material/LockResetOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  InputAdornment,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import useAuthStore from '../store/useAuthStore';
import NotificationBell from '../shared/components/NotificationBell';
import ChangePasswordDialog from '../shared/components/ChangePasswordDialog';
import { shellSurfaceShadow, shellVisualTokens as shell } from './shellVisualTokens';

const TopHeader: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuthStore();
  const searchRef = useRef<HTMLInputElement>(null);
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  const handleLogout = async () => {
    setAccountAnchor(null);
    await logout();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  return (
    <Box
      component="header"
      sx={{
        display: { xs: 'none', md: 'flex' },
        alignItems: 'center',
        minHeight: 72,
        px: { md: 2.5, xl: 3.5 },
        gap: 2,
        bgcolor: shell.header,
        borderBottom: `1px solid ${shell.line}`,
        boxShadow: shellSurfaceShadow,
        flexShrink: 0,
        zIndex: 1050,
      }}
    >
      <TextField
        inputRef={searchRef}
        placeholder="搜索客户 / 线索 / 订单…"
        aria-label="全局搜索"
        size="small"
        sx={{
          width: { md: 280, xl: 360 },
          ml: 'auto',
          '& .MuiOutlinedInput-root': {
            bgcolor: shell.surface,
            minHeight: 44,
            borderRadius: 3,
            boxShadow: '0 2px 12px rgba(31, 41, 55, 0.04)',
          },
        }}
        InputProps={{
          startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 20, color: '#9B95AA' }} /></InputAdornment>,
          endAdornment: (
            <InputAdornment position="end">
              <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: '#AAA5BA' }}>
                <KeyboardCommandKeyIcon sx={{ fontSize: 14 }} />
                <Typography variant="caption" sx={{ fontWeight: 800 }}>K</Typography>
              </Stack>
            </InputAdornment>
          ),
        }}
      />
      <Button startIcon={<HelpOutlineIcon />} sx={{ color: shell.mutedStrong, whiteSpace: 'nowrap', boxShadow: 'none', fontWeight: 800 }}>
        帮助中心
      </Button>
      <NotificationBell />
      <Box sx={{ height: 32, width: '1px', bgcolor: shell.line }} />
      <ButtonBase
        aria-label="打开账号菜单"
        aria-haspopup="menu"
        aria-expanded={Boolean(accountAnchor)}
        onClick={(event) => setAccountAnchor(event.currentTarget)}
        sx={{ borderRadius: 2.25, px: 0.75, py: 0.5, minWidth: 168, justifyContent: 'flex-start', '&:hover': { bgcolor: shell.violetHover } }}
      >
        <Stack direction="row" spacing={1.1} alignItems="center" sx={{ width: '100%' }}>
          <Avatar
            src={currentUser?.avatar}
            sx={{ width: 38, height: 38, bgcolor: shell.violetSoft, color: shell.violet, fontWeight: 900 }}
          >
            {currentUser?.name?.slice(0, 1) || '享'}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
            <Typography variant="body2" sx={{ color: shell.ink, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentUser?.name || '系统用户'}
            </Typography>
            <Typography variant="caption" sx={{ color: '#8A849A', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentUser?.positionName || currentUser?.role || '员工'}
            </Typography>
          </Box>
          <ExpandMoreIcon sx={{ fontSize: 18, color: '#8A849A' }} />
        </Stack>
      </ButtonBase>
      <Menu
        anchorEl={accountAnchor}
        open={Boolean(accountAnchor)}
        onClose={() => setAccountAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={() => { setAccountAnchor(null); setPasswordDialogOpen(true); }}>
          <ListItemIcon><LockResetOutlinedIcon fontSize="small" /></ListItemIcon>
          修改密码
        </MenuItem>
        <MenuItem onClick={() => void handleLogout()}>
          <ListItemIcon><LogoutOutlinedIcon fontSize="small" /></ListItemIcon>
          退出登录
        </MenuItem>
      </Menu>
      <ChangePasswordDialog open={passwordDialogOpen} onClose={() => setPasswordDialogOpen(false)} onChanged={handleLogout} />
    </Box>
  );
};

export default TopHeader;
