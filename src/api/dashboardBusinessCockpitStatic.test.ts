import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync('src/api/dashboardApi.ts', 'utf8');
const server = readFileSync('server/index.ts', 'utf8');
const route = readFileSync('server/routes/businessCockpitRoutes.ts', 'utf8');
const service = readFileSync('server/services/businessCockpitService.ts', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const constants = readFileSync('src/shared/utils/constants.ts', 'utf8');
const page = readFileSync('src/pages/Dashboard/BusinessCockpit.tsx', 'utf8');
const salesPage = readFileSync('src/pages/SalesManagement/SalesBattlefield.tsx', 'utf8');
const salesTable = readFileSync('src/pages/SalesManagement/components/SalesBattleTable.tsx', 'utf8');

assert.match(
  api,
  /backendRequest<BusinessCockpitData>\(`\/dashboard\/business-cockpit\?\$\{query\.toString\(\)\}`\)/,
  '经营驾驶舱必须读取服务端全量聚合接口',
);
assert.doesNotMatch(
  api.slice(api.indexOf('async function fetchBusinessCockpit')),
  /readArray<(Lead|Customer|Order|RecoveryOrder|Commission)>/,
  '经营驾驶舱不得再用浏览器分页缓存聚合经营数据',
);
assert.match(route, /router\.get\('\/business-cockpit'/);
assert.match(server, /app\.use\('\/api\/dashboard', createBusinessCockpitRouter/);
assert.match(server, /requireDashboardAccess/);

assert.match(page, /极享智控/);
assert.match(page, /AI晨报/);
assert.match(page, /组织 · 部门矩阵/);
assert.match(page, /公司业绩目标/);
assert.match(page, /本月完成/);
assert.match(page, /月目标/);
assert.match(page, /目标差额/);
assert.match(page, /ROUTES\.SALES_MANAGEMENT/);
assert.match(page, /if \(loading && !data\)/, '非首次刷新时应保留已有页面，不能整页闪成加载器');
assert.match(page, /latestRequestId = useRef\(0\)/, '经营查询必须防止慢响应覆盖新数据');
assert.match(page, /timeZone: 'Asia\/Shanghai'/, '经营日期和更新时间必须统一使用上海时区');
assert.match(page, /重新加载/);
assert.doesNotMatch(page, /<Tabs/);
assert.doesNotMatch(page, /TODAY COMMAND/);
assert.doesNotMatch(page, /<AreaChart/);

assert.match(constants, /SALES_MANAGEMENT: '\/management\/sales'/);
assert.match(app, /const SalesBattlefield = React\.lazy/);
assert.match(app, /path=\{ROUTES\.SALES_MANAGEMENT\}/);
assert.match(salesPage, /销售部经营战情/);
assert.match(salesPage, /今日暂无已完成客户动作/);
assert.match(salesPage, /SalesBattleTable/);
assert.match(salesTable, /DataTableWorkspace/);
assert.match(salesTable, /DataTableWorkspaceFooter/);
assert.match(salesTable, /TablePagination/);
assert.match(salesTable, /月目标/);
assert.match(salesTable, /已完成/);
assert.match(salesTable, /今日已完成动作/);
assert.match(salesTable, /风险客户/);
assert.match(salesTable, /需要介入/);
assert.match(salesTable, /未配置/);

assert.match(service, /FORMAL_ORDER_PAID_AMOUNT/);
assert.match(service, /managementPerformance/);
assert.match(service, /departmentStatuses/);
assert.match(service, /monthlyTargetAmount/);
assert.match(service, /targetCompletionRate/);
assert.match(server, /includeOrderDetails: isSuperAdmin\(req\.currentUser\)/,
  '缺流水订单的客户和付款证据必须继续由服务端限制为超级管理员');

console.log('dashboard business cockpit static tests passed');
