import assert from 'node:assert/strict';
import { leadFlowApi } from './leadFlowApi';
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
  id: 'lead-flow-test',
  name: '流转线索',
  company: '测试公司',
  phone: '13900000001',
  wechat: 'wx-flow',
  source: '直播部',
  sourceName: '抖音02',
  sourceType: '公司资源',
  status: '新线索',
  lifecycleStatus: '待跟进',
  intakeStatus: '待分配',
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

const res = await leadFlowApi.manualAssignLead('lead-flow-test', '李娜');
assert.equal(res.code, 0);
assert.ok(res.data);
assert.equal(res.data?.assignedTo, '李娜');
assert.equal(res.data?.owner, '李娜');
assert.equal(res.data?.changeHistory?.[0].summary, '修改了分配销售');
assert.deepEqual(res.data?.changeHistory?.[0].changes?.[0], {
  field: 'assignedTo',
  label: '分配销售',
  oldValue: '王磊',
  newValue: '李娜',
});

storage.setItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS, JSON.stringify([]));
const intake = leadFlowApi.intakeLead({
  name: '完整来源线索',
  company: '来源测试公司',
  phone: '13900000002',
  wechat: '',
  source: '直播部',
  sourceName: '抖音02',
  sourceType: '公司资源',
  status: '新线索',
  inputBy: '张伟',
  owner: '张伟',
  industry: '',
  city: '',
  tags: [],
  remark: '',
});
assert.ok(intake.lead);

const records = JSON.parse(storage.getItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS) || '[]');
assert.equal(records[0]?.source, '直播部-抖音02');
