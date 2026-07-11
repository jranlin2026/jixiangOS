import assert from 'node:assert/strict';
import {
  TODAY_ACTION_DEMO,
  getEnablementHomePresentation,
} from './todayActionData';

assert.equal(TODAY_ACTION_DEMO.demo, true);
assert.equal(TODAY_ACTION_DEMO.currentDay, 3);
assert.equal(TODAY_ACTION_DEMO.days.length, 7);
assert.equal(TODAY_ACTION_DEMO.days.filter((day) => day.status === 'done').length, 2);
assert.equal(TODAY_ACTION_DEMO.days.filter((day) => day.status === 'current').length, 1);
assert.equal(TODAY_ACTION_DEMO.tasks.length, 3);
assert.equal(TODAY_ACTION_DEMO.managementItems.length, 3);
assert.equal(getEnablementHomePresentation(false).showManagementSwitch, false);
assert.equal(getEnablementHomePresentation(true).showManagementSwitch, true);
assert.equal(getEnablementHomePresentation(true).managementCount, 5);
