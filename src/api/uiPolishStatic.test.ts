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

const customersPageSource = readFileSync(join(projectRoot, 'src/pages/Customers/index.tsx'), 'utf8');
const customerDetailSource = readFileSync(join(projectRoot, 'src/pages/Customers/CustomerDetail.tsx'), 'utf8');
const leadsPageSource = readFileSync(join(projectRoot, 'src/pages/Leads/index.tsx'), 'utf8');
const leadDetailSource = readFileSync(join(projectRoot, 'src/pages/Leads/LeadDetail.tsx'), 'utf8');
const leadIntakeSource = readFileSync(join(projectRoot, 'src/pages/Leads/LeadIntakeTab.tsx'), 'utf8');
const orderApiSource = readFileSync(join(projectRoot, 'src/api/orderApi.ts'), 'utf8');
const ordersPageSource = readFileSync(join(projectRoot, 'src/pages/Orders/index.tsx'), 'utf8');
const orderDetailSource = readFileSync(join(projectRoot, 'src/pages/Orders/OrderDetail.tsx'), 'utf8');
const orderReviewSource = readFileSync(join(projectRoot, 'src/pages/OrderReview/index.tsx'), 'utf8');
const rolePermissionSource = readFileSync(join(projectRoot, 'src/pages/Settings/RolePermission.tsx'), 'utf8');
const commissionSource = readFileSync(join(projectRoot, 'src/pages/Commission/index.tsx'), 'utf8');
const financeSource = readFileSync(join(projectRoot, 'src/pages/Finance/index.tsx'), 'utf8');
const refundCenterSource = readFileSync(join(projectRoot, 'src/pages/RefundCenter/index.tsx'), 'utf8');
const detailSplitEditorSource = commissionSource.slice(
  commissionSource.indexOf('const renderDetailSplitEditor'),
  commissionSource.indexOf('const renderSettlementDetailActions'),
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
  financeSource,
  /activeTab === 'refund'[\s\S]*视图设置/,
  'Finance refund header should place 视图设置 in the same top-right header action area.',
);
assert.match(
  financeSource,
  /refundViewSettingsTrigger/,
  'Finance refund header should trigger the embedded refund table view settings dialog.',
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
assert.match(
  commissionSource,
  /确认冲销完成/,
  'Order split detail workspace should expose a chargeback completion action.',
);
assert.match(
  commissionSource,
  /chargebackMethod/,
  'Order split detail workspace should collect chargeback handling method.',
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
  commissionSource,
  /RefundStatusBadge/,
  'Commission order split should reuse the order list refund status badge.',
);
assert.match(
  commissionSource,
  /case 'orderType':[\s\S]*<Chip label=\{summary\.orderType/,
  'Commission order split should render order type like the order list chip.',
);
assert.match(
  commissionSource,
  /case 'paymentDate':[\s\S]*formatDate\(summary\.paymentDate,\s*'yyyy-MM-dd HH:mm'\)/,
  'Commission order split should render payment date with the same minute precision as the order list.',
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
