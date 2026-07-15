import assert from 'node:assert/strict';
import { createDeliveryAssignmentService } from './deliveryAssignmentService';
import type { DeliveryAssignmentConfig } from '../../src/types/deliveryAssignment';

let stored: DeliveryAssignmentConfig | null = null;
const users = [
  { id: 'a', name: '客户成功A', isActive: true, employmentStatus: 'active' },
  { id: 'b', name: '客户成功B', isActive: true, employmentStatus: 'active' },
  { id: 'left', name: '已离职', isActive: true, employmentStatus: 'left' },
];

const appStorage = {
  async findUnique() {
    return stored ? { key: 'delivery', value: stored } : null;
  },
  async upsert(input: any) {
    if (!stored) stored = input.create.value;
    return { key: 'delivery', value: stored };
  },
  async update(input: any) {
    stored = input.data.value;
    return { key: 'delivery', value: stored };
  },
};
const prisma = {
  appStorage,
  user: { async findMany() { return users; } },
  async $queryRaw() { return stored ? [{ value: stored }] : []; },
};

const service = createDeliveryAssignmentService(prisma as any);
assert.deepEqual((await service.getConfig()).data, {
  enabled: false,
  participants: [],
  participantViews: [],
  nextAssigneeId: undefined,
  nextAssigneeName: undefined,
});

const actor = { id: 'admin', name: '管理员' } as any;
assert.equal((await service.saveConfig({
  enabled: true,
  participants: [
    { userId: 'a', paused: false },
    { userId: 'b', paused: false },
    { userId: 'left', paused: false },
  ],
}, actor)).code, 0);

assert.equal((await service.assignNext(prisma as any, '2026-07-15T10:00:00.000Z'))?.ownerId, 'a');
assert.equal((await service.assignNext(prisma as any, '2026-07-15T10:01:00.000Z'))?.ownerId, 'b');
assert.equal((stored as unknown as DeliveryAssignmentConfig).lastAssignedUserId, 'b');

const view = await service.getConfig();
assert.equal(view.data?.participantViews.find((item) => item.userId === 'left')?.status, 'left');
assert.equal(view.data?.nextAssigneeId, 'a');

const duplicate = await service.saveConfig({
  enabled: true,
  participants: [{ userId: 'a', paused: false }, { userId: 'a', paused: true }],
}, actor);
assert.equal(duplicate.code, 400);
