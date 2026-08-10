import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createRoot } from 'react-dom/client';
import { ScriptLibrarySection } from './ScriptLibrarySection';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const view = {
  library: {
    schemaVersion: 1 as const,
    revision: 1,
    groups: [{
      id: 'paid', name: '付款用户', enabled: true, sortOrder: 1,
      scripts: [{
        id: 'paid-script', title: '确认收货', content: '需要激活的📞码是哪个', enabled: true, sortOrder: 1, priority: 1,
        match: { orderStatuses: ['已付款'], productKeywords: [], contactState: 'ANY' as const },
      }],
    }, {
      id: 'after-sale', name: '售后服务', enabled: true, sortOrder: 2,
      scripts: [{
        id: 'after-sale-script', title: '售后登记', content: '已经为您登记售后需求。', enabled: true, sortOrder: 1, priority: 1,
        match: { orderStatuses: [], productKeywords: [], contactState: 'ANY' as const },
      }],
    }],
    updatedAt: '', updatedBy: { id: 'u1', name: '管理员' },
  },
  canManage: true,
};

const root = createRoot(document.getElementById('root')!);
let refreshCalls = 0;
await act(async () => {
  root.render(<ScriptLibrarySection view={view} onFill={() => undefined} onManage={() => undefined} onRefresh={() => { refreshCalls += 1; }} onRetry={() => undefined} />);
});

const scriptActionLabels = [...document.querySelectorAll<HTMLButtonElement>('.script-actions button')].map((button) => button.textContent);
assert.deepEqual(scriptActionLabels, ['刷新话术', '话术设置'], '刷新话术应位于话术设置左侧');
await act(async () => { document.querySelector<HTMLButtonElement>('.script-refresh')?.click(); });
assert.equal(refreshCalls, 1, '点击刷新话术应触发重新加载');
assert.equal(document.body.textContent?.includes('常用'), false);
assert.equal(document.body.textContent?.includes('查看全部话术'), false);
assert.equal(document.querySelector('.script-all') !== null, true);
const paidRecommendation = document.querySelector('.primary-recommendation')?.textContent || '';
assert.match(paidRecommendation, /付款用户 · 推荐话术/);
assert.equal(paidRecommendation.match(/需要激活的📞码是哪个/g)?.length, 1, '推荐话术正文只显示一次');
assert.doesNotMatch(paidRecommendation, /确认收货/);
assert.doesNotMatch(document.querySelector('.script-grid')?.textContent || '', /需要激活的📞码是哪个/, '已推荐的话术不在下方重复展示');

const afterSaleTab = [...document.querySelectorAll<HTMLButtonElement>('.script-tabs button')]
  .find((button) => button.textContent === '售后服务');
assert.ok(afterSaleTab);
await act(async () => { afterSaleTab.click(); });
const afterSaleRecommendation = document.querySelector('.primary-recommendation')?.textContent || '';
assert.match(afterSaleRecommendation, /售后服务 · 推荐话术/);
assert.equal(afterSaleRecommendation.match(/已经为您登记售后需求。/g)?.length, 1, '切换分组后正文仍只显示一次');
assert.doesNotMatch(afterSaleRecommendation, /售后登记/);
assert.doesNotMatch(afterSaleRecommendation, /需要激活的📞码是哪个/);
assert.doesNotMatch(document.querySelector('.script-grid')?.textContent || '', /已经为您登记售后需求/, '切换分组后也不重复展示推荐话术');

await act(async () => { root.unmount(); });
console.log('browser script library simplified interaction: ok');
