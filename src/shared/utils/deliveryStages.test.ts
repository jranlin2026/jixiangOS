import assert from 'node:assert/strict';
import type { DeliveryTask } from '../../types/delivery';
import { resolveLatestCompletedDeliveryStage } from './deliveryStages';

const task = (title: string, completed: boolean): DeliveryTask => ({
  id: `task-${title}`,
  title,
  description: title,
  status: completed ? '已完成' : '待开始',
  completedAt: completed ? '2026-07-16T00:00:00.000Z' : undefined,
  records: [],
});

const stages = ['step-1', 'step-2', 'step-3', 'step-4', 'step-5'];
assert.equal(resolveLatestCompletedDeliveryStage(stages, [
  task('step-4', true),
  task('step-1', true),
  task('step-5', false),
]), 'step-4', 'task array order must not affect the latest completed stage');
assert.equal(resolveLatestCompletedDeliveryStage(stages, stages.map((stage) => task(stage, false))), 'step-1');
