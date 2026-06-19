import assert from 'node:assert/strict';
import { leadApi } from './leadApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { Lead } from '../types/lead';

const storage = (() => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

const now = '2026-06-18T12:00:00.000Z';
const lead: Lead = {
  id: 'lead-test',
  name: '测试线索',
  company: '测试公司',
  phone: '13900000000',
  wechat: 'wx-test',
  source: '直播部',
  sourceName: '抖音02',
  sourceType: '公司资源',
  status: '新线索' as Lead['status'],
  lifecycleStatus: '已转订单',
  intakeStatus: '入库成功',
  inputBy: '张伟',
  assignedTo: '王磊',
  owner: '王磊',
  createdAt: now,
  updatedAt: now,
  followUpRecords: [],
};

storage.clear();
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([lead]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));

const res = await leadApi.updateLead('lead-test', { assignedTo: '李娜', owner: '李娜' });
assert.equal(res.code, 0);
assert.ok(res.data);

const updated = res.data as Lead & {
  changeHistory?: Array<{
    action: string;
    summary: string;
    operator: string;
    changes?: Array<{ field: string; label: string; oldValue?: unknown; newValue?: unknown }>;
  }>;
};

assert.equal(updated.assignedTo, '李娜');
assert.equal(updated.owner, '李娜');
assert.equal(updated.changeHistory?.length, 1);
assert.equal(updated.changeHistory?.[0].action, 'update');
assert.equal(updated.changeHistory?.[0].operator, '李娜');
assert.match(updated.changeHistory?.[0].summary || '', /分配销售/);
assert.deepEqual(updated.changeHistory?.[0].changes?.find((item) => item.field === 'assignedTo'), {
  field: 'assignedTo',
  label: '分配销售',
  oldValue: '王磊',
  newValue: '李娜',
});

const createRes = await leadApi.createLead({
  name: '无隐藏字段线索',
  company: '干净数据公司',
  phone: '13900009999',
  wechat: '',
  source: '直播部',
  sourceName: '抖音01',
  sourceType: '公司资源',
  status: '新线索',
  inputBy: '张伟',
  owner: '待分配',
  industry: '',
  city: '',
  tags: [],
  remark: '',
});

assert.equal(createRes.code, 0);
assert.ok(createRes.data);
assert.equal(createRes.data?.email, undefined);
assert.equal(createRes.data?.estimatedAmount, undefined);
