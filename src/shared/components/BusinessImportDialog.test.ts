import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import type { BusinessImportPrecheckResult, BusinessImportTemplateOptions, OrderImportRow } from '../../types/businessImport';
import type { BusinessImportDialogInitialState } from './BusinessImportDialog';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { default: BusinessImportDialog, isDefinitiveBusinessImportRejection } = await vite.ssrLoadModule('/src/shared/components/BusinessImportDialog.tsx') as {
  default: React.ComponentType<React.ComponentProps<any>>;
  isDefinitiveBusinessImportRejection: (code: number) => boolean;
};
assert.equal(isDefinitiveBusinessImportRejection(409), true, '明确的业务拒绝可以清理未绑定附件');
assert.equal(isDefinitiveBusinessImportRejection(504), false, '网关超时结果不确定，不能删除可能已入队的附件');
assert.equal(isDefinitiveBusinessImportRejection(-1), false, '网络异常结果不确定，不能删除附件');

const options: BusinessImportTemplateOptions = {
  products: [{ id: 'p1', name: '训练营' }], orderTypes: [{ id: 't1', name: '新购' }],
  paymentChannels: ['企业微信转账'], users: [{ id: 'u1', name: '销售甲' }],
  recoveryPlatforms: [], recoveryShops: [],
};
const row: OrderImportRow = {
  rowNumber: 2, customerName: '客户甲', customerPhone: '013800000001', customerWechat: '',
  productName: '训练营', orderType: '新购', paymentChannel: '企业微信转账', paymentAmount: 99,
  paidAt: '2026-07-24 10:30:00', salesUserName: '销售甲', thirdPartyOrderNo: '', remark: '',
};
const precheck = (status: 'warning' | 'blocked'): BusinessImportPrecheckResult => ({
  confirmationToken: 'token', expiresAt: '2026-07-24T10:00:00.000Z', totalCount: 1,
  readyCount: status === 'blocked' ? 0 : 1,
  warningCount: status === 'warning' ? 1 : 0,
  blockedCount: status === 'blocked' ? 1 : 0,
  rows: [{ rowNumber: 2, status, reason: status === 'blocked' ? '客户无法唯一匹配' : '将创建售后临时客户' }],
});
const mixedPrecheck: BusinessImportPrecheckResult = {
  confirmationToken: 'mixed-token', expiresAt: '2026-07-24T10:00:00.000Z', totalCount: 3,
  readyCount: 2, warningCount: 1, blockedCount: 1,
  rows: [
    { rowNumber: 2, status: 'ready', reason: '可导入' },
    { rowNumber: 3, status: 'warning', reason: '允许导入但需关注' },
    { rowNumber: 4, status: 'blocked', reason: '订单号重复' },
  ],
};
const mixedRows = [row, { ...row, rowNumber: 3 }, { ...row, rowNumber: 4 }];

function render(initialState: BusinessImportDialogInitialState, type: 'orders' | 'recovery_orders' = 'orders'): string {
  return renderToStaticMarkup(React.createElement(BusinessImportDialog, {
    open: true,
    type,
    onClose: () => undefined,
    tenantId: 'tenant-test',
    disablePortal: true,
    initialState,
  }));
}

function buttonContaining(html: string, label: string): string {
  return [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/gu)]
    .map((match) => match[0])
    .find((button) => button.includes(label)) || '';
}

const blocked = render({ options, file: { name: 'orders.xlsx' } as File, rows: [row], precheck: precheck('blocked') });
assert.match(blocked, /批量导入订单/);
assert.match(blocked, /已阻止/);
assert.match(blocked, /客户无法唯一匹配/);
const blockedConfirm = buttonContaining(blocked, '跳过 1 条并后台导入 0 条');
assert.match(blockedConfirm, /disabled=""/, 'blocked precheck must render a disabled confirm button');

for (const [type, fileName] of [['orders', 'orders.xlsx'], ['recovery_orders', 'recovery.xlsx']] as const) {
  const mixed = render({ options, file: { name: fileName } as File, rows: mixedRows, precheck: mixedPrecheck }, type);
  assert.match(mixed, /确认后将跳过被阻止记录，仅导入可导入记录/);
  const mixedConfirm = buttonContaining(mixed, '跳过 1 条并后台导入 2 条');
  assert.doesNotMatch(mixedConfirm, /disabled=""/, `${type} mixed precheck must allow eligible-only confirmation`);
}

const warning = render({ options, file: { name: 'recovery.xlsx' } as File, rows: [row], precheck: precheck('warning') }, 'recovery_orders');
assert.match(warning, /批量导入售后挽回订单/);
assert.match(warning, /警告/);
assert.match(warning, /将创建售后临时客户/);
const warningConfirm = buttonContaining(warning, '确认并后台导入 1 条');
assert.doesNotMatch(warningConfirm, /disabled=""/, 'warning-only precheck must render an enabled confirm button');
assert.match(warning, /下载标准模板/);
assert.match(warning, /下载错误报告/);

const partialFailure = render({
  job: {
    id: 'job-1', batchId: 'batch-1', type: 'orders', status: 'partial_failed', totalCount: 1, successCount: 0, failedCount: 1,
    rows: [{ rowNumber: 2, status: 'ready', reason: '可导入', normalized: row, executionStatus: 'failed', errorMessage: '执行失败' }],
  },
  storageWarning: '任务已创建，但浏览器未能保存恢复标识',
});
assert.match(partialFailure, /部分失败/);
assert.match(partialFailure, /执行失败/);
assert.match(partialFailure, /任务已创建，但浏览器未能保存恢复标识/);
assert.match(partialFailure, /下载错误报告/);

const previousWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const previousConsoleError = console.error;
const artificialBrowserWarnings: string[] = [];
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    location: { origin: 'https://tenant.example.test' },
    get localStorage() {
      throw new DOMException('blocked', 'SecurityError');
    },
  },
});
try {
  console.error = (...args: unknown[]) => { artificialBrowserWarnings.push(args.map(String).join(' ')); };
  const degradedStorage = render({ options });
  assert.match(degradedStorage, /浏览器存储不可用/);
  assert.match(degradedStorage, /当前窗口/);
  assert.ok(
    artificialBrowserWarnings.every((message) => message.includes('Invalid prop `children` supplied to `ForwardRef(Fade)`')),
    'the throwing storage getter must not produce unexpected SSR errors',
  );
} finally {
  console.error = previousConsoleError;
  if (previousWindowDescriptor) Object.defineProperty(globalThis, 'window', previousWindowDescriptor);
  else Reflect.deleteProperty(globalThis, 'window');
}

await vite.close();
console.log('BusinessImportDialog real SSR render: ok');
