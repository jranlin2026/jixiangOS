export const DEFAULT_USER_ROLE = '销售顾问';

export const LEGACY_ROLE_NAME_MAP: Record<string, string> = {
  管理员: '超级管理员',
  销售: '销售顾问',
  运营: '运营专员',
  财务: '财务专员',
};

export function normalizeUserRoleName(role?: string): string {
  const trimmed = String(role || '').trim();
  return LEGACY_ROLE_NAME_MAP[trimmed] || trimmed || DEFAULT_USER_ROLE;
}

export function isSalesRoleName(role?: string): boolean {
  const normalized = normalizeUserRoleName(role);
  return normalized === '销售顾问' || normalized === '销售经理';
}
