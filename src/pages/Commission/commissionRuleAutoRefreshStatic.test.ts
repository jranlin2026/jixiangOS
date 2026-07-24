import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/pages/Commission/CommissionRuleConfig.tsx'), 'utf8');

assert.match(source, /subscribeCommissionRuleAutoRefresh/);
assert.match(source, /createLatestCommissionRuleRequestGate/);
assert.match(source, /if \(!requestGateRef\.current\.isLatest\(requestId\)\) return/);
