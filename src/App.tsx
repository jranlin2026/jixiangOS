import React, { Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import { CircularProgress, Box } from '@mui/material';
import { ROUTES } from './shared/utils/constants';
import { initializeMockData } from './api';
import ProtectedRoute from './shared/auth/ProtectedRoute';
import { PERMISSION_KEYS } from './shared/utils/permissions';
import useAuthStore from './store/useAuthStore';

const HomeWorkbench = React.lazy(() => import('./pages/Dashboard'));
const BusinessCockpit = React.lazy(() => import('./pages/Dashboard/BusinessCockpit'));
const Leads = React.lazy(() => import('./pages/Leads'));
const Customers = React.lazy(() => import('./pages/Customers'));
const Orders = React.lazy(() => import('./pages/Orders'));
const Delivery = React.lazy(() => import('./pages/Delivery'));
const Finance = React.lazy(() => import('./pages/Finance'));
const UpgradeCenter = React.lazy(() => import('./pages/UpgradePool'));
const AIAssistant = React.lazy(() => import('./pages/AIAssistant'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Login = React.lazy(() => import('./pages/Login'));
const NoPermission = React.lazy(() => import('./pages/NoPermission'));

const PageLoader: React.FC = () => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100%',
      minHeight: 400,
    }}
  >
    <CircularProgress size={40} />
  </Box>
);

const App: React.FC = () => {
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    initializeMockData();
    bootstrap();
  }, [bootstrap]);

  return (
    <Routes>
      <Route
        path="/login"
        element={(
          <Suspense fallback={<PageLoader />}>
            <Login />
          </Suspense>
        )}
      />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<AppLayout />}>
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.HOME} />}>
            <Route
              index
              element={(
                <Suspense fallback={<PageLoader />}>
                  <HomeWorkbench />
                </Suspense>
              )}
            />
          </Route>
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.DASHBOARD} />}>
            <Route
              path={ROUTES.DASHBOARD}
              element={(
                <Suspense fallback={<PageLoader />}>
                  <BusinessCockpit />
                </Suspense>
              )}
            />
          </Route>
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.LEADS} />}>
            <Route
              path={ROUTES.LEADS}
              element={(
                <Suspense fallback={<PageLoader />}>
                  <Leads />
                </Suspense>
              )}
            />
          </Route>
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.CUSTOMERS} />}>
            <Route
              path={ROUTES.CUSTOMERS}
              element={(
                <Suspense fallback={<PageLoader />}>
                  <Customers />
                </Suspense>
              )}
            />
          </Route>
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.ORDERS} />}>
            <Route
              path={ROUTES.ORDERS}
              element={(
                <Suspense fallback={<PageLoader />}>
                  <Orders />
                </Suspense>
              )}
            />
            <Route
              path={ROUTES.ORDER_REVIEW}
              element={<Navigate to={`${ROUTES.ORDERS}?tab=review`} replace />}
            />
          </Route>
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.DELIVERY} />}>
            <Route path={ROUTES.DELIVERY} element={<Suspense fallback={<PageLoader />}><Delivery /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.FINANCE} />}>
            <Route path={ROUTES.FINANCE} element={<Suspense fallback={<PageLoader />}><Finance /></Suspense>} />
            <Route path={ROUTES.COMMISSION} element={<Navigate to={`${ROUTES.FINANCE}?tab=settlement`} replace />} />
          </Route>
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.UPGRADE_ANALYSIS} />}>
            <Route path={ROUTES.UPGRADE_ANALYSIS} element={<Navigate to={`${ROUTES.UPGRADE_CENTER}?tab=analysis`} replace />} />
          </Route>
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.AI_ASSISTANT} />}>
            <Route path={ROUTES.AI_ASSISTANT} element={<Suspense fallback={<PageLoader />}><AIAssistant /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.SETTINGS} />}>
            <Route path={ROUTES.SETTINGS} element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.REFUND_CENTER} />}>
            <Route path={ROUTES.REFUND_CENTER} element={<Navigate to={`${ROUTES.FINANCE}?tab=refund`} replace />} />
          </Route>
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.UPGRADE_POOL} />}>
            <Route path={ROUTES.UPGRADE_POOL} element={<Navigate to={`${ROUTES.UPGRADE_CENTER}?tab=pool`} replace />} />
            <Route path={ROUTES.UPGRADE_CENTER} element={<Suspense fallback={<PageLoader />}><UpgradeCenter /></Suspense>} />
          </Route>
          <Route
            path="/no-permission"
            element={(
              <Suspense fallback={<PageLoader />}>
                <NoPermission />
              </Suspense>
            )}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
};

export default App;
