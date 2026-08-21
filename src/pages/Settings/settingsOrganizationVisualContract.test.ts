import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const settingsSource = readFileSync(join(process.cwd(), 'src/pages/Settings/index.tsx'), 'utf8');
const organizationSource = readFileSync(
  join(process.cwd(), 'src/pages/Settings/EmployeeDepartmentManagement.tsx'),
  'utf8',
);

assert.doesNotMatch(
  settingsSource,
  /<Typography[^>]*>[\s\S]*?\{activeGroup\?\.label\}[\s\S]*?<\/Typography>/,
  'The active settings group should not repeat as a heading between the two navigation levels.',
);

assert.match(
  settingsSource,
  /data-settings-tabs="secondary"[\s\S]*?'& \.MuiTabs-indicator': \{ display: 'none' \}/,
  'Secondary settings navigation should use a full-width pill treatment instead of a second underline.',
);

const organizationTreeSource = organizationSource.slice(
  organizationSource.indexOf('const renderDepartmentRows'),
  organizationSource.indexOf('const departmentParentOptions'),
);

assert.match(organizationTreeSource, /bgcolor: selected \? '#F2EDFF'/);
assert.match(organizationTreeSource, /color: selected \? moduleTokens\.blue/);
assert.doesNotMatch(organizationTreeSource, /#eaf3ff|#1976d2|#0f5fca|#b7d7ff/);

assert.match(
  organizationSource,
  /bgcolor: selectedNodeId === COMPANY_ROOT \? '#F2EDFF'[\s\S]*?color: selectedNodeId === COMPANY_ROOT \? moduleTokens\.blue/,
);
assert.match(
  organizationSource,
  /boxShadow: selectedNodeId === COMPANY_ROOT \? `0 8px 18px \$\{alpha\(moduleTokens\.blue, 0\.08\)\}`/,
);
