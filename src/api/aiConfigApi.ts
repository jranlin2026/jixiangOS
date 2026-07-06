import type { AiConnectionTestResult, AiProviderConfig, AiProviderConfigInput } from '../types/aiConfig';
import type { ApiResponse } from './types';
import { backendRequest } from './backendClient';

async function getConfig(): Promise<ApiResponse<AiProviderConfig>> {
  return backendRequest<AiProviderConfig>('/ai/config');
}

async function saveConfig(input: AiProviderConfigInput): Promise<ApiResponse<AiProviderConfig>> {
  return backendRequest<AiProviderConfig>('/ai/config', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

async function testConnection(): Promise<ApiResponse<AiConnectionTestResult>> {
  return backendRequest<AiConnectionTestResult>('/ai/config/test', {
    method: 'POST',
  });
}

export const aiConfigApi = {
  getConfig,
  saveConfig,
  testConnection,
};
