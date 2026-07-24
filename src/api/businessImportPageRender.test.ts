import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import type { AuthenticatedUser } from '../types/auth';

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
});

const user = (permissions: AuthenticatedUser['permissions']): AuthenticatedUser => ({
  id: 'render-user',
  name: '渲染用户',
  account: 'render',
  email: 'render@example.com',
  phone: '',
  role: '测试角色',
  roleId: 'render-role',
  departmentId: 'render-dept',
  isActive: true,
  permissions,
});
const noop = () => undefined;
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { default: BusinessImportEntryButton } = await vite.ssrLoadModule('/src/shared/components/BusinessImportEntryButton.tsx') as any;
const { default: BusinessImportReviewControls } = await vite.ssrLoadModule('/src/shared/components/BusinessImportReviewControls.tsx') as any;
const { PERMISSION_KEYS } = await vite.ssrLoadModule('/src/shared/utils/permissions.ts') as any;

const orderImporter = renderToStaticMarkup(React.createElement(BusinessImportEntryButton, {
  type: 'orders',
  active: true,
  user: user([{ module: PERMISSION_KEYS.ORDER_IMPORT, actions: ['read', 'write'] }]),
  onClick: noop,
}));
assert.match(orderImporter, />导入订单</);
assert.equal(renderToStaticMarkup(React.createElement(BusinessImportEntryButton, {
  type: 'orders',
  active: true,
  user: user([{ module: PERMISSION_KEYS.ORDER_MANAGE, actions: ['read'] }]),
  onClick: noop,
})), '');
assert.equal(renderToStaticMarkup(React.createElement(BusinessImportEntryButton, {
  type: 'orders',
  active: false,
  user: user([{ module: PERMISSION_KEYS.ORDER_IMPORT, actions: ['read', 'write'] }]),
  onClick: noop,
})), '', 'the import entry is absent from review tabs');

const recoveryImporter = renderToStaticMarkup(React.createElement(BusinessImportEntryButton, {
  type: 'recovery_orders',
  active: true,
  user: user([{ module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_IMPORT, actions: ['read', 'write'] }]),
  onClick: noop,
}));
assert.match(recoveryImporter, />导入售后挽回订单</);
assert.equal(renderToStaticMarkup(React.createElement(BusinessImportEntryButton, {
  type: 'recovery_orders',
  active: true,
  user: user([{ module: PERMISSION_KEYS.AFTER_SALES_RECOVERY, actions: ['read'] }]),
  onClick: noop,
})), '');

const batchControls = renderToStaticMarkup(React.createElement(BusinessImportReviewControls, {
  module: 'orders',
  importBatchId: 'batch-render',
  selection: { mode: 'batch', importBatchId: 'batch-render' },
  canReview: true,
  onSelectionChange: noop,
  onRefresh: noop,
}));
assert.match(batchControls, /已选择批次 batch-render 的全部待审记录/);
assert.match(batchControls, />批量通过</);
assert.match(batchControls, />批量退回</);
assert.match(batchControls, />批量驳回</);
assert.doesNotMatch(batchControls, /disabled=""[^>]*>[\s\S]*批量通过/);

const manualOnlyControls = renderToStaticMarkup(React.createElement(BusinessImportReviewControls, {
  module: 'recovery_orders',
  importBatchId: '',
  selection: { mode: 'ids', ids: [] },
  canReview: true,
  onSelectionChange: noop,
  onRefresh: noop,
}));
const approveButton = [...manualOnlyControls.matchAll(/<button[^>]*>[\s\S]*?<\/button>/gu)]
  .map((match) => match[0])
  .find((button) => button.includes('批量通过')) || '';
assert.match(approveButton, /disabled=""/, 'bulk review stays disabled without imported selections');

console.log('business import entry and bulk controls real render: ok');
await vite.close();
