import useCommissionStore from './useCommissionStore';
import useCustomerStore from './useCustomerStore';
import useDashboardStore from './useDashboardStore';
import useDeliveryStore from './useDeliveryStore';
import useFinanceStore from './useFinanceStore';
import useLeadStore from './useLeadStore';
import useOrderStore from './useOrderStore';
import useRefundStore from './useRefundStore';

export function resetSessionStores() {
  useCustomerStore.getState().reset();
  useLeadStore.getState().reset();
  useOrderStore.getState().reset();
  useDashboardStore.getState().reset();
  useDeliveryStore.getState().reset();
  useFinanceStore.getState().reset();
  useCommissionStore.getState().reset();
  useRefundStore.getState().reset();
}
