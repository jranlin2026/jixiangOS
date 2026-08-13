import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
const sidebar = readFileSync(join(root, 'src/layouts/Sidebar.tsx'), 'utf8');
const constants = readFileSync(join(root, 'src/shared/utils/constants.ts'), 'utf8');
const server = readFileSync(join(root, 'server/index.ts'), 'utf8');

assert.match(constants, /OKR:\s*['"]\/okr['"]/, '目标管理必须拥有稳定的 /okr 路由常量');
assert.match(app, /import\(['"]\.\/pages\/Okr['"]\)/, '目标管理页面必须按现有模块方式懒加载');
assert.match(
  app,
  /<ProtectedRoute permissionKeys=\{\[\.\.\.OKR_ACCESS_PERMISSION_KEYS\]\}[\s\S]*?<Route path=\{ROUTES\.OKR\}/,
  '目标管理直达路由必须使用完整的 OKR 访问权限集合保护',
);
const sidebarBlock = sidebar.match(/\{\s*label: '目标管理',[\s\S]*?\n\s*\},/)?.[0] || '';
assert.ok(sidebarBlock, '侧栏必须显示目标管理入口');
assert.match(sidebarBlock, /permissionKeys:\s*\[\.\.\.OKR_ACCESS_PERMISSION_KEYS\]/, '侧栏与路由必须复用同一权限集合');
assert.doesNotMatch(sidebarBlock, /publicForAuthenticated:\s*true/, '目标管理不得绕过角色权限');
assert.match(server, /app\.use\(['"]\/api\/okr['"],\s*createOkrRouter\(/, '服务端必须注册 /api/okr 路由');

console.log('okr module wiring tests passed');
