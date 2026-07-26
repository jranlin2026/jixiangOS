import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BusinessStatusChip from './BusinessStatusChip';
import SettlementStatusChip from './SettlementStatusChip';

const settlementCases = [
  ['待处理', 'MuiChip-colorWarning'],
  ['待确认', 'MuiChip-colorInfo'],
  ['待发放', 'MuiChip-colorPrimary'],
  ['已发放', 'MuiChip-colorSuccess'],
  ['已撤回', 'MuiChip-colorDefault'],
] as const;

for (const [status, colorClass] of settlementCases) {
  const markup = renderToStaticMarkup(<SettlementStatusChip status={status} />);
  assert.match(markup, new RegExp(status));
  assert.match(markup, new RegExp(colorClass));
  assert.match(markup, /MuiChip-filled/);
}

const pendingReviewMarkup = renderToStaticMarkup(<BusinessStatusChip status="待审核" />);
assert.match(pendingReviewMarkup, /待审核/);
assert.match(pendingReviewMarkup, /MuiChip-filled/);
assert.match(pendingReviewMarkup, /#7e22ce/);
