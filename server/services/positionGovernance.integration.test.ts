import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createPositionGovernanceService } from './positionGovernance';

if (!process.env.DATABASE_URL) {
  console.log('position governance integration skipped: DATABASE_URL is not set');
} else {
  const databaseUrl = new URL(process.env.DATABASE_URL);
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ''));
  if (!['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)) {
    throw new Error('position governance integration requires a loopback MySQL host');
  }
  if (!/(?:_qa|_test)(?:_|$)/i.test(databaseName)) {
    throw new Error('position governance integration requires an isolated _qa or _test database');
  }

  const prisma = new PrismaClient();
  const runId = randomUUID();
  const departmentIds = [`qa-preview-sales-${runId}`, `qa-preview-service-${runId}`];
  const positionIds = [
    `qa-preview-consultant-${runId}`,
    `qa-preview-manager-a-${runId}`,
    `qa-preview-manager-b-${runId}`,
  ];
  const userIds = [
    `qa-preview-unique-${runId}`,
    `qa-preview-conflict-${runId}`,
    `qa-preview-multiple-${runId}`,
    `qa-preview-missing-${runId}`,
  ];
  let batchId: string | undefined;

  try {
    await prisma.department.createMany({ data: [
      { id: departmentIds[0], name: '销售部', code: `qa_sales_${runId}` },
      { id: departmentIds[1], name: '客户成功部', code: `qa_service_${runId}` },
    ] });
    await prisma.position.createMany({ data: [
      { id: positionIds[0], name: '销售顾问', code: `qa_consultant_${runId}`, departmentId: departmentIds[0] },
      { id: positionIds[1], name: '销售主管', code: `qa_manager_a_${runId}`, departmentId: departmentIds[0] },
      { id: positionIds[2], name: '销售主管', code: `qa_manager_b_${runId}`, departmentId: departmentIds[0] },
    ] });
    await prisma.user.createMany({ data: [
      { id: userIds[0], name: `预览唯一-${runId}`, email: `${userIds[0]}@example.test`, phone: '', role: '销售', departmentId: departmentIds[0], positionName: '销售顾问' },
      { id: userIds[1], name: `预览冲突-${runId}`, email: `${userIds[1]}@example.test`, phone: '', role: '客服', departmentId: departmentIds[1], positionName: '销售顾问' },
      { id: userIds[2], name: `预览多选-${runId}`, email: `${userIds[2]}@example.test`, phone: '', role: '销售', departmentId: departmentIds[0], positionName: '销售主管' },
      { id: userIds[3], name: `预览缺失-${runId}`, email: `${userIds[3]}@example.test`, phone: '', role: '销售', departmentId: departmentIds[0], positionName: '未知岗位' },
    ] });

    const service = createPositionGovernanceService(prisma);
    const preview = await service.createPreview(
      { search: runId, employmentStatus: 'active' },
      { id: 'qa-admin', name: '集成测试管理员' },
    );
    assert.equal(preview.code, 0);
    assert.ok(preview.data);
    batchId = preview.data.id;
    assert.equal(preview.data.totalCount, 4);
    assert.deepEqual(
      preview.data.items.map((item: any) => item.matchStatus).sort(),
      ['DEPARTMENT_CONFLICT', 'MULTIPLE_MATCHES', 'NO_MATCH', 'UNIQUE_MATCH'].sort(),
    );

    const [unchangedUsers, historyCount] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { positionId: true } }),
      prisma.employeePositionHistory.count({ where: { employeeId: { in: userIds } } }),
    ]);
    assert.equal(unchangedUsers.length, 4);
    assert.ok(unchangedUsers.every((user) => user.positionId === null), '生成预览不得回填员工岗位');
    assert.equal(historyCount, 0, '生成预览不得写入岗位历史');
    console.log('position governance preview integration: ok');
  } finally {
    if (batchId) await prisma.positionMappingBatch.deleteMany({ where: { id: batchId } });
    await prisma.employeePositionHistory.deleteMany({ where: { employeeId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.position.deleteMany({ where: { id: { in: positionIds } } });
    await prisma.department.deleteMany({ where: { id: { in: departmentIds } } });
    await prisma.$disconnect();
  }
}
