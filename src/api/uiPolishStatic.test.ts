import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const projectRoot = process.cwd();
const scanRoots = ['src/pages'];
const nativeDialogPattern = /window\.(alert|confirm)\s*\(/;
const expensivePageSizePattern = /pageSize:\s*1000/;

const collectFiles = (dir: string): string[] => {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return collectFiles(path);
    return /\.(tsx|ts)$/.test(entry) ? [path] : [];
  });
};

const files = scanRoots.flatMap((root) => collectFiles(join(projectRoot, root)));
const scannedFiles = files
  .map((file) => ({
    file: relative(projectRoot, file),
    content: readFileSync(file, 'utf8'),
  }));

const offenders = scannedFiles
  .filter(({ content }) => nativeDialogPattern.test(content))
  .map(({ file }) => file);

assert.deepEqual(offenders, [], `Native browser dialogs must use app-style dialogs instead: ${offenders.join(', ')}`);

const expensiveFetchOffenders = scannedFiles
  .filter(({ content }) => expensivePageSizePattern.test(content))
  .map(({ file }) => file);

assert.deepEqual(expensiveFetchOffenders, [], `Page components should not fetch 1000-row batches in the UI path: ${expensiveFetchOffenders.join(', ')}`);

const businessCockpitSource = readFileSync(join(projectRoot, 'src/pages/Dashboard/BusinessCockpit.tsx'), 'utf8');
const customersPageSource = readFileSync(join(projectRoot, 'src/pages/Customers/index.tsx'), 'utf8');
const customerDetailSource = readFileSync(join(projectRoot, 'src/pages/Customers/CustomerDetail.tsx'), 'utf8');
const leadsPageSource = readFileSync(join(projectRoot, 'src/pages/Leads/index.tsx'), 'utf8');
const leadDetailSource = readFileSync(join(projectRoot, 'src/pages/Leads/LeadDetail.tsx'), 'utf8');
const leadIntakeSource = readFileSync(join(projectRoot, 'src/pages/Leads/LeadIntakeTab.tsx'), 'utf8');
const leadFlowApiSource = readFileSync(join(projectRoot, 'src/api/leadFlowApi.ts'), 'utf8');
const orderApiSource = readFileSync(join(projectRoot, 'src/api/orderApi.ts'), 'utf8');
const orderReviewApiSource = readFileSync(join(projectRoot, 'src/api/orderReviewApi.ts'), 'utf8');
const ordersPageSource = readFileSync(join(projectRoot, 'src/pages/Orders/index.tsx'), 'utf8');
const orderFormSource = readFileSync(join(projectRoot, 'src/pages/Orders/OrderForm.tsx'), 'utf8');
const orderDetailSource = readFileSync(join(projectRoot, 'src/pages/Orders/OrderDetail.tsx'), 'utf8');
const orderHistorySource = readFileSync(join(projectRoot, 'src/pages/Orders/OrderHistoryDialog.tsx'), 'utf8');
const orderReviewSource = readFileSync(join(projectRoot, 'src/pages/OrderReview/index.tsx'), 'utf8');
const appSource = readFileSync(join(projectRoot, 'src/App.tsx'), 'utf8');
const sidebarSource = readFileSync(join(projectRoot, 'src/layouts/Sidebar.tsx'), 'utf8');
const deliverySource = readFileSync(join(projectRoot, 'src/pages/Delivery/index.tsx'), 'utf8');
const rolePermissionSource = readFileSync(join(projectRoot, 'src/pages/Settings/RolePermission.tsx'), 'utf8');
const dataMaintenanceSource = readFileSync(join(projectRoot, 'src/pages/Settings/DataMaintenance.tsx'), 'utf8');
const commissionSource = readFileSync(join(projectRoot, 'src/pages/Commission/index.tsx'), 'utf8');
const commissionRuleConfigSource = readFileSync(join(projectRoot, 'src/pages/Commission/CommissionRuleConfig.tsx'), 'utf8');
const financeSource = readFileSync(join(projectRoot, 'src/pages/Finance/index.tsx'), 'utf8');
const financeApiSource = readFileSync(join(projectRoot, 'src/api/financeApi.ts'), 'utf8');
const refundCenterSource = readFileSync(join(projectRoot, 'src/pages/RefundCenter/index.tsx'), 'utf8');
const afterSalesSource = readFileSync(join(projectRoot, 'src/pages/AfterSales/index.tsx'), 'utf8');
const recoveryOrderSource = readFileSync(join(projectRoot, 'src/pages/AfterSales/RecoveryOrderTab.tsx'), 'utf8');
const serviceTicketSource = readFileSync(join(projectRoot, 'src/pages/RefundCenter/ServiceTicketTab.tsx'), 'utf8');
const employeeDepartmentSource = readFileSync(join(projectRoot, 'src/pages/Settings/EmployeeDepartmentManagement.tsx'), 'utf8');
const detailSplitEditorSource = commissionSource.slice(
  commissionSource.indexOf('const renderDetailSplitEditor'),
  commissionSource.indexOf('const renderSettlementDetailActions'),
);
const userSaveSource = employeeDepartmentSource.slice(
  employeeDepartmentSource.indexOf('const handleSaveUser'),
  employeeDepartmentSource.indexOf('const handleToggleUserActive'),
);
const orderToolbarSource = commissionSource.slice(
  commissionSource.indexOf('const renderOrderToolbar'),
  commissionSource.indexOf('const renderOrderSplitTable'),
);
const commissionHeaderSource = commissionSource.slice(
  commissionSource.indexOf('<Box sx={{ display: \'flex\', justifyContent: \'space-between\''),
  commissionSource.indexOf('<Tabs value={tabValue}'),
);
const refundCenterHeaderSource = refundCenterSource.slice(
  refundCenterSource.indexOf('{!embedded && ('),
  refundCenterSource.indexOf('<Tabs value={activeTab}'),
);
const createOrderSplitDialogSource = commissionSource.slice(
  commissionSource.indexOf('<Dialog open={createSplitOpen}'),
  commissionSource.indexOf('<Dialog open={Boolean(deleteSummary)}'),
);
const customerSaveProfileSource = customerDetailSource.slice(
  customerDetailSource.indexOf('const handleSaveProfile'),
  customerDetailSource.indexOf('const handleClaimCurrentCustomer'),
);

