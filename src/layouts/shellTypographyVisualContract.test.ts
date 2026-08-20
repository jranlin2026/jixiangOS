import assert from 'node:assert/strict';
import fs from 'node:fs';
import theme from '../theme';
import typography from '../theme/typography';

const moduleShellSource = fs.readFileSync(new URL('../shared/components/ModuleShell.tsx', import.meta.url), 'utf8');
const sidebarSource = fs.readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
const topHeaderSource = fs.readFileSync(new URL('./TopHeader.tsx', import.meta.url), 'utf8');

assert.equal(typography.body1?.fontSize, '0.9375rem', '全局正文应使用 15px 舒适字号');
assert.equal(typography.body2?.fontSize, '0.875rem', '次级正文不应低于 14px');
assert.equal(typography.caption?.fontSize, '0.8125rem', '辅助信息应使用 13px');
assert.equal((theme.components?.MuiTableCell?.styleOverrides?.root as { fontSize?: string })?.fontSize, '0.875rem', '统一表格正文应使用 14px');
assert.equal((theme.components?.MuiTableCell?.styleOverrides?.head as { fontSize?: string })?.fontSize, '0.8125rem', '统一表头应使用 13px');
assert.match(moduleShellSource, /variant="h5"[\s\S]*?fontSize:\s*\{\s*xs:\s*'1\.25rem',\s*md:\s*'1\.5rem'\s*\}/, '模块页标题在桌面端应达到 24px');
assert.equal((sidebarSource.match(/primaryTypographyProps=\{\{\s*fontSize:\s*'0\.9375rem'/g) || []).length, 2, '两类一级导航都应使用 15px');
assert.equal((sidebarSource.match(/primaryTypographyProps=\{\{\s*fontSize:\s*'0\.875rem'/g) || []).length, 1, '二级导航应使用 14px');
assert.match(sidebarSource, /height:\s*64/, '侧栏品牌区应与桌面顶栏保持 64px 对齐');

assert.doesNotMatch(topHeaderSource, /全局搜索|帮助中心/, '未接通的全局搜索和帮助中心不应占用顶栏');
assert.doesNotMatch(topHeaderSource, /SearchIcon|HelpOutlineIcon|KeyboardCommandKeyIcon/, '顶栏不应保留无效入口的图标代码');
assert.match(topHeaderSource, /minHeight:\s*64/, '精简后的桌面顶栏高度应为 64px');

console.log('shell typography visual contract tests passed');
