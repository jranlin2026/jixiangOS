import type { DeliveryAssignmentConfig, DeliveryAssignmentConfigView } from '../types/deliveryAssignment';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { backendRequest, shouldUseBackendApi } from './backendClient';
import { createSuccessResponse, type ApiResponse } from './types';

const empty: DeliveryAssignmentConfigView = { enabled: false, participants: [], participantViews: [] };

async function getConfig(): Promise<ApiResponse<DeliveryAssignmentConfigView>> {
  if (shouldUseBackendApi()) return backendRequest('/settings/delivery-assignment');
  const stored = localStorage.getItem(STORAGE_KEYS.DELIVERY_ASSIGNMENT_CONFIG);
  const config = stored ? JSON.parse(stored) as DeliveryAssignmentConfig : empty;
  return createSuccessResponse({ ...config, participantViews: [] });
}

async function saveConfig(config: DeliveryAssignmentConfig): Promise<ApiResponse<DeliveryAssignmentConfigView>> {
  if (shouldUseBackendApi()) {
    return backendRequest('/settings/delivery-assignment', { method: 'PUT', body: JSON.stringify(config) });
  }
  localStorage.setItem(STORAGE_KEYS.DELIVERY_ASSIGNMENT_CONFIG, JSON.stringify(config));
  return createSuccessResponse({ ...config, participantViews: [] });
}

export const deliveryAssignmentApi = { getConfig, saveConfig };
