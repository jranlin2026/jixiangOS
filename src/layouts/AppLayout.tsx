import React from 'react';
import { Outlet } from 'react-router-dom';
import { Box } from '@mui/material';
import Sidebar from './Sidebar';
import GlobalTableColumnResizer from '../shared/components/GlobalTableColumnResizer';

const AppLayout: React.FC = () => {
  const sidebarWidth = 240;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#F6F8FB' }}>
      <Sidebar width={sidebarWidth} />
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
        <Outlet />
      </Box>
    </Box>
  );
};

export default AppLayout;
