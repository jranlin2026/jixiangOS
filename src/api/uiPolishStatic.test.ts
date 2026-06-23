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
