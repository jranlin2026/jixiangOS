import type { User } from '../../types/settings';
import { getCurrentOperatorUser } from './currentOperator';

export function getCurrentLeadInputUser(): User | null {
  return getCurrentOperatorUser();
}

export function getCurrentLeadInputName(fallback = ''): string {
  const currentUser = getCurrentLeadInputUser();
  return String(currentUser?.name || currentUser?.account || fallback || '').trim();
}

export function applyCurrentLeadInputBy<T extends Record<string, unknown>, K extends keyof T>(
  payload: T,
  field: K,
): T {
  const currentUserName = getCurrentLeadInputName(String(payload[field] || ''));
  if (!currentUserName) return payload;
  return {
    ...payload,
    [field]: currentUserName,
  };
}
