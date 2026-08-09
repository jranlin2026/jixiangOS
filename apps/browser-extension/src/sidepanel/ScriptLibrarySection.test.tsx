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
        id: 'paid-script', title: '付款确认', content: '已收到您的付款。', enabled: true, sortOrder: 1, priority: 1,
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
  canManage: false,
};

const root = createRoot(document.getElementById('root')!);
await act(async () => {
  root.render(<ScriptLibrarySection view={view} onFill={() => undefined} onManage={() => undefined} onRetry={() => undefined} />);
});

assert.equal(document.body.textContent?.includes('常用'), false);
assert.equal(document.body.textContent?.includes('查看全部话术'), false);
assert.equal(document.querySelector('.script-all') !== null, true);
assert.match(document.querySelector('.primary-recommendation')?.textContent || '', /付款确认/);

const afterSaleTab = [...document.querySelectorAll<HTMLButtonElement>('.script-tabs button')]
  .find((button) => button.textContent === '售后服务');
assert.ok(afterSaleTab);
await act(async () => { afterSaleTab.click(); });
assert.match(document.querySelector('.primary-recommendation')?.textContent || '', /售后登记/);
assert.doesNotMatch(document.querySelector('.primary-recommendation')?.textContent || '', /付款确认/);

await act(async () => { root.unmount(); });
console.log('browser script library simplified interaction: ok');
