import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

for (const file of [
  'src/pages/Leads/index.tsx',
  'src/pages/Leads/LeadForm.tsx',
  'src/pages/Leads/LeadDetail.tsx',
]) {
  const source = readFileSync(path.resolve(file), 'utf8');
  assert.doesNotMatch(source, /ManualTagSelector|ManualTagDisplay|预设标签|manualTagIds|id:\s*'tags'/);
}

const leadType = readFileSync(path.resolve('src/types/lead.ts'), 'utf8');
assert.match(leadType, /@deprecated 仅用于读取待清理的历史数据/);

console.log('leadListTagStyleStatic.test.ts passed');
