import React, { useReducer } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import { Box, IconButton, Typography, useMediaQuery, useTheme } from '@mui/material';
import Sidebar from './Sidebar';
import {
  APP_SHELL_MAIN_SX,
  APP_SHELL_VIEWPORT_SX,
  APP_SIDEBAR_WIDTH,
  getAppShellPresentation,
  mobileNavigationReducer,
} from './appShellState';
import GlobalTableColumnResizer from '../shared/components/GlobalTableColumnResizer';
import ChangePasswordDialog from '../shared/components/ChangePasswordDialog';
import useAuthStore from '../store/useAuthStore';

const AppLayout: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { currentUser, logout } = useAuthStore();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [navigationOpen, dispatchNavigation] = useReducer(mobileNavigationReducer, false);
  const shellPresentation = getAppShellPresentation(isDesktop, navigationOpen);
  const handleCloseNavigation = () => dispatchNavigation({ type: 'CLOSE' });
  const handleNavigation = () => dispatchNavigation({ type: 'NAVIGATE' });

  return (
    <Box sx={APP_SHELL_VIEWPORT_SX}>
      <Sidebar
        width={APP_SIDEBAR_WIDTH}
        layoutWidth={shellPresentation.sidebarLayoutWidth}
        variant={shellPresentation.drawerVariant}
        open={shellPresentation.drawerOpen}
        onClose={handleCloseNavigation}
        onNavigate={handleNavigation}
      />
      <GlobalTableColumnResizer />
      <ChangePasswordDialog
        open={Boolean(currentUser?.mustChangePassword)}
        forced
        onChanged={async () => {
          await logout();
          navigate('/login', { replace: true, state: { message: '密码修改成功，请使用新密码重新登录' } });
        }}
      />
      <Box
        component="main"
        sx={APP_SHELL_MAIN_SX}
      >
        {shellPresentation.showMobileHeader && <Box
          component="header"
          sx={{
            display: { xs: 'flex', md: 'none' },
            position: 'sticky',
            top: 0,
            zIndex: 1100,
            height: 56,
            px: 1.5,
            alignItems: 'center',
            gap: 1,
            bgcolor: '#FFFFFF',
            borderBottom: '1px solid #DDE4EC',
          }}
        >
          <IconButton
            aria-label="打开导航菜单"
            edge="start"
            onClick={() => dispatchNavigation({ type: 'OPEN' })}
            sx={{ color: '#1E6BFF' }}
          >
            <MenuIcon />
          </IconButton>
          <Box
            component="img"
            src="/jixiang-os-logo.png"
            alt=""
            sx={{ width: 28, height: 28, objectFit: 'contain' }}
          />
          <Typography variant="subtitle1" sx={{ color: '#101828', fontSize: '0.9375rem', fontWeight: 800 }}>
            极享OS
          </Typography>
        </Box>}
        <Outlet />
      </Box>
    </Box>
  );
};

export default AppLayout;
