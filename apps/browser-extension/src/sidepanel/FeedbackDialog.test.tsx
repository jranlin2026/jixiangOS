import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackDialog, feedbackDialogContent } from './FeedbackDialog';

assert.deepEqual(feedbackDialogContent('HTTP 500', ''), {
  tone: 'error',
  title: '操作未完成',
  message: 'HTTP 500',
});
assert.deepEqual(feedbackDialogContent('', '订单已完成'), {
  tone: 'success',
  title: '操作成功',
  message: '订单已完成',
});
assert.equal(feedbackDialogContent('', ''), null);

const markup = renderToStaticMarkup(
  <FeedbackDialog error="极享OS返回了HTTP 500" notice="" onClose={() => undefined} />,
);
assert.match(markup, /role="dialog"/);
assert.match(markup, /aria-modal="true"/);
assert.match(markup, /操作未完成/);
assert.match(markup, /极享OS返回了HTTP 500/);
assert.match(markup, />知道了</);

console.log('browser feedback dialog: ok');