assert.match(
  businessCockpitSource,
  /经营信号条/,
  'Business cockpit should use a distinctive operating signal strip instead of generic equal KPI cards.',
);
assert.match(
  businessCockpitSource,
  /当前阻塞/,
  'Business cockpit should make the highest-priority blocker explicit.',
);
assert.match(
  businessCockpitSource,
  /线索入库[\s\S]*客户沉淀[\s\S]*订单申请[\s\S]*财务入库[\s\S]*分账确认/,
  'Business cockpit should render the core CRM operating chain in order.',
);

assert.match(
  customersPageSource,
  /canCreateOrderForCustomer/,
  'Customer list must gate submit-order actions behind a public-pool status check.',
);
assert.match(
  customerDetailSource,
  /canCreateOrderForCurrentCustomer/,
  'Customer detail must gate submit-order actions behind a public-pool status check.',
);
assert.match(
  customerSaveProfileSource,
  /res\.code\s*!==\s*0[\s\S]*res\.message/,
  'Customer detail save must surface update failures instead of making the save button feel unresponsive.',
);
assert.doesNotMatch(
  `${customersPageSource}\n${customerDetailSource}`,
  /permissionKey=\{PERMISSION_KEYS\.CUSTOMER_CREATE_ORDER\}\s+action="write"/,
  'Customer submit-order permission is checkbox based and must not require write actions.',
);
assert.match(
  rolePermissionSource,
  /订单审核操作/,
  'Role permission tree should describe ORDER_REVIEW as review operations, not page visibility.',
);
assert.doesNotMatch(
  `${leadsPageSource}\n${leadDetailSource}`,
  /PERMISSION_KEYS\.LEADS_FLOW_CONFIG,\s*'write'|PERMISSION_KEYS\.LEADS_CREATE\}\s+action="write"/,
  'Lead permissions are checkbox based and must not require write actions for visible lead operations.',
);
assert.match(
  userSaveSource,
  /await alert\(/,
  'Create/edit employee validation and save failures should use app dialog alerts instead of inline page-level errors.',
);
assert.match(
  dataMaintenanceSource,
  /重新同步本机缓存[\s\S]*resyncLocalCacheFromBackend|resyncLocalCacheFromBackend[\s\S]*重新同步本机缓存/,
  'Data maintenance should expose a safe local-cache resync action backed by the server snapshot API.',
);
assert.doesNotMatch(
  userSaveSource,
  /setError\(/,
  'Create/edit employee validation and save failures must not render page-level error text above the organization panel.',
);
assert.match(
  leadsPageSource,
  /PERMISSION_KEYS\.LEADS_DETAIL/,
  'Lead list must gate view-detail operations behind 查看线索资料.',
);
assert.match(
  leadsPageSource,
  /PERMISSION_KEYS\.LEADS_INTAKE_STATUS/,
  'Lead intake tab must be controlled by 入库情况 permission.',
);
assert.match(
  leadIntakeSource,
  /label:\s*'线索录入人'/,
  'Lead intake records table must show who entered the lead.',
);
assert.match(
  orderReviewApiSource,
  /cleanupDeletedSourceOrderApplication/,
  'Order review API should expose cleanup for approved applications whose source order was deleted.',
);
assert.match(
  orderReviewSource,
  /(?:清理订单审核记录[\s\S]*cleanupDeletedSourceOrderApplication|cleanupDeletedSourceOrderApplication[\s\S]*清理订单审核记录)/,
  'Order review page should let super admins clean stale approved records for deleted formal orders.',
);
assert.match(
  leadsPageSource,
  /(?:删除线索到业务回收站[\s\S]*leadApi\.deleteLead|leadApi\.deleteLead[\s\S]*删除线索到业务回收站)/,
  'Lead list should let super admins soft-delete leads into the business recycle bin.',
);
assert.match(
  leadFlowApiSource,
  /cleanupIntakeRecord/,
  'Lead flow API should expose super-admin cleanup for intake records.',
);
assert.match(
  leadIntakeSource,
  /(?:清理入库记录[\s\S]*cleanupIntakeRecord|cleanupIntakeRecord[\s\S]*清理入库记录)/,
  'Lead intake records table should let super admins clean intake records.',
);
assert.match(
  customersPageSource,
  /(?:删除客户到业务回收站[\s\S]*customerApi\.deleteCustomer|customerApi\.deleteCustomer[\s\S]*删除客户到业务回收站)/,
  'Customer list should let super admins soft-delete customers into the business recycle bin.',
);
assert.match(
  orderReviewSource,
  /<IconButton[\s\S]*openApproveDialog/,
  'Order review action column should use compact icon buttons for review operations.',
);
assert.match(
  orderReviewSource,
  /CustomerDetail/,
  'Order review customer column should open customer detail like the order list.',
);
assert.match(
  orderReviewSource,
  /handleViewCustomer/,
  'Order review should resolve and open customer records from the customer column.',
);
assert.match(
  orderReviewSource,
  /onClick=\{\(\) => handleViewCustomer\(application\)\}/,
  'Order review customer names must be clickable.',
);
assert.match(
  ordersPageSource,
  /if\s*\(\s*activeTab\s*!==\s*'list'\s*\)\s*return;[\s\S]*fetchItems\(\{\s*\.\.\.filters,\s*paymentMethod:\s*undefined\s*\}\)/,
  'Order list must refresh when returning from the review tab after an approval creates a formal order.',
);
assert.match(
  ordersPageSource,
  /items\.length\s*===\s*0[\s\S]*colSpan=\{visibleColumns\.length \+ 1\}[\s\S]*暂无订单数据/,
  'Order list table should render an empty-state row like the other CRM tables instead of collapsing to header plus pagination.',
);
assert.match(
  orderFormSource,
  /label="产品名称"[\s\S]*value=\{form\.productId\}|value=\{form\.productId\}[\s\S]*label="产品名称"/,
  'Order submit form should select a concrete product by productId, not choose a product level.',
);
assert.doesNotMatch(
  orderFormSource,
  /<TextField select label="产品等级"/,
  'Order submit form must not present product level as the product selector.',
);
assert.match(
  orderFormSource,
  /const seconds = String\(value\.getSeconds\(\)\)\.padStart\(2,\s*'0'\)[\s\S]*`\$\{year\}-\$\{month\}-\$\{day\}T\$\{hours\}:\$\{minutes\}:\$\{seconds\}`/,
  'Order submit form payment time defaults should include seconds.',
);
assert.match(
  orderFormSource,
  /TextField label="付款时间"[\s\S]*type="datetime-local"[\s\S]*inputProps=\{\{\s*step:\s*1\s*\}\}/,
  'Order submit form payment time input should allow second precision.',
);
assert.match(
  orderFormSource,
  /hour = '00', minute = '00', second = '00'[\s\S]*T\$\{hour\.padStart\(2,\s*'0'\)\}:\$\{minute\.padStart\(2,\s*'0'\)\}:\$\{second\.padStart\(2,\s*'0'\)\}/,
  'Order submit form payment proof recognition should preserve seconds.',
);
assert.match(
  ordersPageSource,
  /id:\s*'productName'[\s\S]*label:\s*'产品名称'|label:\s*'产品名称'[\s\S]*id:\s*'productName'/,
  'Order list must expose productName as a first-class column.',
);
assert.match(
  orderDetailSource,
  /产品名称[\s\S]*order\.productName/,
  'Order detail must show product name separately from product level.',
);
assert.match(
  orderReviewSource,
  /productName\s*\|\|[\s\S]*productLevel/,
  'Order review must display product name with product level as fallback.',
);
assert.match(
  financeApiSource,
  /productName\s*\|\|[\s\S]*productLevel/,
  'Finance flow generation must show product name with product level as fallback.',
);
assert.match(
  financeSource,
  /业务核账流水[\s\S]*流水编号[\s\S]*关联业务[\s\S]*流水详情/,
  'Finance flow tab should be designed as a unified business ledger, not separate income and expense tables.',
);
assert.match(
  commissionSource,
  /'productName'[\s\S]*产品名称[\s\S]*summary\.productName/,
  'Finance order split table must include product name.',
);
assert.match(
  refundCenterSource,
  /productName[\s\S]*产品名称[\s\S]*refund\.productName/,
  'Finance refund table must include product name.',
);
assert.match(
  `${customersPageSource}\n${customerDetailSource}`,
  /productName\s*\|\|[\s\S]*productLevel/,
  'Customer order views must display product name with product level as fallback.',
);
assert.match(
  orderApiSource,
  /field:\s*'leadInputBy',\s*label:\s*'线索录入人'/,
  'Order change history must label leadInputBy as lead input person.',
);
assert.match(
  orderDetailSource,
  /线索录入人[\s\S]*order\.leadInputBy[\s\S]*线索贡献人[\s\S]*order\.leadContributorName/,
  'Order detail must show lead input person and lead contributor as separate fields.',
);
assert.doesNotMatch(
  orderDetailSource,
  /leadContributorName\s*\|\|\s*order\.leadInputBy/,
  'Order detail must not label lead input person as lead contributor.',
);
assert.doesNotMatch(
  orderDetailSource,
  /order\.successName|order\.serviceName/,
  'Order detail should not expose success/service manager fields that are absent from the order table view settings.',
);
assert.match(
  orderDetailSource,
  /formatDate\(order\.createdAt,\s*'yyyy-MM-dd HH:mm:ss'\)/,
  'Order detail creation time should be precise to seconds.',
);
assert.match(
  ordersPageSource,
  /case 'createdAt':[\s\S]*formatDate\(order\.createdAt,\s*'yyyy-MM-dd HH:mm:ss'\)/,
  'Order list creation time column should be precise to seconds.',
);
assert.match(
  customersPageSource,
  /id:\s*'createdAt'[\s\S]*formatDate\(customer\.createdAt,\s*'yyyy-MM-dd HH:mm:ss'\)/,
  'Customer list creation time should be precise to seconds.',
);
assert.match(
  customerDetailSource,
  /field === 'createdAt'[\s\S]*formatDate\(currentCustomer\.createdAt,\s*'yyyy-MM-dd HH:mm:ss'\)/,
  'Customer detail creation time should be precise to seconds.',
);
[
  ['ordersPageSource', ordersPageSource],
  ['orderDetailSource', orderDetailSource],
  ['orderReviewSource', orderReviewSource],
  ['customersPageSource', customersPageSource],
  ['customerDetailSource', customerDetailSource],
  ['commissionSource', commissionSource],
  ['financeSource', financeSource],
  ['deliverySource', deliverySource],
  ['orderHistorySource', orderHistorySource],
].forEach(([name, source]) => {
  assert.doesNotMatch(
    source,
    /(paidAt|paymentDate|receivedAt)[\s\S]{0,120}formatDate\([^)]*'yyyy-MM-dd HH:mm'\)|formatDate\([^)]*(paidAt|paymentDate|receivedAt)[^)]*'yyyy-MM-dd HH:mm'\)/,
    `${name} must not render order payment time only to minutes.`,
  );
});
assert.match(
  ordersPageSource,
  /case 'paymentDate':[\s\S]*formatDate\(order\.payments\?\.\[0\]\?\.paidAt \|\| order\.createdAt,\s*'yyyy-MM-dd HH:mm:ss'\)/,
  'Order list payment date should be precise to seconds.',
);
assert.match(
  orderDetailSource,
  /formatDate\(payment\.paidAt,\s*'yyyy-MM-dd HH:mm:ss'\)/,
  'Order detail payment records should be precise to seconds.',
);
assert.match(
  orderReviewSource,
  /付款时间[\s\S]*detailApplication\.orderData\.payments\.map[\s\S]*formatDate\(payment\.paidAt,\s*'yyyy-MM-dd HH:mm:ss'\)/,
  'Order review payment time should be precise to seconds.',
);
assert.match(
  customerDetailSource,
  /formatDate\(order\.payments\?\.\[0\]\?\.paidAt \|\| order\.createdAt,\s*'yyyy-MM-dd HH:mm:ss'\)/,
  'Customer detail order payment time should be precise to seconds.',
);
assert.match(
  customersPageSource,
  /formatDate\(order\.payments\?\.\[0\]\?\.paidAt \|\| order\.createdAt,\s*'yyyy-MM-dd HH:mm:ss'\)/,
  'Customer order dialog payment time should be precise to seconds.',
);
assert.match(
  commissionSource,
  /case 'paymentDate':[\s\S]*formatDate\(summary\.paymentDate,\s*'yyyy-MM-dd HH:mm:ss'\)/,
  'Commission order split payment date should be precise to seconds.',
);
assert.match(
  financeSource,
  /formatDate\(row\.occurredAt,\s*'yyyy-MM-dd HH:mm:ss'\)/,
  'Finance flow occurred time should be precise to seconds.',
);
assert.match(
  deliverySource,
  /function formatDateTime[\s\S]*format\(date,\s*'yyyy-MM-dd HH:mm:ss'\)[\s\S]*case 'paymentDate':[\s\S]*formatDateTime\(delivery\.paymentDate\)/,
  'Delivery order payment date should be precise to seconds.',
);
assert.match(
  orderHistorySource,
  /payment\.paidAt[\s\S]*formatDate\(payment\.paidAt,\s*'yyyy-MM-dd HH:mm:ss'\)/,
  'Order history payment changes should render payment time to seconds.',
);
assert.match(
  orderApiSource,
  /payment\.paidAt[\s\S]*formatDate\(payment\.paidAt,\s*'yyyy-MM-dd HH:mm:ss'\)/,
  'Order change history should store payment change summaries to seconds.',
);
assert.doesNotMatch(
  orderReviewSource,
  /<Button size="small" variant="contained" startIcon=\{<CheckCircleOutlineIcon \/>}|<Button size="small" variant="outlined" startIcon=\{<ReplayIcon \/>}|<Button size="small" color="error" variant="outlined" startIcon=\{<BlockIcon \/>}/,
  'Order review action column should not use large text buttons for approve/return/reject operations.',
);
assert.match(
  orderReviewSource,
  /getCurrentOperatorUser/,
  'Returned order applications submitted by the current user should show 修改提交 even when the user also has review permission.',
);
assert.doesNotMatch(
  orderReviewSource,
  /const canResubmit = !reviewer && application\.status === ORDER_APPLICATION_STATUSES\.RETURNED/,
  'Returned order resubmission must not be hidden only because the current user has review permission.',
);
assert.match(
  orderReviewSource,
  /退回修改/,
  'Return action should be named 退回修改 to explain that sales can correct and resubmit.',
);
assert.match(
  orderReviewSource,
  /驳回终止/,
  'Reject action should be named 驳回终止 to explain that the application is closed.',
);
assert.match(
  commissionSource,
  /renderPayoutCommissionDetail/,
  'Monthly payout expanded details must use a responsive detail renderer instead of a nested wide table.',
);
assert.doesNotMatch(
  commissionSource,
  /<TableCell colSpan=\{11\}[\s\S]*?<Table size="small">[\s\S]*?备注\/原因/,
  'Monthly payout expanded details must not render as a nested table inside the horizontally scrollable employee table.',
);
assert.match(
  commissionSource,
  /renderSplitSummaryCard/,
  'Order split detail dialog should render each commission as a readable summary card.',
);
assert.match(
  commissionSource,
  /detail-card-\$\{index\}/,
  'Order split adjustment editor should add people as editable cards instead of table rows.',
);
assert.match(
  detailSplitEditorSource,
  /提成方案[\s\S]*planOptionsForSplit[\s\S]*planText/,
  'Order split adjustment editor should choose a commission payout plan instead of editing calculation type directly.',
);
assert.match(
  commissionSource,
  /formatEmployeeDisplayName/,
  'Commission personnel labels should be formatted through a single employee display helper.',
);
assert.match(
  commissionSource,
  /\$\{name\}（\$\{role\}）/,
  'Commission personnel labels should show employee name plus system permission role, such as 张伟（销售专员）.',
);
assert.doesNotMatch(
  detailSplitEditorSource,
  /<TableContainer|<Table\b|<TableRow/,
  'Order split adjustment editor should not render as a table.',
);
assert.match(
  commissionSource,
  /sourceOrderDeleted/,
  'Order split table should identify commission records whose source order has been deleted.',
);
assert.match(
  commissionSource,
  /源订单已删除/,
  'Order split table should show a source-order-deleted badge or disabled-action reason.',
);
assert.match(
  commissionSource,
  /aria-label="查看分账"/,
  'Order split table should expose an icon-only entry for viewing split details.',
);
assert.match(
  commissionSource,
  /aria-label="调整分账"/,
  'Order split table should expose an icon-only entry for adjusting split details.',
);
assert.match(
  commissionSource,
  /aria-label="删除订单分账"/,
  'Order split table should expose an icon-only entry for deleting a pending order split.',
);
assert.match(
  commissionSource,
  /deleteOrderCommissions/,
  'Order split delete action should call the order-level delete API.',
);
assert.match(
  commissionSource,
  /新建订单分账/,
  'Order split workspace should expose a clear create-order-split entry point.',
);
assert.doesNotMatch(
  orderToolbarSource,
  /新建订单分账/,
  'Create-order-split action should live beside the view settings button, not inside the filter toolbar.',
);
assert.match(
  commissionHeaderSource,
  /视图设置[\s\S]*新建订单分账|新建订单分账[\s\S]*视图设置/,
  'Order split header actions should place 新建订单分账 beside 视图设置.',
);
assert.match(
  financeSource,
  /视图设置[\s\S]*新建订单分账|新建订单分账[\s\S]*视图设置/,
  'Finance settlement header should place 新建订单分账 beside 视图设置.',
);
assert.match(
  financeSource,
  /orderSplitCreateTrigger/,
  'Finance settlement header should trigger the embedded order-split create dialog.',
);
assert.match(
  refundCenterHeaderSource,
  /\{!embedded && \([\s\S]*视图设置/,
  'Refund workspace should keep its internal view settings button only for standalone use.',
);
assert.match(
  afterSalesSource,
  /label:\s*'售后挽回订单列表'[\s\S]*label:\s*'售后挽回订单审核台'/,
  'After-sales workspace should expose recovery order list and review tabs.',
);
assert.doesNotMatch(
  afterSalesSource,
  /label:\s*'退款冲销'|label:\s*'售后工单'|activeTab === 'refund'|refundViewSettingsTrigger/,
  'After-sales workspace should not expose chargeback or service tickets as top-level tabs.',
);
assert.doesNotMatch(
  afterSalesSource,
  /<RefundCenter embedded showInternalTabs=\{false\} \/>/,
  'After-sales workspace should not embed refund workspace in the simplified v1 flow.',
);
assert.doesNotMatch(
  financeSource,
  /value:\s*'overview'|value:\s*'refund'/,
  'Finance center should not expose overview or refund tabs after after-sales split.',
);
assert.match(
  appSource,
  /ROUTES\.REFUND_CENTER[\s\S]*ROUTES\.AFTER_SALES/,
  'Legacy refund center route should redirect to after-sales default recovery workspace.',
);
assert.match(
  sidebarSource,
  /label:\s*'交付'[\s\S]*label:\s*'售后服务'[\s\S]*label:\s*'财务中心'/,
  'Sidebar should place 售后服务 between 交付 and 财务中心.',
);
assert.match(
  recoveryOrderSource,
  /第三方平台订单号[\s\S]*售后挽回分账|售后挽回分账[\s\S]*第三方平台订单号/,
  'Recovery order workspace should collect third-party order data and send approved records to recovery settlement.',
);
assert.match(
  commissionSource,
  /fetchCreatableCommissionOrders/,
  'Create-order-split dialog should load orders that can receive a first manual split.',
);
assert.match(
  createOrderSplitDialogSource,
  /<InputLabel shrink>\s*选择订单\s*<\/InputLabel>/,
  'Create-order-split order selector should shrink its label when displayEmpty shows placeholder text.',
);
assert.match(
  commissionSource,
  /删除此条未确认分账/,
  'Split editor delete action should make the pending-only deletion rule explicit.',
);
assert.doesNotMatch(
  commissionSource,
  /查看\/处理/,
  'Order split table should not use the broad 查看/处理 text button.',
);
assert.doesNotMatch(
  commissionSource,
  /确认冲销完成/,
  'Order split detail workspace should not expose a chargeback completion action in v1.',
);
assert.doesNotMatch(
  commissionSource,
  /chargebackMethod/,
  'Order split detail workspace should not collect chargeback handling method in v1.',
);
assert.doesNotMatch(
  commissionSource,
  /justifyContent="center"[\s\S]*?<EditIcon[\s\S]*?<CheckCircleIcon[\s\S]*?<CancelIcon[\s\S]*?<HistoryIcon/,
  'Order split table row should not show edit, confirm, withdraw, and history as separate icon buttons.',
);
assert.doesNotMatch(
  commissionSource,
  /summaryDetail && \(\s*<Table size="small">/,
  'Order split detail dialog should not use a wide table for split details.',
);
assert.match(
  financeSource,
  /value:\s*'payout',\s*label:\s*'员工提成月报'/,
  'Finance payout tab should use the employee monthly commission report wording.',
);
assert.match(
  commissionRuleConfigSource,
  /value="tiered_percentage"[\s\S]*销售月累计阶梯提成|销售月累计阶梯提成[\s\S]*value="tiered_percentage"/,
  'Commission rule config should expose sales monthly tiered commission as a calculation type.',
);
assert.doesNotMatch(
  commissionRuleConfigSource,
  /月累计下限|月累计上限|提成比例/,
  'Commission rule config should not edit tier thresholds; those belong in monthly payout settings.',
);
assert.match(
  commissionSource,
  /阶梯配置[\s\S]*总实付金额|总实付金额[\s\S]*阶梯配置/,
  'Monthly payout workspace should expose tier configuration and total paid amount.',
);
assert.match(
  commissionSource,
  /headers = \[[\s\S]*'总实付金额'/,
  'Monthly payout export should include total paid amount.',
);
assert.doesNotMatch(
  commissionSource,
  /RefundStatusBadge/,
  'Commission order split should not expose refund status badge in simplified v1 finance flow.',
);
assert.match(
  commissionSource,
  /case 'orderType':[\s\S]*<Chip label=\{summary\.orderType/,
  'Commission order split should render order type like the order list chip.',
);
assert.match(
  commissionSource,
  /case 'paymentDate':[\s\S]*formatDate\(summary\.paymentDate,\s*'yyyy-MM-dd HH:mm:ss'\)/,
  'Commission order split should render payment date with the same second precision as the order list.',
);
assert.match(
  commissionSource,
  /renderOperationLogCard/,
  'Commission operation history should use compact summary cards.',
);
assert.match(
  commissionSource,
  /splitSnapshot/,
  'Commission operation history should render per-role split snapshots when available.',
);
assert.doesNotMatch(
  commissionSource,
  /分账条数/,
  'Commission operation history should avoid system-oriented aggregate labels.',
);
assert.match(
  commissionSource,
  /本次分账结果|本次记录/,
  'Commission operation history should explain what the split was changed to.',
);
assert.doesNotMatch(
  commissionSource,
  /open=\{Boolean\(operationHistorySummary\)\}[\s\S]*?<Table size="small">[\s\S]*?log\.summary/,
  'Commission operation history should not use a cramped multi-column table.',
);
