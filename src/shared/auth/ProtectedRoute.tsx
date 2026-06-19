import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission } from '../utils/permissions';

interface ProtectedRouteProps {
  permissionKey?: string;
  action?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ permissionKey, action = 'read' }) => {
  const location = useLocation();
  const { currentUser, loading, initialized } = useAuthStore();

  if (loading || !initialized) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={36} />
      </Box>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (permissionKey && !hasPermission(currentUser, permissionKey, action)) {
    return <Navigate to="/no-permission" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
