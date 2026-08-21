import assert from 'node:assert/strict';
import fs from 'node:fs';
import theme from '../theme';
import typography from '../theme/typography';

const moduleShellSource = fs.readFileSync(new URL('../shared/components/ModuleShell.tsx', import.meta.url), 'utf8');
const sidebarSource = fs.readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

assert.equal(typography.body1?.fontSize, '0.9375rem', '全局正文应使用 15px 舒适字号');
assert.equal(typography.body2?.fontSize, '0.875rem', '次级正文不应低于 14px');
assert.equal(typography.caption?.fontSize, '0.8125rem', '辅助信息应使用 13px');
assert.equal((theme.components?.MuiTableCell?.styleOverrides?.root as { fontSize?: string | number })?.fontSize, 14, '统一表格正文应使用 14px');
assert.equal((theme.components?.MuiTableCell?.styleOverrides?.head as { fontSize?: string | number })?.fontSize, 13, '统一表头应使用 13px');
assert.match(moduleShellSource, /variant="h5"[\s\S]*?fontSize:\s*\{\s*xs:\s*'1\.25rem',\s*md:\s*'1\.5rem'\s*\}/, '模块页标题在桌面端应达到 24px');
assert.equal((sidebarSource.match(/primaryTypographyProps=\{\{\s*fontSize:\s*'0\.9375rem'/g) || []).length, 2, '两类一级导航都应使用 15px');
assert.equal((sidebarSource.match(/primaryTypographyProps=\{\{\s*fontSize:\s*'0\.875rem'/g) || []).length, 1, '二级导航应使用 14px');
assert.match(sidebarSource, /height:\s*64/, '侧栏品牌区应保持 64px 稳定高度');
assert.match(sidebarSource, />AI企业运营系统<\/Typography>/, '侧栏品牌副标题应说明系统定位');
assert.match(sidebarSource, /data-sidebar-account-dock="true"/, '登录用户管理应收口到侧栏左下角');
assert.match(sidebarSource, /<NotificationBell \/>/, '消息入口应与账号中心保持在同一底部区域');

console.log('shell typography visual contract tests passed');
