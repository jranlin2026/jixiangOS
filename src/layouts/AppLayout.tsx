import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Box } from '@mui/material';
import Sidebar from './Sidebar';

const AppLayout: React.FC = () => {
  const [sidebarWidth] = useState(240);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f8f9fa' }}>
      <Sidebar width={sidebarWidth} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          ml: `${sidebarWidth}px`,
          minHeight: '100vh',
          overflow: 'auto',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default AppLayout;
