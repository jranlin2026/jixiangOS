import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.resolve('src/pages/OrderReview/index.tsx'), 'utf8');
const submitReviewAction = source.match(/const submitReviewAction = async \(\) => \{([\s\S]*?)\n  \};\n\n  const handleCleanupApplication/ )?.[1];

assert.ok(submitReviewAction, 'Order review page should define submitReviewAction.');
assert.match(submitReviewAction, /if \(res\.code !== 0 \|\| !res\.data\) \{[\s\S]*?await alert\(/,
  'A failed approval must show feedback instead of silently leaving a pending row visible.');
assert.match(submitReviewAction, /await loadItems\(\);/,
  'Approval must await the refreshed list before the review dialog closes.');

console.log('orderReviewApprovalRefreshStatic.test.ts passed');
