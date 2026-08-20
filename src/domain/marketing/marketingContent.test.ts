import assert from 'node:assert/strict';
import {
  assertMarketingContentReadyForPublish,
  expandMarketingAccountSelection,
  nextMarketingContentStatus,
} from './marketingContent';

assert.equal(nextMarketingContentStatus('DRAFT', 'SUBMIT'), 'PENDING_REVIEW');
assert.equal(nextMarketingContentStatus('REJECTED', 'SUBMIT'), 'PENDING_REVIEW');
assert.equal(nextMarketingContentStatus('PENDING_REVIEW', 'APPROVE'), 'APPROVED');
assert.equal(nextMarketingContentStatus('PENDING_REVIEW', 'REJECT'), 'REJECTED');
assert.equal(nextMarketingContentStatus('APPROVED', 'RETIRE'), 'RETIRED');
assert.throws(() => nextMarketingContentStatus('DRAFT', 'APPROVE'), /不能执行/);

assert.deepEqual(
  expandMarketingAccountSelection(
    ['account-extra'],
    ['group-wechat', 'group-douyin'],
    [
      { id: 'group-wechat', accountIds: ['account-a', 'account-b'] },
      { id: 'group-douyin', accountIds: ['account-b', 'account-c'] },
    ],
  ),
  ['account-a', 'account-b', 'account-c', 'account-extra'],
  '账号组和补充账号应去重合并',
);

assert.doesNotThrow(() => assertMarketingContentReadyForPublish({
  title: '8月21日朋友圈内容包',
  contentType: 'MOMENTS',
  copywriting: '今天的朋友圈文案',
  platforms: ['微信'],
  status: 'APPROVED',
}));
assert.throws(() => assertMarketingContentReadyForPublish({
  title: '未审核内容',
  contentType: 'GRAPHIC',
  copywriting: '图文内容',
  platforms: ['小红书'],
  status: 'DRAFT',
}), /审核通过/);
assert.throws(() => assertMarketingContentReadyForPublish({
  title: '短视频',
  contentType: 'SHORT_VIDEO',
  copywriting: '视频文案',
  platforms: ['抖音'],
  status: 'APPROVED',
}), /视频链接/);
