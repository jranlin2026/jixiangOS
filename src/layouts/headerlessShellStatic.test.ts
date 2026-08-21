import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appLayoutSource = readFileSync(new URL('./AppLayout.tsx', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
const aiAssistantSource = readFileSync(new URL('../pages/AIAssistant/index.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(appLayoutSource, /TopHeader/, '桌面应用框架不应再渲染全局顶部栏');
assert.match(appLayoutSource, /showMobileHeader/, '移动端必须保留打开导航的顶部区域');
assert.match(sidebarSource, /data-sidebar-account-dock="true"/, '侧栏底部必须提供统一账号中心');
assert.match(sidebarSource, /修改密码/);
assert.match(sidebarSource, /退出登录/);
assert.match(
  aiAssistantSource,
  /height:\s*\{\s*xs:\s*'calc\(100dvh - 56px\)',\s*md:\s*'100%'\s*\}/,
  'AI助手在桌面端应跟随无顶栏容器高度，移动端扣除导航栏高度',
);
