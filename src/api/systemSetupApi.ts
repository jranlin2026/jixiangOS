import { backendRequest } from './backendClient';

export type SystemInstallationState = 'UNINITIALIZED' | 'INITIALIZING' | 'ACTIVE' | 'RESETTING' | 'FAILED';

export interface SystemSetupStatus {
  state: SystemInstallationState;
  initialized: boolean;
  setupAvailable: boolean;
  setupVersion: number;
  companyName: string | null;
}

export interface SystemSetupInitializeInput {
  setupToken: string;
  companyName: string;
  adminName: string;
  adminAccount: string;
  adminEmail: string;
  adminPhone: string;
  adminPassword: string;
  organizationTemplate: 'minimal' | 'recommended';
  includeDemoData: boolean;
}

export const systemSetupApi = {
  getStatus: () => backendRequest<SystemSetupStatus>('/system/setup/status'),
  initialize: (input: SystemSetupInitializeInput) => backendRequest<SystemSetupStatus>('/system/setup/initialize', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
};
