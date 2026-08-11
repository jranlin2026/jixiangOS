import assert from 'node:assert/strict';
import {
  LEAD_DETAIL_SECTION_DEFAULTS,
  LEAD_DETAIL_SECTION_STORAGE_KEY,
  editableLeadDetailSections,
  normalizeLeadDetailSectionState,
} from './leadDetailSections';
import { CUSTOMER_DETAIL_SECTION_STORAGE_KEY } from '../Customers/customerDetailSections';

assert.notEqual(LEAD_DETAIL_SECTION_STORAGE_KEY, CUSTOMER_DETAIL_SECTION_STORAGE_KEY);
assert.deepEqual(LEAD_DETAIL_SECTION_DEFAULTS, {
  basic: true,
  social: false,
  attribution: false,
  platform: false,
  ownership: false,
});
assert.deepEqual(normalizeLeadDetailSectionState({ basic: false, social: true }), {
  basic: false,
  social: true,
  attribution: false,
  platform: false,
  ownership: false,
});
assert.deepEqual(editableLeadDetailSections(LEAD_DETAIL_SECTION_DEFAULTS), {
  basic: true,
  social: true,
  attribution: false,
  platform: false,
  ownership: false,
});

console.log('lead detail section tests passed');
