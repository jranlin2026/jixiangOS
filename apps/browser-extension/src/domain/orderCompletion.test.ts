import assert from 'node:assert/strict';
import { isPaidOrderStatus, mergeOsOrderRemark } from './orderCompletion';

const remarkLines: [string, string] = [
  '#悠然一刻/手机号：13826459812/微信号：wx_user88（对接：销售小王）',
  '#入OS（2026-08-08 21:00）',
];

assert.equal(mergeOsOrderRemark('', remarkLines), remarkLines.join('\n'));
assert.equal(
  mergeOsOrderRemark('#入EC\n#销售：小王', remarkLines),
  `#入EC\n#销售：小王\n${remarkLines.join('\n')}`,
);
assert.equal(
  mergeOsOrderRemark(remarkLines.join('\n'), remarkLines),
  remarkLines.join('\n'),
  '同一备注重复执行必须幂等',
);
assert.equal(
  mergeOsOrderRemark(`原备注\n${remarkLines[0]}`, remarkLines),
  `原备注\n${remarkLines[0]}\n${remarkLines[1]}`,
  '仅追加缺失的完整行',
);
assert.equal(
  mergeOsOrderRemark(`原备注包含子串 ${remarkLines[0]} 但不是完整行`, remarkLines),
  `原备注包含子串 ${remarkLines[0]} 但不是完整行\n${remarkLines.join('\n')}`,
  '子串命中不得被当成完整行',
);
assert.equal(
  mergeOsOrderRemark(`原备注\r\n${remarkLines[1]}\r\n`, remarkLines),
  `原备注\r\n${remarkLines[1]}\r\n${remarkLines[0]}`,
  'CRLF 和原有尾随换行必须保留',
);
assert.equal(
  mergeOsOrderRemark('原备注\n\n', remarkLines),
  `原备注\n\n${remarkLines.join('\n')}`,
  '原有空白行必须保留',
);
assert.equal(
  mergeOsOrderRemark('   ', remarkLines),
  `   \n${remarkLines.join('\n')}`,
  '非空字符的空白原文不得被清理',
);

const once = mergeOsOrderRemark('#原备注\r\n', remarkLines);
assert.equal(mergeOsOrderRemark(once, remarkLines), once);

assert.equal(isPaidOrderStatus('已付款'), true);
assert.equal(isPaidOrderStatus('待发货'), true);
assert.equal(isPaidOrderStatus('已关闭（售后完成）'), false);
assert.equal(isPaidOrderStatus('退款成功'), false);
assert.equal(isPaidOrderStatus(''), false);
console.log('browser order completion domain: ok');
