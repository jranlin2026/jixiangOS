import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import { ROUTES } from '../utils/constants';

/**
 * 快捷导航 Hook
 */
export function useNavigation() {
  const navigate = useNavigate();

  const goToHome = useCallback(() => navigate(ROUTES.HOME), [navigate]);
  const goToDashboard = useCallback(() => navigate(ROUTES.DASHBOARD), [navigate]);
  const goToLeads = useCallback(() => navigate(ROUTES.LEADS), [navigate]);
  const goToCustomers = useCallback(() => navigate(ROUTES.CUSTOMERS), [navigate]);
  const goToOrders = useCallback(() => navigate(ROUTES.ORDERS), [navigate]);
  const goToDelivery = useCallback(() => navigate(ROUTES.DELIVERY), [navigate]);
  const goToCommission = useCallback(() => navigate(`${ROUTES.FINANCE}?tab=settlement`), [navigate]);
  const goToFinance = useCallback(() => navigate(ROUTES.FINANCE), [navigate]);
  const goToAIAssistant = useCallback(() => navigate(ROUTES.AI_ASSISTANT), [navigate]);
  const goToSettings = useCallback(() => navigate(ROUTES.SETTINGS), [navigate]);

  return {
    goToHome,
    goToDashboard,
    goToLeads,
    goToCustomers,
    goToOrders,
    goToDelivery,
    goToCommission,
    goToFinance,
    goToAIAssistant,
    goToSettings,
  };
}

export default useNavigation;
