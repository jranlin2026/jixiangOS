/**
 * 线索与客户详情共用的弹窗布局参数。
 * 详情入口必须保持同宽，避免用户在 CRM 两个模块间切换时产生视觉跳动。
 */
export const CRM_DETAIL_DIALOG_PAPER_SX = {
  width: { xs: 'calc(100vw - 24px)', md: 'calc(100vw - 64px)' },
  maxWidth: 1320,
  height: { xs: 'calc(100dvh - 24px)', lg: 'min(820px, calc(100dvh - 64px))' },
  maxHeight: 'calc(100dvh - 24px)',
  borderRadius: 2,
  overflow: 'hidden',
} as const;

export const CRM_DETAIL_CONTENT_SX = {
  bgcolor: '#f8fafc',
  p: { xs: 1.5, sm: 2 },
  overflow: { xs: 'auto', lg: 'hidden' },
  '&.MuiDialogContent-dividers': { borderBottom: 0 },
} as const;

export const CRM_DETAIL_GRID_COLUMNS = {
  xs: '1fr',
  lg: '430px minmax(0, 1fr)',
  xl: '460px minmax(0, 1fr)',
} as const;

export const CRM_DETAIL_FIELD_COLUMNS = {
  xs: '108px minmax(0, 1fr)',
  sm: '124px minmax(0, 1fr)',
} as const;
