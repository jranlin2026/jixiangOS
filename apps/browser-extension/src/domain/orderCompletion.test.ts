import assert from 'node:assert/strict';
import { buildOsRemarkLines, isPaidOrderStatus, mergeOsOrderRemark } from './orderCompletion';

const input = { nickname: '悠然一刻', phone: '13826459812', wechat: 'wx_user88' };
assert.deepEqual(buildOsRemarkLines(input), ['#悠然一刻/13826459812', '#入OS']);
assert.equal(mergeOsOrderRemark('', input), '#悠然一刻/13826459812\n#入OS');
assert.equal(
  mergeOsOrderRemark('#入EC\n#销售：小王', input),
  '#入EC\n#销售：小王\n#悠然一刻/13826459812\n#入OS',
);
assert.equal(
  mergeOsOrderRemark('#悠然一刻/13826459812\n#入OS', input),
  '#悠然一刻/13826459812\n#入OS',
);
assert.deepEqual(
  buildOsRemarkLines({ nickname: '悠然一刻', phone: '', wechat: 'wx_user88' }),
  ['#悠然一刻/wx_user88', '#入OS'],
);
assert.throws(() => buildOsRemarkLines({ nickname: '', phone: '', wechat: '' }), /昵称/);
assert.equal(isPaidOrderStatus('已付款'), true);
assert.equal(isPaidOrderStatus('待发货'), true);
assert.equal(isPaidOrderStatus('已关闭（售后完成）'), false);
assert.equal(isPaidOrderStatus('退款成功'), false);
assert.equal(isPaidOrderStatus(''), false);
console.log('browser order completion domain: ok');
