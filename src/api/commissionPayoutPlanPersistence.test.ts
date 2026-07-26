import assert from 'node:assert/strict';
import { commissionRuleApi } from './commissionRuleApi';
import { STORAGE_KEYS } from '../shared/utils/constants';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    get length() { return values.size; },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  },
});

const originalFetch = globalThis.fetch;
const originalBackendFlag = process.env.VITE_USE_BACKEND_API;
process.env.VITE_USE_BACKEND_API = 'true';
values.set(STORAGE_KEYS.INITIALIZED, 'true');
values.set(STORAGE_KEYS.COMMISSION_RULES, JSON.stringify([]));
values.set(STORAGE_KEYS.COMMISSION_ROLE_CONFIGS, JSON.stringify([]));

let releaseWrite: (() => void) | undefined;
globalThis.fetch = async (_input, init) => {
  assert.equal(init?.method, 'PUT');
  return new Promise<Response>((resolve) => {
    releaseWrite = () => resolve(new Response(JSON.stringify({
      code: 0,
      data: true,
      message: 'success',
    }), { headers: { 'content-type': 'application/json' } }));
  });
};

try {
  const save = commissionRuleApi.createCommissionPayoutPlan({
    name: '待持久化的提成方案',
    commissionType: 'fixed',
    commissionValue: 120,
    isActive: true,
    description: '只有服务器确认后才能报告保存成功',
  });

  const earlyResult = await Promise.race([
    save.then(() => 'settled'),
    new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 220)),
  ]);
  releaseWrite?.();

  assert.equal(earlyResult, 'pending', '提成方案不得在服务器写入完成前报告成功');
  const response = await save;
  assert.equal(response.code, 0);

  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 0,
    data: true,
    message: 'success',
  }), { headers: { 'content-type': 'application/json' } });

  const updatedResponse = await commissionRuleApi.updateCommissionPayoutPlan(response.data.id, {
    ...response.data,
    commissionValue: 180,
  });
  assert.equal(updatedResponse.code, 0);
  assert.equal(updatedResponse.data?.version, 2, '修改算法后必须生成下一版本');
  assert.equal(updatedResponse.data?.revisions?.length, 1, '修改算法后必须保留上一版本');
  assert.equal(updatedResponse.data?.revisions?.[0]?.version, 1);
  assert.equal(updatedResponse.data?.revisions?.[0]?.commissionValue, 120);
  assert.ok(updatedResponse.data?.revisions?.[0]?.effectiveTo, '历史版本必须记录结束生效时间');

  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 403,
    data: null,
    message: '无权保存提成方案',
  }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });

  const rejectedUpdate = await commissionRuleApi.updateCommissionPayoutPlan(response.data.id, {
    ...updatedResponse.data!,
    name: '不应留在缓存里的名称',
  });
  assert.notEqual(rejectedUpdate.code, 0, '服务器拒绝写入时页面必须报告失败');
  const cachedPlans = JSON.parse(values.get(STORAGE_KEYS.COMMISSION_PAYOUT_PLANS) || '[]') as Array<{ name: string }>;
  assert.equal(cachedPlans.some((plan) => plan.name === '不应留在缓存里的名称'), false);
} finally {
  releaseWrite?.();
  globalThis.fetch = originalFetch;
  if (originalBackendFlag === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalBackendFlag;
}
