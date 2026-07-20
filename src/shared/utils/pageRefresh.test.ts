import assert from 'node:assert/strict';
import { subscribePageRefresh } from './pageRefresh';

class VisibilityTarget extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
}

const windowTarget = new EventTarget();
const documentTarget = new VisibilityTarget();
let refreshCount = 0;

const unsubscribe = subscribePageRefresh(
  () => { refreshCount += 1; },
  windowTarget,
  documentTarget,
);

windowTarget.dispatchEvent(new Event('focus'));
assert.equal(refreshCount, 1, '窗口重新聚焦时应刷新页面数据');

windowTarget.dispatchEvent(new Event('pageshow'));
assert.equal(refreshCount, 2, '浏览器恢复历史页面时应刷新页面数据');

documentTarget.visibilityState = 'hidden';
documentTarget.dispatchEvent(new Event('visibilitychange'));
assert.equal(refreshCount, 2, '页面处于后台时不应触发刷新');

documentTarget.visibilityState = 'visible';
documentTarget.dispatchEvent(new Event('visibilitychange'));
assert.equal(refreshCount, 3, '页面从后台恢复时应刷新页面数据');

unsubscribe();
windowTarget.dispatchEvent(new Event('focus'));
windowTarget.dispatchEvent(new Event('pageshow'));
documentTarget.dispatchEvent(new Event('visibilitychange'));
assert.equal(refreshCount, 3, '组件卸载后必须移除刷新监听');
