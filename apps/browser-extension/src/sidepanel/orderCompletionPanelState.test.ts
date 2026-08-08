import assert from 'node:assert/strict';
import {
  completionAttemptSnapshot,
  completionPanelReducer,
  createCompletionPanelState,
  isCompletionFormLocked,
} from './orderCompletionPanelState';

const oldContext = {
  supported: true,
  pageUrl: 'https://fxg.jinritemai.com/old',
  customerDisplayName: '旧客户',
  platformOrderNo: 'ORDER-OLD',
  orderStatus: '已付款',
  productName: '旧商品',
  messages: [],
  diagnostics: [],
};
const newContext = {
  ...oldContext,
  pageUrl: 'https://fxg.jinritemai.com/new',
  customerDisplayName: '新客户',
  platformOrderNo: 'ORDER-NEW',
  productName: '新商品',
};
const sync = {
  syncId: 'sync-old',
  outcome: 'CREATED' as const,
  lead: { id: 'lead-old', name: '旧客户' },
  orderRemarkStatus: 'FAILED' as const,
  greenFlagStatus: 'NOT_ATTEMPTED' as const,
};

let state = createCompletionPanelState();
state = completionPanelReducer(state, {
  type: 'RECOGNIZE_CONTEXT',
  context: oldContext,
  detectedContact: { phone: '13826459812', wechat: 'old_wechat' },
});
state = completionPanelReducer(state, { type: 'SET_CONTACT_CONFIRMED', value: true });
state = completionPanelReducer(state, {
  type: 'APPLY_COMPLETION',
  completion: {
    stage: 'PLATFORM_FAILED',
    osStatus: 'SUCCEEDED',
    orderRemarkStatus: 'FAILED',
    greenFlagStatus: 'NOT_ATTEMPTED',
    intakeResult: sync,
    remarkText: '#旧客户/13826459812\n#入OS',
    message: '平台处理失败',
  },
});

assert.equal(isCompletionFormLocked(state), true);
const lockedState = completionPanelReducer(state, {
  type: 'SET_FORM_FIELD',
  field: 'phone',
  value: '13900000000',
});
assert.equal(lockedState.form.phone, '13826459812', '已有 syncId 时不得修改联系快照');
assert.equal(completionPanelReducer(state, {
  type: 'SET_FORM_FIELD', field: 'source', value: 'OFF_PLATFORM',
}).form.source, 'CHAT', '已有 syncId 时不得修改联系来源');
assert.equal(completionPanelReducer(state, {
  type: 'SET_CONTACT_CONFIRMED', value: false,
}).contactConfirmed, true, '已有 syncId 时确认快照应锁定');

const lockedOldConversation = state;
state = completionPanelReducer(state, {
  type: 'RECOGNIZE_CONTEXT',
  context: newContext,
  detectedContact: null,
});

assert.equal(state.context?.platformOrderNo, 'ORDER-NEW');
assert.deepEqual(state.form, { name: '新客户', phone: '', wechat: '', source: 'OFF_PLATFORM' });
assert.equal(state.contactConfirmed, false);
assert.equal(state.sync, null);
assert.equal(state.completion, null);
assert.equal(state.remarkText, '');
assert.equal(isCompletionFormLocked(state), false);

state = completionPanelReducer(state, { type: 'SET_FORM_FIELD', field: 'phone', value: '13700000000' });
state = completionPanelReducer(state, { type: 'SET_CONTACT_CONFIRMED', value: true });
assert.deepEqual(completionAttemptSnapshot(state), {
  expectedOrderNo: 'ORDER-NEW',
  expectedCustomerDisplayName: '新客户',
  phone: '13700000000',
  wechat: undefined,
  source: 'OFF_PLATFORM',
  existingIntake: undefined,
}, '会话切换后的第二次尝试只能使用新会话快照');

const detectedReset = completionPanelReducer(lockedOldConversation, {
  type: 'RECOGNIZE_CONTEXT',
  context: { ...newContext, platformOrderNo: 'ORDER-DETECTED' },
  detectedContact: { phone: '13600000000', wechat: 'new_wechat' },
});
assert.deepEqual(detectedReset.form, {
  name: '新客户',
  phone: '13600000000',
  wechat: 'new_wechat',
  source: 'CHAT',
}, '新会话只能采用新识别到的联系方式');
assert.equal(detectedReset.sync, null);

console.log('order completion panel state: ok');
