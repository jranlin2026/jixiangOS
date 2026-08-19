import type { AssetInternetAccount } from '../../types/asset';

export const IDENTITY_ACCOUNT_PLATFORMS = ['Apple ID', 'Google账号'] as const;
export type AssetIdentityAccountPlatform = typeof IDENTITY_ACCOUNT_PLATFORMS[number];

export function normalizeIdentityAccountIds(value: unknown): string[] {
  const rows = Array.isArray(value) ? value : [];
  return Array.from(new Set(rows.map((item) => String(item || '').trim()).filter(Boolean)));
}

export function findIdentityAccountForProvider(
  source: Pick<AssetInternetAccount, 'identityAccountIds'>,
  accounts: AssetInternetAccount[],
  platform: AssetIdentityAccountPlatform,
): AssetInternetAccount | undefined {
  const ids = new Set(normalizeIdentityAccountIds(source.identityAccountIds));
  return accounts.find((account) => ids.has(account.id) && account.platform === platform);
}

function createsCycle(sourceAccountId: string, targetAccountId: string, accounts: AssetInternetAccount[]): boolean {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const visited = new Set<string>();
  const pending = [targetAccountId];
  while (pending.length) {
    const current = pending.pop()!;
    if (current === sourceAccountId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const account = byId.get(current);
    normalizeIdentityAccountIds(account?.identityAccountIds).forEach((id) => pending.push(id));
  }
  return false;
}

export function validateIdentityAccountIds(input: {
  sourceAccountId?: string;
  sourcePlatform?: string;
  identityAccountIds: unknown;
  accounts: AssetInternetAccount[];
}): string | null {
  const ids = normalizeIdentityAccountIds(input.identityAccountIds);
  const byId = new Map(input.accounts.map((account) => [account.id, account]));
  const sourceAccount = input.sourceAccountId ? byId.get(input.sourceAccountId) : undefined;
  const sourcePlatform = input.sourcePlatform || sourceAccount?.platform;
  const platformCounts = new Map<string, number>();

  if (input.sourceAccountId && ids.includes(input.sourceAccountId)) return '身份账号不能绑定自己';
  if (ids.length && IDENTITY_ACCOUNT_PLATFORMS.includes(sourcePlatform as AssetIdentityAccountPlatform)) {
    return 'Apple ID 和 Google账号是身份账号，不能再绑定其他身份账号';
  }

  for (const id of ids) {
    const target = byId.get(id);
    if (!target) return '绑定的身份账号不存在';
    if (!IDENTITY_ACCOUNT_PLATFORMS.includes(target.platform as AssetIdentityAccountPlatform)) {
      return '身份账号只能选择 Apple ID 或 Google账号';
    }
    if (sourcePlatform === target.platform) return `${target.platform}不能再绑定同类型身份账号`;
    const count = (platformCounts.get(target.platform) || 0) + 1;
    platformCounts.set(target.platform, count);
    if (count > 1) return `每个业务账号只能绑定一个 ${target.platform}`;
    if (['异常', '封禁', '已注销'].includes(target.accountStatus)) return `${target.platform}当前状态不可用`;
    const controlStatus = target.controlStatus
      || (target.permissionStatus === '离职待回收' || target.permissionStatus === '已回收' ? target.permissionStatus : '已掌控');
    if (controlStatus !== '已掌控') return `${target.platform}尚未掌控，不能新建绑定`;
    if (input.sourceAccountId && createsCycle(input.sourceAccountId, id, input.accounts)) return '身份账号之间不能形成循环绑定';
  }
  return null;
}
