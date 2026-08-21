import type { CockpitSalesBattleProfile } from '../../types/dashboard';

export type SalespersonBattleStatus = {
  code: 'normal' | 'attention' | 'intervene';
  label: '正常' | '需关注' | '需要介入';
  reason: string;
};

export function isSalesDepartmentProfile(profile: CockpitSalesBattleProfile): boolean {
  return Boolean(profile.department && profile.department.includes('销售'));
}

export function getSalespersonBattleStatus(profile: CockpitSalesBattleProfile): SalespersonBattleStatus {
  if (profile.overdueCustomerCount > 0) {
    return {
      code: 'intervene',
      label: '需要介入',
      reason: `${profile.overdueCustomerCount} 个客户下一步动作已逾期`,
    };
  }
  if (profile.riskCustomerCount > 0) {
    return {
      code: 'attention',
      label: '需关注',
      reason: `${profile.riskCustomerCount} 个风险客户待推进`,
    };
  }
  if (profile.missingNextActionCount > 0) {
    return {
      code: 'attention',
      label: '需关注',
      reason: `${profile.missingNextActionCount} 个客户缺少下一步动作`,
    };
  }
  if (profile.customerCount > 0 && profile.todayFollowUpCount === 0) {
    return {
      code: 'attention',
      label: '需关注',
      reason: '今日尚无客户跟进记录',
    };
  }
  return { code: 'normal', label: '正常', reason: '当前无逾期或风险客户' };
}

export function paginateSalesProfiles(
  profiles: CockpitSalesBattleProfile[],
  page: number,
  rowsPerPage: number,
): CockpitSalesBattleProfile[] {
  const start = Math.max(0, page) * Math.max(1, rowsPerPage);
  return profiles.slice(start, start + Math.max(1, rowsPerPage));
}
