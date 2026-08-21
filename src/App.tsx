import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import { Alert, Button, CircularProgress, Box, Stack } from '@mui/material';
import { ROUTES } from './shared/utils/constants';
import { initializeMockData } from './api';
import ProtectedRoute from './shared/auth/ProtectedRoute';
import { PERMISSION_KEYS } from './shared/utils/permissions';
import { ACADEMY_ACCESS_PERMISSION_KEYS } from './shared/utils/academyAccess';
import { OKR_ACCESS_PERMISSION_KEYS } from './shared/utils/okrAccess';
import useAuthStore from './store/useAuthStore';
import StorageSyncFailureNotice from './shared/components/StorageSyncFailureNotice';
import { systemSetupApi, type SystemSetupStatus } from './api/systemSetupApi';
import { synchronizeClientInstallation } from './shared/utils/systemInstallationCache';

const HomeWorkbench = React.lazy(() => import('./pages/Dashboard'));
const BusinessCockpit = React.lazy(() => import('./pages/Dashboard/BusinessCockpit'));
const SalesBattlefield = React.lazy(() => import('./pages/SalesManagement/SalesBattlefield'));
const Leads = React.lazy(() => import('./pages/Leads'));
const Customers = React.lazy(() => import('./pages/Customers'));
const CustomerDuplicateGovernance = React.lazy(() => import('./pages/Customers/CustomerDuplicateGovernance'));
const Orders = React.lazy(() => import('./pages/Orders'));
const Delivery = React.lazy(() => import('./pages/Delivery'));
const AfterSales = React.lazy(() => import('./pages/AfterSales'));
const RefundCenter = React.lazy(() => import('./pages/RefundCenter'));
const Finance = React.lazy(() => import('./pages/Finance'));
const EcommerceSettlement = React.lazy(() => import('./pages/EcommerceSettlement'));
const Assets = React.lazy(() => import('./pages/Assets'));
const Marketing = React.lazy(() => import('./pages/Marketing'));
const GEO = React.lazy(() => import('./pages/GEO'));
const AIAssistant = React.lazy(() => import('./pages/AIAssistant'));
const Academy = React.lazy(() => import('./pages/Academy'));
const Enablement = React.lazy(() => import('./pages/Enablement'));
const Tasks = React.lazy(() => import('./pages/Tasks'));
const Okr = React.lazy(() => import('./pages/Okr'));
const CoCreation = React.lazy(() => import('./pages/CoCreation'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Notifications = React.lazy(() => import('./pages/Notifications'));
const Login = React.lazy(() => import('./pages/Login'));
const NoPermission = React.lazy(() => import('./pages/NoPermission'));
const SystemSetup = React.lazy(() => import('./pages/SystemSetup'));
const BrowserAgentConnect = React.lazy(() => import('./pages/BrowserAgentConnect'));

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
  const [setupStatus, setSetupStatus] = useState<SystemSetupStatus | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);

  const acceptSetupStatus = useCallback((status: SystemSetupStatus) => {
    synchronizeClientInstallation(status.installationId);
    setSetupStatus(status);
  }, []);

  const loadSetupStatus = useCallback(async () => {
    setSetupLoading(true);
    setSetupError(null);
    try {
      const response = await systemSetupApi.getStatus();
      if (response.code !== 0 || !response.data) throw new Error(response.message || '无法读取系统初始化状态');
      acceptSetupStatus(response.data);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : '无法读取系统初始化状态');
    } finally {
      setSetupLoading(false);
    }
  }, [acceptSetupStatus]);

  useEffect(() => {
    void loadSetupStatus();
  }, [loadSetupStatus]);

  useEffect(() => {
    if (!setupStatus?.initialized) return;
    initializeMockData();
    void bootstrap();
  }, [bootstrap, setupStatus?.initialized]);

  if (setupLoading) return <PageLoader />;

  if (setupError || !setupStatus) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#f6f8fb', p: 3 }}>
        <Stack spacing={2} sx={{ width: '100%', maxWidth: 520 }}>
          <Alert severity="error">{setupError || '无法读取系统初始化状态'}</Alert>
          <Button variant="contained" onClick={() => void loadSetupStatus()}>重新检查</Button>
        </Stack>
      </Box>
    );
  }

  if (!setupStatus?.initialized) {
    return (
      <Routes>
        <Route path="/setup" element={<Suspense fallback={<PageLoader />}><SystemSetup status={setupStatus} onComplete={acceptSetupStatus} /></Suspense>} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <StorageSyncFailureNotice />
      <Routes>
        <Route path="/setup" element={<Navigate to="/login" replace />} />
        <Route
          path="/login"
          element={(
            <Suspense fallback={<PageLoader />}>
              <Login />
            </Suspense>
          )}
        />
        <Route element={<ProtectedRoute />}>
          <Route path="/browser-agent/connect" element={<Suspense fallback={<PageLoader />}><BrowserAgentConnect /></Suspense>} />
          <Route path="/" element={<AppLayout />}>
          <Route path={ROUTES.NOTIFICATIONS} element={<Suspense fallback={<PageLoader />}><Notifications /></Suspense>} />
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
          <Route element={<ProtectedRoute permissionKeys={[PERMISSION_KEYS.DASHBOARD, PERMISSION_KEYS.BRAIN_DASHBOARD]} />}>
            <Route
              path={ROUTES.DASHBOARD}
              element={(
                <Suspense fallback={<PageLoader />}>
                  <BusinessCockpit />
                </Suspense>
              )}
            />
            <Route
              path={ROUTES.SALES_MANAGEMENT}
              element={(
                <Suspense fallback={<PageLoader />}>
                  <SalesBattlefield />
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
          <Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.CUSTOMER_MERGE} action="write" />}>
            <Route
              path={ROUTES.CUSTOMER_DUPLICATES}
              element={<Suspense fallback={<PageLoader />}><CustomerDuplicateGovernance /></Suspense>}
            />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[
            PERMISSION_KEYS.ORDER_MANAGE,
            PERMISSION_KEYS.ORDER_REVIEW_LIST,
            PERMISSION_KEYS.ORDER_CREATE,
          ]} />}>
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
            PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST,
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
            PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH,
          ]} />}>
            <Route path={ROUTES.ASSETS} element={<Suspense fallback={<PageLoader />}><Assets /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[
            PERMISSION_KEYS.MARKETING_CONTENT,
            PERMISSION_KEYS.MARKETING_REVIEW,
            PERMISSION_KEYS.MARKETING_PUBLISH,
            PERMISSION_KEYS.MARKETING_GROUPS,
            PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH,
          ]} />}>
            <Route path={ROUTES.MARKETING} element={<Suspense fallback={<PageLoader />}><Marketing /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[
            PERMISSION_KEYS.GEO,
            PERMISSION_KEYS.GEO_OVERVIEW,
            PERMISSION_KEYS.GEO_CONTENT,
            PERMISSION_KEYS.GEO_ANALYTICS,
          ]} />}>
            <Route path={ROUTES.GEO} element={<Suspense fallback={<PageLoader />}><GEO /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[PERMISSION_KEYS.AI_ASSISTANT, PERMISSION_KEYS.AI_POSITION_ASSISTANT]} />}>
            <Route path={ROUTES.AI_ASSISTANT} element={<Suspense fallback={<PageLoader />}><AIAssistant /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[...ACADEMY_ACCESS_PERMISSION_KEYS]} />}>
            <Route path={`${ROUTES.ACADEMY}/*`} element={<Suspense fallback={<PageLoader />}><Academy /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[
            PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE,
            PERMISSION_KEYS.ENABLEMENT_REVIEW,
            PERMISSION_KEYS.ENABLEMENT_PUBLISH,
            PERMISSION_KEYS.STANDARD_READ,
            PERMISSION_KEYS.STANDARD_MAINTAIN,
            PERMISSION_KEYS.STANDARD_PUBLISH,
            PERMISSION_KEYS.TASK_ASSIGN,
          ]} />}>
            <Route path={ROUTES.ENABLEMENT} element={<Suspense fallback={<PageLoader />}><Enablement /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[PERMISSION_KEYS.TASK_SELF, PERMISSION_KEYS.TASK_TEAM, PERMISSION_KEYS.TASK_ASSIGN]} />}>
            <Route path={ROUTES.TASKS} element={<Suspense fallback={<PageLoader />}><Tasks /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[...OKR_ACCESS_PERMISSION_KEYS]} />}>
            <Route path={ROUTES.OKR} element={<Suspense fallback={<PageLoader />}><Okr /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[
            PERMISSION_KEYS.CO_CREATION_SUBMIT,
            PERMISSION_KEYS.CO_CREATION_SUPERVISE,
            PERMISSION_KEYS.CO_CREATION_DECIDE,
            PERMISSION_KEYS.CO_CREATION_VALIDATE,
          ]} />}>
            <Route path={ROUTES.CO_CREATION} element={<Suspense fallback={<PageLoader />}><CoCreation /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[
            PERMISSION_KEYS.SETTINGS,
            PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS,
            PERMISSION_KEYS.SETTINGS_ROLES,
            PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE,
            PERMISSION_KEYS.SETTINGS_PRODUCTS,
            PERMISSION_KEYS.SETTINGS_ORDER_TYPES,
            PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS,
            PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS,
            PERMISSION_KEYS.SETTINGS_LIFECYCLE,
            PERMISSION_KEYS.SETTINGS_LEAD_SOURCES,
            PERMISSION_KEYS.SETTINGS_LEAD_FLOW,
            PERMISSION_KEYS.SETTINGS_DELIVERY_ASSIGNMENT,
            PERMISSION_KEYS.SETTINGS_AFTER_SALES_SOURCES,
            PERMISSION_KEYS.SETTINGS_AI_CONFIG,
            PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE,
          ]} />}>
            <Route path={ROUTES.SETTINGS} element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute permissionKeys={[PERMISSION_KEYS.AFTER_SALES_REFUND, PERMISSION_KEYS.FINANCE_REFUND]} />}>
            <Route path={ROUTES.REFUND_CENTER} element={<Suspense fallback={<PageLoader />}><RefundCenter /></Suspense>} />
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
