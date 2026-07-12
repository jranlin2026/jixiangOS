import React, { Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import { CircularProgress, Box } from '@mui/material';
import { ROUTES } from './shared/utils/constants';
import { initializeMockData } from './api';
import ProtectedRoute from './shared/auth/ProtectedRoute';
import { PERMISSION_KEYS } from './shared/utils/permissions';
import useAuthStore from './store/useAuthStore';
import StorageSyncFailureNotice from './shared/components/StorageSyncFailureNotice';

const HomeWorkbench = React.lazy(() => import('./pages/Dashboard'));
const BusinessCockpit = React.lazy(() => import('./pages/Dashboard/BusinessCockpit'));
const Leads = React.lazy(() => import('./pages/Leads'));
const Customers = React.lazy(() => import('./pages/Customers'));
const Orders = React.lazy(() => import('./pages/Orders'));
const Delivery = React.lazy(() => import('./pages/Delivery'));
const AfterSales = React.lazy(() => import('./pages/AfterSales'));
const Finance = React.lazy(() => import('./pages/Finance'));
const EcommerceSettlement = React.lazy(() => import('./pages/EcommerceSettlement'));
const Assets = React.lazy(() => import('./pages/Assets'));
const GEO = React.lazy(() => import('./pages/GEO'));
const AIAssistant = React.lazy(() => import('./pages/AIAssistant'));
const Enablement = React.lazy(() => import('./pages/Enablement'));
const CoCreation = React.lazy(() => import('./pages/CoCreation'));
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
    <>
      <StorageSyncFailureNotice />
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
          <Route element={<ProtectedRoute permissionKeys={[
            PERMISSION_KEYS.AFTER_SALES,
            PERMISSION_KEYS.AFTER_SALES_RECOVERY,
            PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE,
            PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW,
          ]} />}>
            <Route path={ROUTES.AFTER_SALES} element={<Suspense fallback={<PageLoader />}><AfterSales /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[
            PERMISSION_KEYS.FINANCE,
            PERMISSION_KEYS.FINANCE_MY_COMMISSION,
            PERMISSION_KEYS.FINANCE_SETTLEMENT,
            PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT,
            PERMISSION_KEYS.FINANCE_PAYOUT,
            PERMISSION_KEYS.FINANCE_FLOW,
            PERMISSION_KEYS.FINANCE_RULES,
          ]} />}>
            <Route path={ROUTES.FINANCE} element={<Suspense fallback={<PageLoader />}><Finance /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.FINANCE_SETTLEMENT} />}>
            <Route path={ROUTES.COMMISSION} element={<Navigate to={`${ROUTES.FINANCE}?tab=settlement`} replace />} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[
            PERMISSION_KEYS.ECOMMERCE_SETTLEMENT,
            PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_WORKBENCH,
            PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_HISTORY,
            PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_EXCEPTIONS,
            PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_TALENTS,
            PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_SETTINGS,
            PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_RULES,
          ]} />}>
            <Route path={ROUTES.ECOMMERCE_SETTLEMENT} element={<Suspense fallback={<PageLoader />}><EcommerceSettlement /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[
            PERMISSION_KEYS.ASSETS,
            PERMISSION_KEYS.ASSETS_OVERVIEW,
            PERMISSION_KEYS.ASSETS_DEVICES,
            PERMISSION_KEYS.ASSETS_PHONES,
            PERMISSION_KEYS.ASSETS_ACCOUNTS,
            PERMISSION_KEYS.ASSETS_RISKS,
            PERMISSION_KEYS.ASSETS_LOGS,
            PERMISSION_KEYS.ASSETS_OFFBOARDING,
          ]} />}>
            <Route path={ROUTES.ASSETS} element={<Suspense fallback={<PageLoader />}><Assets /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[
            PERMISSION_KEYS.GEO,
            PERMISSION_KEYS.GEO_OVERVIEW,
            PERMISSION_KEYS.GEO_CONTENT,
            PERMISSION_KEYS.GEO_ANALYTICS,
          ]} />}>
            <Route path={ROUTES.GEO} element={<Suspense fallback={<PageLoader />}><GEO /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.AI_ASSISTANT} />}>
            <Route path={ROUTES.AI_ASSISTANT} element={<Suspense fallback={<PageLoader />}><AIAssistant /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[
            PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE,
            PERMISSION_KEYS.ENABLEMENT_REVIEW,
            PERMISSION_KEYS.ENABLEMENT_PUBLISH,
          ]} />}>
            <Route path={ROUTES.ENABLEMENT} element={<Suspense fallback={<PageLoader />}><Enablement /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[
            PERMISSION_KEYS.CO_CREATION_SUBMIT,
            PERMISSION_KEYS.CO_CREATION_SUPERVISE,
            PERMISSION_KEYS.CO_CREATION_DECIDE,
            PERMISSION_KEYS.CO_CREATION_VALIDATE,
          ]} />}>
            <Route path={ROUTES.CO_CREATION} element={<Suspense fallback={<PageLoader />}><CoCreation /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.SETTINGS} />}>
            <Route path={ROUTES.SETTINGS} element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[PERMISSION_KEYS.AFTER_SALES, PERMISSION_KEYS.AFTER_SALES_RECOVERY]} />}>
            <Route path={ROUTES.REFUND_CENTER} element={<Navigate to={ROUTES.AFTER_SALES} replace />} />
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
    </>
  );
};

export default App;
