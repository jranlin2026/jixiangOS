import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import { ROUTES } from '../utils/constants';

/**
 * 快捷导航 Hook
 */
export function useNavigation() {
  const navigate = useNavigate();

  const goToHome = useCallback(() => navigate(ROUTES.HOME), [navigate]);
  const goToLeads = useCallback(() => navigate(ROUTES.LEADS), [navigate]);
  const goToCustomers = useCallback(() => navigate(ROUTES.CUSTOMERS), [navigate]);
  const goToOrders = useCallback(() => navigate(ROUTES.ORDERS), [navigate]);
  const goToDelivery = useCallback(() => navigate(ROUTES.DELIVERY), [navigate]);
  const goToCommission = useCallback(() => navigate(ROUTES.COMMISSION), [navigate]);
  const goToFinance = useCallback(() => navigate(ROUTES.FINANCE), [navigate]);
  const goToUpgradeAnalysis = useCallback(() => navigate(ROUTES.UPGRADE_ANALYSIS), [navigate]);
  const goToAIAssistant = useCallback(() => navigate(ROUTES.AI_ASSISTANT), [navigate]);
  const goToSettings = useCallback(() => navigate(ROUTES.SETTINGS), [navigate]);

  return {
    goToHome,
    goToLeads,
    goToCustomers,
    goToOrders,
    goToDelivery,
    goToCommission,
    goToFinance,
    goToUpgradeAnalysis,
    goToAIAssistant,
    goToSettings,
  };
}

export default useNavigation;
