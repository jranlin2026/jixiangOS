import assert from 'node:assert/strict';
import test from 'node:test';
import { inferMainlandMobileCity, completeCityFromPhone } from '../shared/utils/mobileCityAttribution';

test('inferMainlandMobileCity reads normalized China mobile numbers', () => {
  assert.equal(inferMainlandMobileCity('+8613328951873'), '昆明');
  assert.equal(inferMainlandMobileCity('13800001001'), '北京');
});

test('completeCityFromPhone only fills blank city and never overwrites manual city', () => {
  assert.equal(completeCityFromPhone('', '+8613328951873'), '昆明');
  assert.equal(completeCityFromPhone('上海', '+8613328951873'), '上海');
  assert.equal(completeCityFromPhone('', '+441234567890'), '');
});
