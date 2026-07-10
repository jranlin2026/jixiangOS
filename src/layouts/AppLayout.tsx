import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import { Box, IconButton, Typography, useMediaQuery, useTheme } from '@mui/material';
import Sidebar from './Sidebar';
import GlobalTableColumnResizer from '../shared/components/GlobalTableColumnResizer';

const AppLayout: React.FC = () => {
  const sidebarWidth = 240;
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [navigationOpen, setNavigationOpen] = useState(false);
  const handleCloseNavigation = () => setNavigationOpen(false);

  return (
    <Box sx={{ display: 'flex', width: '100%', maxWidth: '100vw', minHeight: '100vh', overflowX: 'hidden', bgcolor: '#F6F8FB' }}>
      <Sidebar
        width={sidebarWidth}
        variant={isDesktop ? 'permanent' : 'temporary'}
        open={isDesktop || navigationOpen}
        onClose={handleCloseNavigation}
        onNavigate={handleCloseNavigation}
      />
      <GlobalTableColumnResizer />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          minHeight: '100vh',
          overflow: 'auto',
          bgcolor: '#F6F8FB',
        }}
      >
        <Box
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
            onClick={() => setNavigationOpen(true)}
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
        </Box>
        <Outlet />
      </Box>
    </Box>
  );
};

export default AppLayout;
