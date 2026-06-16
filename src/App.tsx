import React, { Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import { CircularProgress, Box } from '@mui/material';
import { ROUTES } from './shared/utils/constants';
import { initializeMockData } from './api';

const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Leads = React.lazy(() => import('./pages/Leads'));
const Customers = React.lazy(() => import('./pages/Customers'));
const Orders = React.lazy(() => import('./pages/Orders'));
const Delivery = React.lazy(() => import('./pages/Delivery'));
const Commission = React.lazy(() => import('./pages/Commission'));
const Finance = React.lazy(() => import('./pages/Finance'));
const UpgradeAnalysis = React.lazy(() => import('./pages/UpgradeAnalysis'));
const AIAssistant = React.lazy(() => import('./pages/AIAssistant'));
const Settings = React.lazy(() => import('./pages/Settings'));
const RefundCenter = React.lazy(() => import('./pages/RefundCenter'));
const UpgradePool = React.lazy(() => import('./pages/UpgradePool'));

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
  useEffect(() => {
    initializeMockData();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route
          index
          element={
            <Suspense fallback={<PageLoader />}>
              <Dashboard />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.LEADS}
          element={
            <Suspense fallback={<PageLoader />}>
              <Leads />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.CUSTOMERS}
          element={
            <Suspense fallback={<PageLoader />}>
              <Customers />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.ORDERS}
          element={
            <Suspense fallback={<PageLoader />}>
              <Orders />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.DELIVERY}
          element={
            <Suspense fallback={<PageLoader />}>
              <Delivery />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.COMMISSION}
          element={
            <Suspense fallback={<PageLoader />}>
              <Commission />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.FINANCE}
          element={
            <Suspense fallback={<PageLoader />}>
              <Finance />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.UPGRADE_ANALYSIS}
          element={
            <Suspense fallback={<PageLoader />}>
              <UpgradeAnalysis />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.AI_ASSISTANT}
          element={
            <Suspense fallback={<PageLoader />}>
              <AIAssistant />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.SETTINGS}
          element={
            <Suspense fallback={<PageLoader />}>
              <Settings />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.REFUND_CENTER}
          element={
            <Suspense fallback={<PageLoader />}>
              <RefundCenter />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.UPGRADE_POOL}
          element={
            <Suspense fallback={<PageLoader />}>
              <UpgradePool />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

export default App;
