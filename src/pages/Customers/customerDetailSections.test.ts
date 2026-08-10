import assert from 'node:assert/strict';
import {
  CUSTOMER_DETAIL_SECTION_DEFAULTS,
  editableCustomerDetailSections,
  normalizeCustomerDetailSectionState,
} from './customerDetailSections';

assert.deepEqual(CUSTOMER_DETAIL_SECTION_DEFAULTS, {
  basic: true,
  attribution: false,
  platform: false,
  ownership: false,
});
assert.deepEqual(normalizeCustomerDetailSectionState({ basic: false, platform: true, unknown: true }), {
  basic: false,
  attribution: false,
  platform: true,
  ownership: false,
});
assert.deepEqual(editableCustomerDetailSections(CUSTOMER_DETAIL_SECTION_DEFAULTS), {
  basic: true,
  attribution: true,
  platform: false,
  ownership: true,
});

console.log('customer detail section tests passed');
