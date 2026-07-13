import { backendRequest } from './backendClient';
import type { ApiResponse } from './types';
import type { CustomerTag, CustomerTagCatalog, CustomerTagGroup, CustomerTagMigrationPreview } from '../types/tag';

const base = '/customer-tags';
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export function fetchCustomerTagCatalog(scope: 'lead' | 'customer' | 'all', includeInactive = false): Promise<ApiResponse<CustomerTagCatalog>> {
  return backendRequest(`${base}/catalog?scope=${scope}&includeInactive=${includeInactive}`);
}
export function previewCustomerTagMigration(): Promise<ApiResponse<CustomerTagMigrationPreview>> { return backendRequest(`${base}/migration/preview`); }
export function applyCustomerTagMigration(checksum: string): Promise<ApiResponse<{ updatedCustomers: number; updatedLeads: number; createdTags: number; checksum: string }>> { return backendRequest(`${base}/migration/apply`, json('POST', { checksum })); }
export function createCustomerTagGroup(input: Partial<CustomerTagGroup>): Promise<ApiResponse<CustomerTagGroup>> { return backendRequest(`${base}/groups`, json('POST', input)); }
export function updateCustomerTagGroup(id: string, input: Partial<CustomerTagGroup>): Promise<ApiResponse<CustomerTagGroup>> { return backendRequest(`${base}/groups/${encodeURIComponent(id)}`, json('PUT', input)); }
export function createCustomerTag(input: Partial<CustomerTag>): Promise<ApiResponse<CustomerTag>> { return backendRequest(base, json('POST', input)); }
export function updateCustomerTag(id: string, input: Partial<CustomerTag>): Promise<ApiResponse<CustomerTag>> { return backendRequest(`${base}/${encodeURIComponent(id)}`, json('PUT', input)); }
export function deleteCustomerTag(id: string): Promise<ApiResponse<{ id: string }>> { return backendRequest(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
export function deleteCustomerTagGroup(id: string): Promise<ApiResponse<{ id: string }>> { return backendRequest(`${base}/groups/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
export function mergeCustomerTag(sourceTagId: string, targetTagId: string): Promise<ApiResponse<unknown>> { return backendRequest(`${base}/${encodeURIComponent(sourceTagId)}/merge`, json('POST', { targetId: targetTagId })); }
export function mergeCustomerTagGroup(sourceGroupId: string, targetGroupId: string): Promise<ApiResponse<unknown>> { return backendRequest(`${base}/groups/${encodeURIComponent(sourceGroupId)}/merge`, json('POST', { targetId: targetGroupId })); }
export function reorderCustomerTags(groupId: string, tagIds: string[]): Promise<ApiResponse<CustomerTag[]>> { return backendRequest(`${base}/groups/${encodeURIComponent(groupId)}/reorder`, json('POST', { tagIds })); }
