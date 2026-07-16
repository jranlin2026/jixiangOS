import type { BusinessAttachment, BusinessAttachmentCategory } from '../types/businessAttachment';
import type { ApiResponse } from './types';
import { backendRequest, getBackendBaseUrl, readBackendToken } from './backendClient';

function authHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  const token = readBackendToken();
  if (token) result.set('Authorization', `Bearer ${token}`);
  return result;
}

async function upload(
  file: File,
  options: { draftKey: string; category: BusinessAttachmentCategory },
): Promise<ApiResponse<BusinessAttachment>> {
  const response = await fetch(`${getBackendBaseUrl()}/business-attachments`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': file.type || 'application/octet-stream',
      'X-Draft-Key': options.draftKey,
      'X-Attachment-Category': options.category,
      'X-File-Name': encodeURIComponent(file.name),
    }),
    body: file,
  });
  const result = await response.json().catch(() => null) as ApiResponse<BusinessAttachment> | null;
  return result || { code: response.status || -1, data: null as unknown as BusinessAttachment, message: '附件上传失败' };
}

async function remove(id: string): Promise<ApiResponse<boolean>> {
  return backendRequest<boolean>(`/business-attachments/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

async function fetchBlob(id: string, download = false): Promise<Blob> {
  const response = await fetch(
    `${getBackendBaseUrl()}/business-attachments/${encodeURIComponent(id)}${download ? '?download=1' : ''}`,
    { headers: authHeaders() },
  );
  if (!response.ok) throw new Error((await response.text()) || '附件读取失败');
  return response.blob();
}

export const businessAttachmentApi = { upload, remove, fetchBlob };
