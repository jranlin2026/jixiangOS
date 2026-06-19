import assert from 'node:assert/strict';
import type { Lead } from '../../types/lead';
import { canEditLeadProfile } from './leadDetailRules';

const baseLead: Lead = {
  id: 'lead-rule-test',
  name: 'Rule Test',
  company: '',
  phone: '13800000000',
  source: 'Website',
  status: '新线索',
  lifecycleStatusCode: 'pending_followup',
  lifecycleStatus: '待跟进',
  owner: '待分配',
  createdAt: '2026-06-19T00:00:00.000Z',
  updatedAt: '2026-06-19T00:00:00.000Z',
  followUpRecords: [],
};

assert.equal(canEditLeadProfile(baseLead), true);
assert.equal(canEditLeadProfile({ ...baseLead, customerId: 'cust-1' }), false);
assert.equal(canEditLeadProfile({ ...baseLead, lifecycleStatusCode: 'following', lifecycleStatus: '跟进中' }), false);
assert.equal(canEditLeadProfile({ ...baseLead, customerId: 'cust-1', lifecycleStatusCode: 'following', lifecycleStatus: '跟进中' }), false);
