import assert from 'node:assert/strict';
import { activeTabCommand } from './activeTabMessaging';

let sendCount = 0;
let injected = false;
const bridge = {
  tabs: {
    async query() {
      return [{ id: 7, url: 'https://fxg.jinritemai.com/ffa/morder/order/list' }];
    },
    async sendMessage() {
      sendCount += 1;
      if (sendCount === 1) throw new Error('Could not establish connection. Receiving end does not exist.');
      return { ok: false, code: 'EXPECTED_AFTER_INJECTION', message: 'connected' };
    },
  },
  scripting: {
    async executeScript() {
      injected = true;
      return [];
    },
  },
} as any;

const recovered = await activeTabCommand({ type: 'READ_FEIGE_CONTEXT' }, bridge);
assert.equal(injected, true, '没有接收端时应自动注入页面读取程序');
assert.equal(sendCount, 2, '注入后应自动重试原指令');
assert.equal('code' in recovered && recovered.code, 'EXPECTED_AFTER_INJECTION');

await assert.rejects(
  () => activeTabCommand({ type: 'READ_FEIGE_CONTEXT' }, {
    ...bridge,
    tabs: { ...bridge.tabs, query: async () => [{ id: 8, url: 'http://127.0.0.1:3000/' }] },
  } as any),
  /请先打开抖店飞鸽客服会话/,
);

let appendedCommand: unknown;
const appendResult = await activeTabCommand({
  type: 'APPEND_FEIGE_REPLY',
  text: '补充话术',
  expectedOrderNo: 'ORDER-9',
  expectedCustomerDisplayName: '王先生',
}, {
  tabs: {
    async query() {
      return [{ id: 9, url: 'https://fxg.jinritemai.com/ffa/morder/order/list' }];
    },
    async sendMessage(_tabId: number, command: unknown) {
      appendedCommand = command;
      return { ok: true };
    },
  },
  scripting: bridge.scripting,
} as any);
assert.deepEqual(appendedCommand, {
  type: 'APPEND_FEIGE_REPLY',
  text: '补充话术',
  expectedOrderNo: 'ORDER-9',
  expectedCustomerDisplayName: '王先生',
}, '人工选择的话术应作为追加命令发送到飞鸽页面');
assert.deepEqual(appendResult, { ok: true });

console.log('active tab messaging recovery: ok');
