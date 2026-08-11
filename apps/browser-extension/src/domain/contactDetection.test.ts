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

assert.deepEqual(detectContact([
  { direction: 'OUTBOUND', text: '客服电话 13900000000' },
  { direction: 'INBOUND', text: '激活电话 138 2645 9812' },
]), { phone: '13826459812', source: 'CHAT', messageIndex: 1 });

assert.equal(detectContact([
  { direction: 'OUTBOUND', text: '微信号：service_888' },
]), null);

assert.deepEqual(detectContact([
  { direction: 'INBOUND', text: '我的微信是 user_name88' },
]), { wechat: 'user_name88', source: 'CHAT', messageIndex: 0 });

assert.deepEqual(detectContact([
  { direction: 'INBOUND', text: '我的微信为 user_name88' },
]), { wechat: 'user_name88', source: 'CHAT', messageIndex: 0 });

assert.deepEqual(detectContact([
  { direction: 'INBOUND', text: '前面还有历史消息' },
  { direction: 'INBOUND', text: 'G762528ffhh' },
  { direction: 'INBOUND', text: '微信' },
]), { wechat: 'G762528ffhh', source: 'CHAT', messageIndex: 1 }, '微信号在前、微信标签在后的连续消息也应识别');

assert.deepEqual(detectContact([
  { direction: 'INBOUND', text: '微信号' },
  { direction: 'INBOUND', text: 'user_name88' },
]), { wechat: 'user_name88', source: 'CHAT', messageIndex: 1 }, '微信标签在前、微信号在后的连续消息也应识别');

assert.equal(detectContact([
  { direction: 'INBOUND', text: 'G762528ffhh' },
  { direction: 'INBOUND', text: '然后呢' },
]), null, '没有相邻微信标签时不能把普通英文数字消息误判为微信号');

assert.equal(detectContact([
  { direction: 'INBOUND', text: 'G762528ffhh' },
  { direction: 'OUTBOUND', text: '微信' },
]), null, '客服发出的微信标签不能为客户消息背书');

console.log('browser extension contact detection: ok');
