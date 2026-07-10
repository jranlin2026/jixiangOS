import assert from 'node:assert/strict';

type AppShellStateModule = typeof import('../layouts/appShellState');

let shellState: AppShellStateModule;
try {
  shellState = await import('../layouts/appShellState');
} catch {
  assert.fail('The responsive shell requires executable presentation and navigation state logic.');
}

const initialMobile = shellState.getAppShellPresentation(false, false);
assert.deepEqual(initialMobile, {
  drawerVariant: 'temporary',
  drawerOpen: false,
  showMobileHeader: true,
  sidebarLayoutWidth: 0,
});

const openedNavigation = shellState.mobileNavigationReducer(false, { type: 'OPEN' });
assert.equal(openedNavigation, true, 'The mobile menu button must open navigation.');
assert.equal(
  shellState.mobileNavigationReducer(openedNavigation, { type: 'CLOSE' }),
  false,
  'The Drawer close callback used by backdrop and Escape must close navigation.',
);
assert.equal(
  shellState.mobileNavigationReducer(openedNavigation, { type: 'NAVIGATE' }),
  false,
  'Completing navigation must close the mobile drawer.',
);

const desktop = shellState.getAppShellPresentation(true, false);
assert.deepEqual(desktop, {
  drawerVariant: 'permanent',
  drawerOpen: true,
  showMobileHeader: false,
  sidebarLayoutWidth: 240,
});

assert.deepEqual(shellState.APP_SHELL_VIEWPORT_SX, {
  display: 'flex',
  width: '100%',
  maxWidth: '100vw',
  height: '100dvh',
  overflow: 'hidden',
  bgcolor: '#F6F8FB',
});
assert.deepEqual(shellState.APP_SHELL_MAIN_SX, {
  flexGrow: 1,
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  overflowX: 'hidden',
  overflowY: 'auto',
  bgcolor: '#F6F8FB',
});
