import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createPositionGovernanceService } from './positionGovernance';

if (!process.env.DATABASE_URL) {
  console.log('position governance integration skipped: DATABASE_URL is not set');
} else {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(process.env.DATABASE_URL);
  } catch {
    throw new Error('position governance integration requires a valid DATABASE_URL');
  }
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ''));
  if (!['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)) {
    throw new Error('position governance integration requires a loopback MySQL host');
  }
  if (!/(?:_qa|_test)(?:_|$)/i.test(databaseName)) {
    throw new Error('position governance integration requires an isolated _qa or _test database');
  }

  const prisma = new PrismaClient();
  const runId = randomUUID();
  const nameSuffix = runId.slice(0, 8);
  const consultantName = `销售顾问-${nameSuffix}`;
  const managerName = `销售主管-${nameSuffix}`;
  const missingName = `未知岗位-${nameSuffix}`;
  const actorId = `qa-admin-${runId}`;
  const departmentIds = [`qa-preview-sales-${runId}`, `qa-preview-service-${runId}`];
  const positionIds = [
    `qa-preview-consultant-${runId}`,
    `qa-preview-manager-a-${runId}`,
    `qa-preview-manager-b-${runId}`,
    `qa-preview-service-${runId}`,
    `qa-preview-assistant-${runId}`,
  ];
  const userIds = [
    `qa-preview-unique-${runId}`,
    `qa-preview-conflict-${runId}`,
    `qa-preview-multiple-${runId}`,
    `qa-preview-missing-${runId}`,
  ];

  try {
    await prisma.department.createMany({ data: [
      { id: departmentIds[0], name: '销售部', code: `qa_sales_${runId}` },
      { id: departmentIds[1], name: '客户成功部', code: `qa_service_${runId}` },
    ] });
    await prisma.position.createMany({ data: [
      { id: positionIds[0], name: consultantName, code: `qa_consultant_${runId}`, departmentId: departmentIds[0] },
      { id: positionIds[1], name: managerName, code: `qa_manager_a_${runId}`, departmentId: departmentIds[0] },
      { id: positionIds[2], name: managerName, code: `qa_manager_b_${runId}`, departmentId: departmentIds[0] },
      { id: positionIds[3], name: `客户成功顾问-${nameSuffix}`, code: `qa_service_position_${runId}`, departmentId: departmentIds[1] },
      { id: positionIds[4], name: `销售助理-${nameSuffix}`, code: `qa_assistant_${runId}`, departmentId: departmentIds[0] },
    ] });
    await prisma.user.createMany({ data: [
      { id: userIds[0], name: `预览唯一-${runId}`, email: `${userIds[0]}@example.test`, phone: '', role: '销售', departmentId: departmentIds[0], positionName: consultantName },
      { id: userIds[1], name: `预览冲突-${runId}`, email: `${userIds[1]}@example.test`, phone: '', role: '客服', departmentId: departmentIds[1], positionName: consultantName },
      { id: userIds[2], name: `预览多选-${runId}`, email: `${userIds[2]}@example.test`, phone: '', role: '销售', departmentId: departmentIds[0], positionName: managerName },
      { id: userIds[3], name: `预览缺失-${runId}`, email: `${userIds[3]}@example.test`, phone: '', role: '销售', departmentId: departmentIds[0], positionName: missingName },
    ] });
    const beforeUsers = await prisma.user.findMany({ where: { id: { in: userIds } }, orderBy: { id: 'asc' } });

    const service = createPositionGovernanceService(prisma);
    const beforeBatchCount = await prisma.positionMappingBatch.count();
    const readiness = await service.getReadiness({ search: runId, employmentStatus: 'active', page: 1, pageSize: 2 });
    assert.equal(readiness.code, 0);
    assert.ok(readiness.data);
    assert.equal(readiness.data.total, 4);
    assert.equal(readiness.data.items.length, 2, '盘点必须遵循服务端分页');
    assert.deepEqual(readiness.data.summary, {
      total: 4,
      boundValid: 0,
      invalidBinding: 0,
      uniqueMatch: 1,
      multipleMatches: 1,
      departmentConflict: 1,
      noMatch: 1,
      rolePositionSuspected: 0,
    });
    assert.equal(await prisma.positionMappingBatch.count(), beforeBatchCount, '只读盘点不得创建映射批次');

    const preview = await service.createPreview(
      { search: runId, employmentStatus: 'active' },
      { id: actorId, name: '集成测试管理员' },
    );
    assert.equal(preview.code, 0);
    assert.ok(preview.data);
    assert.equal(preview.data.totalCount, 4);
    assert.deepEqual(
      preview.data.items.map((item: any) => item.matchStatus).sort(),
      ['DEPARTMENT_CONFLICT', 'MULTIPLE_MATCHES', 'NO_MATCH', 'UNIQUE_MATCH'].sort(),
    );

    const [afterUsers, historyCount] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, orderBy: { id: 'asc' } }),
      prisma.employeePositionHistory.count({ where: { employeeId: { in: userIds } } }),
    ]);
    assert.deepEqual(afterUsers, beforeUsers, '生成预览不得修改员工表中的任何字段');
    assert.equal(historyCount, 0, '生成预览不得写入岗位历史');

    const pendingReconciliation = await service.getReconciliation(preview.data.id, { page: 1, pageSize: 2 });
    const pendingData: any = pendingReconciliation.data;
    assert.equal(pendingReconciliation.code, 0);
    assert.equal(pendingData.summary.passed, false);
    assert.equal(pendingData.summary.unresolvedCount, 4);
    assert.equal(pendingData.total, 4);
    assert.equal(pendingData.items.length, 2, '未完成明细必须使用服务端分页');

    const selections = [
      { employeeId: userIds[0], positionId: positionIds[0] },
      { employeeId: userIds[1], positionId: positionIds[3] },
      { employeeId: userIds[2], positionId: positionIds[1] },
      { employeeId: userIds[3], positionId: positionIds[4] },
    ];
    const applied = await service.applyBatch(preview.data.id, selections, { id: actorId, name: '集成测试管理员' });
    assert.equal(applied.code, 0);
    const appliedData: any = applied.data;
    assert.equal(appliedData?.status, 'APPLIED');
    assert.equal(appliedData?.appliedCount, 4);

    const reconciliation = await service.getReconciliation(preview.data.id, { page: 1, pageSize: 10 });
    assert.equal(reconciliation.code, 0);
    const reconciliationData: any = reconciliation.data;
    assert.deepEqual(reconciliationData?.summary, {
      totalCount: 4,
      existingEmployeeCount: 4,
      activeEmployeeCount: 4,
      coveredCount: 4,
      unresolvedCount: 0,
      historyCount: 4,
      departmentCountBefore: 2,
      departmentCountAfter: 2,
      coverageRate: 100,
      passed: true,
    });
    assert.deepEqual(reconciliationData?.items, []);

    const replay = await service.applyBatch(preview.data.id, selections, { id: actorId, name: '集成测试管理员' });
    assert.equal(replay.code, 0);
    assert.equal(await prisma.employeePositionHistory.count({ where: { employeeId: { in: userIds } } }), 4, '重复执行不得重复写入历史');
    console.log('position governance local exit integration: ok');
  } finally {
    await prisma.positionMappingBatch.deleteMany({ where: { createdById: actorId } });
    await prisma.employeePositionHistory.deleteMany({ where: { employeeId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.position.deleteMany({ where: { id: { in: positionIds } } });
    await prisma.department.deleteMany({ where: { id: { in: departmentIds } } });
    await prisma.$disconnect();
  }
}
