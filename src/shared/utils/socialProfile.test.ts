import assert from 'node:assert/strict';
import {
  formatSocialProfileSummary,
  normalizeOptionalSocialProfileValue,
} from './socialProfile';

assert.equal(normalizeOptionalSocialProfileValue('  极享AI  ', '抖音昵称'), '极享AI');
assert.equal(normalizeOptionalSocialProfileValue('   ', '微信昵称'), undefined);
assert.throws(
  () => normalizeOptionalSocialProfileValue('a'.repeat(101), '抖音号'),
  /抖音号不能超过100个字符/,
);
assert.throws(
  () => normalizeOptionalSocialProfileValue('第一行\n第二行', '微信昵称'),
  /微信昵称不能包含换行/,
);
assert.equal(
  formatSocialProfileSummary({ wechatNickname: '王总', douyinNickname: '极享AI' }),
  '微信：王总 · 抖音：极享AI',
);
assert.equal(
  formatSocialProfileSummary({ wechat: 'wx_001', douyinId: 'dy_001' }),
  '微信：wx_001 · 抖音：dy_001',
);
assert.equal(formatSocialProfileSummary({}), '暂未填写社交账号');

console.log('social profile tests passed');
