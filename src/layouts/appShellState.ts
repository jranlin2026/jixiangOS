export const APP_SIDEBAR_WIDTH = 240;

export const APP_SHELL_VIEWPORT_SX = {
  display: 'flex',
  width: '100%',
  maxWidth: '100vw',
  height: '100dvh',
  overflow: 'hidden',
  bgcolor: '#F6F8FB',
} as const;

export const APP_SHELL_MAIN_SX = {
  flexGrow: 1,
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  overflowX: 'hidden',
  overflowY: 'auto',
  bgcolor: '#F6F8FB',
} as const;

export type MobileNavigationAction = { type: 'OPEN' | 'CLOSE' | 'NAVIGATE' };

export const mobileNavigationReducer = (_isOpen: boolean, action: MobileNavigationAction): boolean => (
  action.type === 'OPEN'
);

export const getAppShellPresentation = (isDesktop: boolean, navigationOpen: boolean) => ({
  drawerVariant: isDesktop ? 'permanent' as const : 'temporary' as const,
  drawerOpen: isDesktop || navigationOpen,
  showMobileHeader: !isDesktop,
  sidebarLayoutWidth: isDesktop ? APP_SIDEBAR_WIDTH : 0,
});
