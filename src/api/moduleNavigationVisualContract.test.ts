import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shellVisualTokens } from '../layouts/shellVisualTokens';

const root = process.cwd();
const moduleShell = readFileSync(join(root, 'src/shared/components/ModuleShell.tsx'), 'utf8');
const sidebar = readFileSync(join(root, 'src/layouts/Sidebar.tsx'), 'utf8');
const topHeader = readFileSync(join(root, 'src/layouts/TopHeader.tsx'), 'utf8');

assert.match(moduleShell, /data-module-tabs="primary"/, '模块主页签必须具备统一视觉标识。');
assert.match(moduleShell, /data-module-workspace="true"/, '模块标题、页签和内容必须归入统一工作台容器。');
assert.match(moduleShell, /data-module-header="true"/, '模块标题栏必须具备统一视觉标识。');
assert.match(moduleShell, /minHeight: 52/, '模块主页签应保持统一的舒展高度。');
assert.match(moduleShell, /height: 4/, '模块主页签应使用清晰的紫色短下划线。');
assert.match(moduleShell, /borderBottom: `1px solid \$\{moduleTokens\.line\}`/, '模块主页签必须保留完整底部分隔线。');
assert.match(sidebar, /shellVisualTokens as shell/, '侧边栏必须复用应用框架视觉令牌。');
assert.match(topHeader, /shellVisualTokens as shell/, '顶部栏必须复用应用框架视觉令牌。');
assert.equal(shellVisualTokens.page, '#F2F2F7');
assert.equal(shellVisualTokens.sidebar, '#FAFAFD');
assert.equal(shellVisualTokens.header, '#FCFCFE');
assert.equal(shellVisualTokens.ink, '#1F2937');
assert.equal(shellVisualTokens.violet, '#7C3AED');
