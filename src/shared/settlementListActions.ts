export type SettlementRowActionStatus = '待处理' | '待确认' | '待发放' | '已发放' | '已撤回';

export const getSettlementRowActionVisibility = (
  status: SettlementRowActionStatus,
  sourceDeleted: boolean,
) => {
  if (sourceDeleted) {
    return {
      showAdjust: false,
      showReopen: false,
      showResetOrCleanup: true,
    };
  }

  if (status === '已撤回') {
    return {
      showAdjust: false,
      showReopen: true,
      showResetOrCleanup: false,
    };
  }

  return {
    showAdjust: true,
    showReopen: false,
    showResetOrCleanup: true,
  };
};
