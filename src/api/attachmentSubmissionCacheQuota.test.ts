import assert from 'node:assert/strict';
import { clearBackendToken, writeBackendToken } from './backendClient';
import { orderReviewApi } from './orderReviewApi';
import { recoveryOrderApi } from './recoveryOrderApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { OrderApplication } from '../types/order';
import type { RecoveryOrder } from '../types/recoveryOrder';

const values = new Map<string, string>();
const quotaKeys = new Set<string>([
  STORAGE_KEYS.ORDER_APPLICATIONS,
  STORAGE_KEYS.RECOVERY_ORDERS,
]);
const storage = {
  get length() { return values.size; },
  key: (index: number) => Array.from(values.keys())[index] ?? null,
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (quotaKeys.has(key) && value.includes('data:image/')) {
      throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
    }
    values.set(key, value);
  },
  removeItem: (key: string) => values.delete(key),
  clear: () => values.clear(),
};
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const originalFetch = globalThis.fetch;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;
const now = '2026-07-15T08:00:00.000Z';
const image = 'data:image/png;base64,large-screenshot';

const orderData: OrderApplication['orderData'] = {
  customerId: 'customer-cache-quota',
  customerName: '截图订单客户',
  productName: '2980课程',
  productLevel: '课程',
  orderType: '成交线索',
  amount: 2980,
  actualAmount: 2980,
  paymentMethod: '银行转账',
  status: '待确认',
  refundStatus: '无',
  owner: '系统管理员',
  payments: [{
    id: 'payment-cache-quota',
    amount: 2980,
    paymentMethod: '银行转账',
    paidAt: now,
    voucherName: '付款截图.png',
    voucherPreview: image,
  }],
  dealEvidenceName: '成交路径.png',
  dealEvidencePreview: image,
};

const application: OrderApplication = {
  id: 'oa-cache-quota',
  applicationNo: 'OAPP-CACHE-QUOTA',
  status: '待财务审核',
  orderData,
  applicantId: 'user-admin',
  applicantName: '系统管理员',
  submittedAt: now,
  reviewLogs: [],
  createdAt: now,
  updatedAt: now,
};

const recovery: RecoveryOrder = {
  id: 'recovery-cache-quota',
  recoveryNo: 'RCV-CACHE-QUOTA',
  customerId: '',
  customerName: '截图挽回客户',
  thirdPartyOrderNo: 'THIRD-CACHE-QUOTA',
  customerMatchStatus: '手工填写',
  originalProduct: '2980课程',
  originalAmount: 2980,
  recoveryAmount: 66,
  paymentVoucher: '收款凭证.png',
  paymentVoucherName: '收款凭证.png',
  paymentVoucherPreview: image,
  chatEvidence: '聊天截图.png',
  chatEvidenceName: '聊天截图.png',
  chatEvidencePreview: image,
  recoveryUserId: 'user-admin',
  recoveryUserName: '系统管理员',
  status: '待审核',
  settlementStatus: '未分账',
  commissionIds: [],
  createdBy: 'user-admin',
  createdByName: '系统管理员',
  createdAt: now,
  updatedAt: now,
};

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  storage.clear();
  storage.setItem(STORAGE_KEYS.ORDER_APPLICATIONS, '[]');
  storage.setItem(STORAGE_KEYS.RECOVERY_ORDERS, '[]');
  writeBackendToken('cache-quota-token');

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    const data = url.endsWith('/order-applications') ? application : recovery;
    return new Response(JSON.stringify({ code: 0, data, message: 'success' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const orderResult = await orderReviewApi.submitOrderApplication(orderData);
  assert.equal(orderResult.code, 0, '浏览器缓存已满不能覆盖后端提交成功结果');
  assert.equal(orderResult.data?.orderData.payments[0]?.voucherPreview, image);
  assert.doesNotMatch(storage.getItem(STORAGE_KEYS.ORDER_APPLICATIONS) || '', /data:image\//);

  const recoveryResult = await recoveryOrderApi.createRecoveryOrder({
    ...recovery,
    createdBy: 'user-admin',
    createdByName: '系统管理员',
  });
  assert.equal(recoveryResult.code, 0, '浏览器缓存已满不能覆盖售后挽回提交成功结果');
  assert.equal(recoveryResult.data?.chatEvidencePreview, image);
  assert.doesNotMatch(storage.getItem(STORAGE_KEYS.RECOVERY_ORDERS) || '', /data:image\//);
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
