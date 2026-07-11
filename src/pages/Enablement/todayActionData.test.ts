import assert from 'node:assert/strict';
import {
  TODAY_ACTION_DEMO,
  getEnablementHomePresentation,
  getNextMentorDemoOpen,
  resolveEnablementHomeView,
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
assert.equal(resolveEnablementHomeView(null, true), 'learning');
assert.equal(resolveEnablementHomeView('learning', true), 'learning');
assert.equal(resolveEnablementHomeView('management', true), 'management');
assert.equal(resolveEnablementHomeView('management', false), 'learning');
assert.equal(resolveEnablementHomeView('unknown', true), 'learning');
assert.deepEqual(
  ['learning', 'management', 'learning'].map((view) => resolveEnablementHomeView(view, true)),
  ['learning', 'management', 'learning'],
);
assert.equal(getEnablementHomePresentation(true, true).showKnowledgeCta, true);
assert.equal(getEnablementHomePresentation(true, false).showKnowledgeCta, false);
assert.equal(getNextMentorDemoOpen(false), true);
assert.equal(getNextMentorDemoOpen(true), false);
assert.match(TODAY_ACTION_DEMO.mentorDemoMessage, /演示数据/);
assert.match(TODAY_ACTION_DEMO.mentorDemoMessage, /未调用真实AI/);
