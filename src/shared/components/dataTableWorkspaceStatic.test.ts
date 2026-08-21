import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const workspace = read('src/shared/components/DataTableWorkspace.tsx');
const pagination = read('src/shared/components/TablePagination.tsx');
const globalStyles = read('src/index.css');
const orders = read('src/pages/Orders/index.tsx');
const orderReview = read('src/pages/OrderReview/index.tsx');
const assets = read('src/pages/Assets/index.tsx');
const delivery = read('src/pages/Delivery/index.tsx');
const recoveryOrders = read('src/pages/AfterSales/RecoveryOrderTab.tsx');
const standards = read('src/shared/components/dataTableStandards.ts');

assert.match(workspace, /data-table-workspace="true"/);
assert.match(workspace, /\.\.\.dataTableStandardSx/);
assert.match(workspace, /DataTableEmptyState/);
assert.match(standards, /link: '#1E6BFF'/);
assert.match(standards, /headerHeight: 44/);
assert.match(standards, /rowHeight: 52/);
assert.match(workspace, /data-table-scroll-area="desktop"/);
assert.match(workspace, /overflow:\s*'auto'/);
assert.match(workspace, /scrollbarGutter:\s*'stable'/);
assert.match(workspace, /&::\-webkit\-scrollbar-thumb/);
assert.match(workspace, /data-table-scroll-hint="true"/);
assert.match(workspace, /tabIndex=\{0\}/);
assert.match(workspace, /aria-label="数据表格，可上下左右滚动"/);
assert.ok(
  workspace.lastIndexOf("overflow: 'auto'") > workspace.indexOf('...sx'),
  '桌面滚动器的 overflow:auto 必须覆盖页面级表格样式，避免被 overflow:hidden 关闭',
);
assert.match(workspace, /data-table-workspace-footer="true"/);
assert.match(workspace, /getDataTablePinnedColumnSx/);
assert.match(
  workspace,
  /export const dataTableStandardSx[\s\S]*& \.MuiTableCell-root[\s\S]*& \.MuiCheckbox-root/,
  '统一数据工作区必须提供表格密度与选择框尺寸标准',
);
assert.match(workspace, /flexShrink:\s*0/);
assert.match(workspace, /display:\s*\{ xs: 'none', md: 'block' \}/);
assert.ok(
  workspace.lastIndexOf("display: { xs: 'none', md: 'block' }") > workspace.indexOf('...sx'),
  '桌面滚动器的移动端隐藏规则必须覆盖页面级 sx',
);
assert.match(pagination, /useMediaQuery\(theme\.breakpoints\.down\('sm'\)\)/);
assert.match(globalStyles, /@media \(max-width: 600px\)[\s\S]*\.JxTablePagination[\s\S]*grid-template-columns/);
assert.match(
  orders,
  /<ModulePage workspace=\{activeTab === 'list' \|\| activeTab === 'review'\}>/,
  '订单列表和订单审核台都必须启用固定高度数据工作区',
);
assert.match(
  orderReview,
  /embedded \? \{ pt: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' \}/,
  '嵌入订单页签时，订单审核台必须把剩余高度传给内部数据工作区',
);
assert.match(assets, /getDataTableMinWidth/);
assert.match(assets, /DataTableEmptyState label="暂无设备资产数据"/);
assert.doesNotMatch(assets, /renderAssetEmptyRow/);
assert.doesNotMatch(
  delivery,
  /<Typography[^>]*>\{renderCell\(delivery,/,
  '移动端交付卡片不应使用 p 标签包装可能返回 div 的单元格内容',
);
assert.doesNotMatch(
  recoveryOrders,
  /<Typography[^>]*>\{renderCell\(row,/,
  '移动端售后卡片不应使用 p 标签包装可能返回 Typography 或 div 的单元格内容',
);
assert.match(
  orders,
  /<Table stickyHeader sx=\{\[dataTableStandardSx,/,
  '订单列表必须复用统一表格密度标准',
);
assert.match(
  orderReview,
  /<Table stickyHeader sx=\{\[dataTableStandardSx,/,
  '订单审核台必须复用订单列表相同的表格密度标准',
);

[
  'src/pages/Customers/index.tsx',
  'src/pages/Leads/index.tsx',
  'src/pages/Orders/index.tsx',
  'src/pages/Delivery/index.tsx',
  'src/pages/OrderReview/index.tsx',
  'src/pages/Leads/LeadIntakeTab.tsx',
  'src/pages/RefundCenter/index.tsx',
  'src/pages/RefundCenter/ServiceTicketTab.tsx',
  'src/pages/Finance/index.tsx',
  'src/pages/Finance/RecoverySettlement.tsx',
  'src/pages/Commission/index.tsx',
  'src/pages/AfterSales/RecoveryOrderTab.tsx',
  'src/pages/Assets/index.tsx',
].forEach((path) => {
  const source = read(path);
  assert.match(source, /DataTableWorkspace/, `${path} 未接入统一数据工作区`);
  assert.match(source, /<Table[^>]*stickyHeader/, `${path} 的主列表未启用固定表头`);
  assert.match(source, /DataTableWorkspaceFooter/, `${path} 的分页未固定在工作区底部`);
});

[
  'src/pages/Customers/index.tsx',
  'src/pages/Leads/index.tsx',
  'src/pages/Orders/index.tsx',
  'src/pages/Delivery/index.tsx',
  'src/pages/OrderReview/index.tsx',
  'src/pages/Leads/LeadIntakeTab.tsx',
  'src/pages/RefundCenter/index.tsx',
  'src/pages/RefundCenter/ServiceTicketTab.tsx',
  'src/pages/Finance/index.tsx',
  'src/pages/Finance/RecoverySettlement.tsx',
  'src/pages/Commission/index.tsx',
  'src/pages/AfterSales/RecoveryOrderTab.tsx',
  'src/pages/Assets/index.tsx',
].forEach((path) => {
  assert.match(read(path), /DataTableMobileScroller/, `${path} 未提供与桌面同源分页的移动卡片区`);
});

[
  'src/pages/Leads/index.tsx',
  'src/pages/Orders/index.tsx',
  'src/pages/Leads/LeadIntakeTab.tsx',
].forEach((path) => {
  const source = read(path);
  assert.match(source, /DataTableWorkspace[^>]*sx=\{\{[^}]*border:\s*0[^}]*borderRadius:\s*0[^}]*boxShadow:\s*'none'/s, `${path} 仍保留旧的嵌套圆角工作区`);
  assert.match(source, /DataTableDesktopScroller sx=\{moduleListTablePaperSx\}/, `${path} 扁平化后表格自身缺少标准边框`);
});
