import assert from 'node:assert/strict';
import { selectNextDeliveryAssignee } from './deliveryAssignmentPolicy';
import type { DeliveryAssignmentConfig, DeliveryAssignmentUser } from '../../src/types/deliveryAssignment';

const user = (id: string, patch: Partial<DeliveryAssignmentUser> = {}): DeliveryAssignmentUser => ({
  id,
  name: `客户成功${id.toUpperCase()}`,
  isActive: true,
  employmentStatus: 'active',
  ...patch,
});

const config = (
  ids: string[],
  lastAssignedUserId?: string,
  pausedIds: string[] = [],
): DeliveryAssignmentConfig => ({
  enabled: true,
  participants: ids.map((userId) => ({ userId, paused: pausedIds.includes(userId) })),
  lastAssignedUserId,
});

const users = ['a', 'b', 'c'].map((id) => user(id));

assert.equal(selectNextDeliveryAssignee(config(['a', 'b', 'c']), users)?.user.id, 'a');
assert.equal(selectNextDeliveryAssignee(config(['a', 'b', 'c'], 'a'), users)?.user.id, 'b');
assert.equal(selectNextDeliveryAssignee(config(['a', 'b', 'c'], 'c'), users)?.user.id, 'a');
assert.equal(selectNextDeliveryAssignee(config(['a', 'b', 'c'], 'a', ['b']), users)?.user.id, 'c');
assert.equal(selectNextDeliveryAssignee(config(['a']), [user('a', { isActive: false })]), null);
assert.equal(selectNextDeliveryAssignee(config(['a']), [user('a', { employmentStatus: 'left' })]), null);
assert.equal(selectNextDeliveryAssignee({ enabled: false, participants: [{ userId: 'a', paused: false }] }, users), null);
assert.equal(selectNextDeliveryAssignee(config(['missing']), users), null);
