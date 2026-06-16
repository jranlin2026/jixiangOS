import React from 'react';
import { Box } from '@mui/material';
import AIWorkbench from './AIWorkbench';
import QuickActions from './QuickActions';
import CockpitCards from './CockpitCards';

const Dashboard: React.FC = () => {
  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <AIWorkbench />
      <Box sx={{ mt: 4 }}>
        <QuickActions />
      </Box>
      <Box sx={{ mt: 4 }}>
        <CockpitCards />
      </Box>
    </Box>
  );
};

export default Dashboard;
