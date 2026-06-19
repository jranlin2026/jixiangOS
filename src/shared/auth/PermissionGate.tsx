import React from 'react';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission } from '../utils/permissions';

interface PermissionGateProps {
  permissionKey: string;
  action?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const PermissionGate: React.FC<PermissionGateProps> = ({ permissionKey, action = 'read', children, fallback = null }) => {
  const currentUser = useAuthStore((state) => state.currentUser);
  return hasPermission(currentUser, permissionKey, action) ? <>{children}</> : <>{fallback}</>;
};

export default PermissionGate;
