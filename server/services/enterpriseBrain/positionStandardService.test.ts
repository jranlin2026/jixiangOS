import assert from 'node:assert/strict';
import { createPositionStandardService } from './positionStandardService';
import { createMemoryPositionStandardRepository } from './positionStandardRepository';
import type { AuthenticatedUser } from '../../../src/types/auth';
import { PERMISSION_KEYS } from '../../../src/shared/utils/permissions';

const admin: AuthenticatedUser = {
  id: 'admin', name: '管理员', account: 'admin', email: '', phone: '', role: '超级管理员',
  permissions: [{ module: '全部', actions: ['read', 'write', 'delete', 'admin'] }], isActive: true,
};
const employee: AuthenticatedUser = {
  id: 'sales-1', name: '销售甲', account: 'sales-1', email: '', phone: '', role: '销售顾问',
  positionId: 'pos-sales-consultant', departmentId: 'dept-sales-one',
  permissions: [{ module: PERMISSION_KEYS.STANDARD_READ, actions: ['read'] }], isActive: true,
};

const repository = createMemoryPositionStandardRepository({
  positions: [{ id: 'pos-sales-consultant', name: '销售顾问', isActive: true }],
  knowledgeVersions: [{ id: 'knowledge-v1', title: '价格异议处理', status: 'CURRENT', effectiveAt: null, expiresAt: null }],
});
const service = createPositionStandardService({ repository, now: () => new Date('2026-07-29T08:00:00.000Z') });

const draft = await service.saveDraft({
  positionId: 'pos-sales-consultant',
  title: '销售顾问岗位标准',
  mission: '帮助客户识别问题并完成适合的方案选择',
  goals: ['稳定完成成交目标'],
  dailyActions: ['跟进客户', '更新CRM'],
  kpis: ['有效联系率', '成交率'],
  workflow: ['领取线索', '联系客户', '需求诊断', '方案沟通', '成交复盘'],
  speechTemplates: ['先确认客户问题，再说明价值'],
  faq: ['客户认为AI没用时，先追问具体业务场景'],
  knowledgeVersionIds: ['knowledge-v1'],
}, admin);
assert.equal(draft.code, 0);

const hiddenBeforePublish = await service.getMyStandard(employee);
assert.equal(hiddenBeforePublish.code, 404, '草稿不能出现在员工当前标准入口');

const published = await service.publish(draft.data!.version.id, admin);
assert.equal(published.code, 0);

const visible = await service.getMyStandard(employee);
assert.equal(visible.code, 0);
assert.equal(visible.data?.positionName, '销售顾问');
assert.equal(visible.data?.version.versionNumber, 1);
assert.equal(visible.data?.resources[0]?.knowledgeVersionId, 'knowledge-v1');

const secondDraft = await service.saveDraft({
  positionId: 'pos-sales-consultant', title: '销售顾问岗位标准 V2', mission: '持续帮助客户获得结果',
  goals: ['提升客户结果'], dailyActions: ['跟进客户'], kpis: ['客户结果率'], workflow: ['跟进'],
  speechTemplates: [], faq: [], knowledgeVersionIds: ['knowledge-v1'],
}, admin);
assert.equal(secondDraft.data?.version.versionNumber, 2);
const stillCurrent = await service.getMyStandard(employee);
assert.equal(stillCurrent.data?.version.versionNumber, 1, '新草稿不能覆盖当前生效版本');
assert.equal(stillCurrent.data?.title, '销售顾问岗位标准', '草稿标题也不能泄露到员工当前标准');

console.log('position standard service tests passed');
