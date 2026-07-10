import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appLayout = readFileSync(join(process.cwd(), 'src/layouts/AppLayout.tsx'), 'utf8');
const sidebar = readFileSync(join(process.cwd(), 'src/layouts/Sidebar.tsx'), 'utf8');

assert.match(
  appLayout,
  /useMediaQuery\(theme\.breakpoints\.up\('md'\)\)/,
  'AppLayout must switch the navigation shell at the md breakpoint.',
);
assert.match(
  appLayout,
  /aria-label="打开导航菜单"/,
  'The mobile shell must expose a uniquely labelled navigation menu button.',
);
assert.match(
  appLayout,
  /position:\s*'sticky'/,
  'The mobile product header must remain available while the page scrolls.',
);
assert.match(
  appLayout,
  /variant=\{isDesktop\s*\?\s*'permanent'\s*:\s*'temporary'\}/,
  'The sidebar must be permanent on desktop and temporary on mobile.',
);
assert.match(
  appLayout,
  /<Sidebar[\s\S]*onClose=\{handleCloseNavigation\}[\s\S]*onNavigate=\{handleCloseNavigation\}/,
  'The mobile drawer must close through Drawer events and after navigation.',
);
assert.match(
  appLayout,
  /component="main"[\s\S]*minWidth:\s*0/,
  'The main content must be allowed to shrink without overflowing the viewport.',
);
assert.match(
  sidebar,
  /ModalProps=\{\{\s*keepMounted:\s*true\s*\}\}/,
  'The temporary drawer must stay mounted for responsive interaction and focus continuity.',
);
assert.match(
  sidebar,
  /onClick=\{\(\) => \{\s*navigate\(child\.path\);\s*onNavigate\?\.\(\);\s*\}\}/,
  'Selecting a nested navigation item must close the temporary drawer.',
);
