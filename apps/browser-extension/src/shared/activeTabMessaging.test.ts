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

let completionCommand: unknown;
const completionInput = {
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: [
    '#悠然一刻/手机号：13826459812/微信号：wx_user88（对接：销售小王）',
    '#入OS（2026-08-08 21:00）',
  ] as [string, string],
};
const completionResult = await activeTabCommand({
  type: 'COMPLETE_FEIGE_OS_ORDER',
  input: completionInput,
}, {
  tabs: {
    async query() {
      return [{ id: 10, url: 'https://fxg.jinritemai.com/ffa/morder/order/list' }];
    },
    async sendMessage(_tabId: number, command: unknown) {
      completionCommand = command;
      return {
        ok: true,
        remarkText: completionInput.remarkLines.join('\n'),
        remarkStatus: 'SUCCEEDED',
        greenFlagStatus: 'SUCCEEDED',
      };
    },
  },
  scripting: bridge.scripting,
} as any);
assert.deepEqual(completionCommand, {
  type: 'COMPLETE_FEIGE_OS_ORDER',
  input: completionInput,
}, '飞鸽订单完成参数应原样转发到当前页面');
assert.deepEqual(completionResult, {
  ok: true,
  remarkText: completionInput.remarkLines.join('\n'),
  remarkStatus: 'SUCCEEDED',
  greenFlagStatus: 'SUCCEEDED',
});

console.log('active tab messaging recovery: ok');
