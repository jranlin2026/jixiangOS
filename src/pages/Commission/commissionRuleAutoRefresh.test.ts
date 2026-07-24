import assert from 'node:assert/strict';
import test from 'node:test';
import { subscribeCommissionRuleAutoRefresh } from './commissionRuleAutoRefresh';

class VisibilityTarget extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
}

test('其他账号更新后，页面重新聚焦或轮询时会刷新提成配置', () => {
  const windowTarget = new EventTarget();
  const documentTarget = new VisibilityTarget();
  let intervalHandler: (() => void) | undefined;
  let cleared = false;
  let refreshCount = 0;
  const timerTarget = {
    setInterval: (handler: () => void) => {
      intervalHandler = handler;
      return 1;
    },
    clearInterval: () => {
      cleared = true;
      intervalHandler = undefined;
    },
  };

  const unsubscribe = subscribeCommissionRuleAutoRefresh(
    () => { refreshCount += 1; },
    { windowTarget, documentTarget, timerTarget, intervalMs: 10_000 },
  );

  windowTarget.dispatchEvent(new Event('focus'));
  assert.equal(refreshCount, 1, '返回管理员页面时应立即拉取最新配置');

  intervalHandler?.();
  assert.equal(refreshCount, 2, '页面保持打开时应定时拉取最新配置');

  documentTarget.visibilityState = 'hidden';
  intervalHandler?.();
  assert.equal(refreshCount, 2, '页面不可见时不应继续发起后台轮询');

  unsubscribe();
  assert.equal(cleared, true);
  windowTarget.dispatchEvent(new Event('focus'));
  assert.equal(refreshCount, 2, '卸载后应移除刷新订阅');
});
