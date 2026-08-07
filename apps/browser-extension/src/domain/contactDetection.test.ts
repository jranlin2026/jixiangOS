import assert from 'node:assert/strict';
import { detectContact } from './contactDetection';

assert.deepEqual(detectContact([
  { direction: 'OUTBOUND', text: '可以联系老师13900139000' },
  { direction: 'INBOUND', text: '我的手机号138 0013 8000，姓张' },
]), {
  phone: '13800138000',
  source: 'CHAT',
  messageIndex: 1,
});

assert.deepEqual(detectContact([
  { direction: 'INBOUND', text: '订单号 138001380001234，这不是手机号' },
]), null, '不能从更长的订单号中截取手机号');

assert.deepEqual(detectContact([
  { direction: 'INBOUND', text: '我的微信号：zhang-laoshi_88' },
]), {
  wechat: 'zhang-laoshi_88',
  source: 'CHAT',
  messageIndex: 0,
});

console.log('browser extension contact detection: ok');
