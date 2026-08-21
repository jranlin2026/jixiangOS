import assert from 'node:assert/strict';
import {
  assertMarketingContentReadyForPublish,
  expandMarketingAccountSelection,
  filterSupplementalMarketingAccounts,
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

assert.deepEqual(
  filterSupplementalMarketingAccounts(
    [
      { id: 'account-a', name: '组内账号' },
      { id: 'account-b', name: '可补充账号' },
    ],
    ['group-wechat'],
    [{ id: 'group-wechat', accountIds: ['account-a'] }],
  ),
  [{ id: 'account-b', name: '可补充账号' }],
  '已被所选账号组包含的账号不应再出现在补充账号候选中',
);

assert.deepEqual(
  filterSupplementalMarketingAccounts(
    [{ id: 'account-a', name: '取消分组后可见' }],
    [],
    [{ id: 'group-wechat', accountIds: ['account-a'] }],
  ),
  [{ id: 'account-a', name: '取消分组后可见' }],
  '取消账号组选择后账号应恢复到补充候选',
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
