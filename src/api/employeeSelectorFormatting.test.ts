import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const employeeSelectorFiles = [
  'src/shared/components/CustomerTodoPanel.tsx',
  'src/pages/Assets/index.tsx',
  'src/pages/AfterSales/RecoveryOrderTab.tsx',
  'src/pages/Commission/index.tsx',
  'src/pages/Customers/index.tsx',
  'src/pages/Customers/CustomerDetail.tsx',
  'src/pages/Customers/CustomerForm.tsx',
  'src/pages/Customers/batch/CustomerBatchActionDialog.tsx',
  'src/pages/Delivery/index.tsx',
  'src/pages/Finance/RecoverySettlement.tsx',
  'src/pages/Leads/index.tsx',
  'src/pages/Leads/LeadDetail.tsx',
  'src/pages/Leads/LeadFlowConfigTab.tsx',
  'src/pages/Leads/LeadForm.tsx',
  'src/pages/Orders/index.tsx',
  'src/pages/Orders/OrderForm.tsx',
  'src/pages/Settings/DeliveryAssignmentConfig.tsx',
  'src/pages/Settings/DepartmentManagement.tsx',
  'src/pages/Settings/EmployeeDepartmentManagement.tsx',
];

for (const file of employeeSelectorFiles) {
  const source = readFileSync(join(process.cwd(), file), 'utf8');
  assert.match(
    source,
    /formatEmployeeNameWithPosition\(/,
    `${file} 的员工选择项必须复用“姓名（职位）”公共格式`,
  );
}

const employeeSelectorSource = employeeSelectorFiles
  .map((file) => readFileSync(join(process.cwd(), file), 'utf8'))
  .join('\n');

for (const legacyPattern of [
  />\{user\.name\}<\/MenuItem>/,
  /\{user\.name\}\s*[·/-]\s*\{user\.role\}/,
  /\{user\.name\}（\{user\.positionName/,
  /\$\{user\.name\}（\$\{user\.positionName/,
]) {
  assert.doesNotMatch(
    employeeSelectorSource,
    legacyPattern,
    '员工选择项不得重新出现仅姓名、姓名加角色或手写职位格式',
  );
}
