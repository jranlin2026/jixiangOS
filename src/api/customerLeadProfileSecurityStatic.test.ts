import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const leadDetailSource = readFileSync(join(projectRoot, 'src/pages/Leads/LeadDetail.tsx'), 'utf8');
const customerDetailSource = readFileSync(join(projectRoot, 'src/pages/Customers/CustomerDetail.tsx'), 'utf8');

assert.doesNotMatch(
  leadDetailSource,
  /inputBy:\s*draft\.inputBy|assignedTo:\s*draft\.assignedTo|owner:\s*draft\.assignedTo/,
  'Lead profile saves must not send intake or assignment fields through the generic update command.',
);
assert.doesNotMatch(
  customerDetailSource,
  /owner:\s*draft\.owner|leadInputBy:\s*draft\.leadInputBy/,
  'Customer profile saves must not send ownership or original-intake fields through the generic update command.',
);

assert.match(
  leadDetailSource,
  /const canClaimLead\s*=\s*!currentLead\.customerId\s*&&\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.LEADS_FOLLOW,\s*'write'\)/,
  'Start-following controls must require explicit lead-follow write permission.',
);
assert.match(
  leadDetailSource,
  /const canAssignLead\s*=\s*!currentLead\.customerId\s*&&\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.LEADS_FLOW_CONFIG,\s*'write'\)/,
  'Lead assignment controls must require explicit assignment write permission.',
);
assert.match(
  leadDetailSource,
  /const canEditProfile\s*=\s*canEditLeadProfile\(currentLead\)[\s\S]{0,180}PERMISSION_KEYS\.LEADS_CREATE,\s*'write'[\s\S]{0,180}PERMISSION_KEYS\.LEADS_DETAIL,\s*'write'/,
  'Lead profile controls must require an explicit profile write permission.',
);
assert.match(
  leadDetailSource,
  /const handleClaimCurrentLead\s*=\s*async\s*\(\)\s*=>\s*\{\s*if\s*\(!canClaimLead\)\s*return;/,
  'The start-following handler must also fail closed when invoked without write permission.',
);
assert.match(
  leadDetailSource,
  /const handleOpenAssign\s*=\s*\(\)\s*=>\s*\{\s*if\s*\(!canAssignLead\)\s*return;/,
  'The assignment dialog handler must fail closed without write permission.',
);
assert.match(
  leadDetailSource,
  /const handleAssignLead\s*=\s*async\s*\(\)\s*=>\s*\{\s*if\s*\(!canAssignLead\)\s*return;/,
  'The assignment submit handler must fail closed without write permission.',
);

assert.match(leadDetailSource, /renderInfoRow\('线索录入人',\s*'inputBy',\s*false\)/);
assert.match(leadDetailSource, /renderInfoRow\('分配销售',\s*'assignedTo',\s*false\)/);
assert.match(customerDetailSource, /renderInfoRow\('销售负责人',\s*'owner',\s*false\)/);
assert.match(customerDetailSource, /renderInfoRow\('线索录入人',\s*'leadInputBy',\s*false\)/);
