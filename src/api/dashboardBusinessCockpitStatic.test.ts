import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync('src/api/dashboardApi.ts', 'utf8');
const server = readFileSync('server/index.ts', 'utf8');
const route = readFileSync('server/routes/businessCockpitRoutes.ts', 'utf8');
const page = readFileSync('src/pages/Dashboard/BusinessCockpit.tsx', 'utf8');
const enterprisePanel = readFileSync('src/pages/Dashboard/EnterpriseBrainPanel.tsx', 'utf8');
const financePage = readFileSync('src/pages/Finance/index.tsx', 'utf8');

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
assert.match(page, /正式订单与售后挽回双轨/);
assert.match(page, /<AreaChart[^>]*data=\{chartData\}/);
assert.match(page, /previousFormalReceiptAmount/, '趋势图必须可与上期同期直接对比');
assert.match(page, /height=\{270\}/);
assert.match(page, /销售业绩排行/);
assert.match(page, /挽回业绩排行/);
assert.match(page, /客户增长漏斗/);
assert.match(page, /资金与订单健康/);
assert.match(page, /期间经营结果/, '老板第一屏必须先展示期间经营结果');
assert.match(page, /老板今日重点/, '当前存量风险必须与期间指标分开展示');
assert.match(page, /组织执行/, '岗位、任务、OKR和交付应归入组织执行区');
assert.match(page, /重新加载/);
assert.match(page, /timeZone: 'Asia\/Shanghai'/, '驾驶舱日期和更新时间必须统一使用上海时区');
assert.match(page, /validateCustomRange/, '自定义统计周期必须先做前端校验');
assert.match(page, /rangeError/, '日期错误必须在筛选区提示，不能替换成整页加载失败');
assert.match(page, /resolveDashboardDateRange\(preset\)/, '今日、本周、本月必须解析为统一的实际日期范围');
assert.match(page, /setRange\(nextRange\);\s*fetchData\(nextRange\);/, '应用自定义日期时筛选状态与请求口径必须同步');
assert.match(page, /value=\{draftRange\.startDate/, '自定义日期输入必须使用独立草稿，不能提前改变已应用周期');
assert.match(page, /<EnterpriseBrainPanel dateFrom=\{range\.startDate/, '组织执行必须只读取已应用周期');
assert.ok(
  page.indexOf('<ExecutiveOverview') < page.indexOf('<EnterpriseBrainPanel'),
  '老板应先看经营结果，再看组织执行',
);
assert.match(page, /if \(loading && !data\)/, '非首次切换周期时应保留已有驾驶舱，不能整页闪成加载器');
assert.match(page, /latestRequestId = useRef\(0\)/, '周期查询必须记录最新请求，避免慢响应覆盖新筛选结果');
assert.match(page, /requestId !== latestRequestId\.current/, '过期驾驶舱响应不得更新当前页面');
assert.match(enterprisePanel, /latestRequestId = useRef\(0\)/, '组织执行查询也必须防止旧周期响应覆盖新周期');
assert.match(enterprisePanel, /\.catch\(/, '组织执行请求失败必须收敛为页面错误状态');
assert.match(page, /ROUTES\.ORDERS/, '正式订单经营指标必须支持下钻');
assert.match(page, /ROUTES\.AFTER_SALES/, '售后挽回经营指标必须支持下钻');
assert.match(page, /ROUTES\.CUSTOMERS/, '客户健康指标必须支持下钻');
assert.match(page, /canAccessCockpitPath/, '驾驶舱下钻必须先判断目标页面权限');
assert.match(page, /buildCockpitDrilldownPath/, '经营指标下钻必须保留当前已应用日期范围');
assert.match(page, /secondaryRisks[\s\S]*slice\(0, 4\)/, '老板重点含最高风险后总数应限制为五项');
assert.match(page, /alignComparableTrend/, '上期趋势必须按周期内相对日对齐，不得用稀疏数组下标硬拼');
assert.match(page, /pathname === ROUTES\.ORDER_REVIEW/, '订单审核风险下钻必须校验审核列表权限');
assert.match(page, /tab === 'flow'[\s\S]*PERMISSION_KEYS\.FINANCE_FLOW/, '收支流水风险下钻必须校验收支流水页签权限');
assert.match(page, /tab === 'settlement'[\s\S]*PERMISSION_KEYS\.FINANCE_SETTLEMENT/, '订单分账风险下钻必须校验订单分账页签权限');
assert.match(page, /本期待处理提成/, '规则未解决的提成必须在本期财务健康中可见');
assert.match(page, /线索转客/, '客户转化指标必须使用业务事件口径，不能把批量导入当新客');
assert.match(page, /实付与流水差异/, '驾驶舱必须暴露订单实付与资金流水的对账差异');
assert.match(financePage, /searchParams\.get\('orderIds'\)/, '从驾驶舱下钻对账异常时必须按订单查看完整资金链');
assert.match(financePage, /完整资金链（含原实收与冲正）/, '对账下钻必须明示全链路口径');
assert.match(financePage, /付款证据需核对的异常订单/, '部分付款缺失或证据异常时必须在下钻页逐单列出');
assert.match(financePage, /paymentEvidenceIssueLabels/, '逐付款异常必须解释缺失、金额和业务时间等具体原因');
assert.match(financePage, /payment\.expectedAmount[\s\S]*payment\.ledgerAmount[\s\S]*payment\.differenceAmount/, '每笔异常付款必须展示应收、流水净额和差额');
assert.doesNotMatch(financePage, /paymentEvidence[\s\S]{0,120}slice\(/, '付款证据不得只截取前几笔而隐藏剩余证据');
assert.match(financePage, /orderId=\$\{encodeURIComponent\(order\.orderId\)\}/, '付款证据异常订单必须可跳转原订单处理');
assert.match(financePage, /dashboardApi\.fetchBusinessCockpit/, '对账异常页必须按原统计周期恢复全部异常订单');
assert.match(financePage, /下一批/, '超过单批上限的异常订单必须可继续下钻');
assert.match(server, /includeOrderDetails: isSuperAdmin\(req\.currentUser\)/, '缺流水订单的客户和付款证据必须由服务端限制为超级管理员');
assert.match(financePage, /canViewMissingOrderDetails = isSuperAdmin\(currentUser\)/, '前端处理入口必须与服务端权限口径一致');
assert.doesNotMatch(page, /value <= 1 \? value \* 100/, '服务端已返回 0-100 百分比，前端不得再放大 100 倍');
assert.match(page, /accessibilityLayer/, '成交趋势图必须启用可访问层');
assert.match(page, /aria-label=\{`\$\{title\}/, '排名进度条必须包含人员与金额名称');
assert.doesNotMatch(page, /toLocalDateString/, '驾驶舱不得继续依赖浏览器本地时区');

console.log('dashboard business cockpit static tests passed');
