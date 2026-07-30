import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { CommissionCorrectionPreview } from '../../src/types/commission';
import { createCommissionCorrectionService, persistCommissionCorrection } from './commissionCorrectionService';

const admin: AuthenticatedUser = {
  id: 'admin', name: '超级管理员', account: 'admin', email: '', phone: '', role: '超级管理员',
  roleId: 'super-admin', departmentId: 'admin', permissions: [{ module: '全部', actions: ['admin'] }], isActive: true,
};
const finance: AuthenticatedUser = {
  ...admin, id: 'finance', name: '财务', role: '财务', roleId: 'finance-role',
  permissions: [{ module: PERMISSION_KEYS.FINANCE_PAYOUT, actions: ['read', 'write'] }],
};

type Row = { domain: string; recordId: string; data: any; status?: string; eventAt?: Date; createdAt?: Date; [key: string]: any };
const key = (domain: string, recordId: string) => `${domain}:${recordId}`;
class FakePrisma {
  rows = new Map<string, Row>();
  businessRecord = {
    findMany: async ({ where }: any) => [...this.rows.values()]
      .filter((row) => row.domain === where.domain)
      .filter((row) => !where.recordId?.in || where.recordId.in.includes(row.recordId)),
    findUnique: async ({ where }: any) => this.rows.get(key(where.domain_recordId.domain, where.domain_recordId.recordId)) || null,
    create: async ({ data }: any) => {
      const rowKey = key(data.domain, data.recordId);
      if (this.rows.has(rowKey)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
      this.rows.set(rowKey, structuredClone(data));
      return data;
    },
    update: async ({ where, data }: any) => {
      const rowKey = key(where.domain_recordId.domain, where.domain_recordId.recordId);
      const current = this.rows.get(rowKey);
      if (!current) throw new Error('missing row');
      const next = { ...current, ...structuredClone(data) };
      this.rows.set(rowKey, next);
      return next;
    },
  };
  async $transaction<T>(callback: (transaction: any) => Promise<T>): Promise<T> {
    return callback({
      businessRecord: this.businessRecord,
      $queryRaw: async (query: any) => {
        const values = Array.isArray(query?.values) ? query.values : [];
        const row = this.rows.get(key(String(values[0] || ''), String(values[1] || '')));
        return row ? [structuredClone(row)] : [];
      },
    });
  }
}

const preview = (kind: '补发' | '追回'): CommissionCorrectionPreview => ({
  sourceBusinessType: 'formal_order', sourceBusinessId: 'order-1', sourceBusinessNo: 'ORD-1', sourceRevision: 'rev-1',
  beforeBusinessSnapshot: { actualAmount: 1000 }, afterBusinessSnapshot: { actualAmount: kind === '补发' ? 1200 : 800 },
  affectedPeriods: ['2026-07'], affectedEmployeeCount: 1, affectedCommissionCount: 1,
  originalPaidAmount: 100, correctedEntitlementAmount: kind === '补发' ? 120 : 80,
  supplementAmount: kind === '补发' ? 20 : 0, recoverAmount: kind === '追回' ? 20 : 0,
  impacts: [{
    id: 'impact-1', sourceCommissionId: 'commission-1', role: '销售', originalOwnerId: 'sales-1', originalOwner: '销售A',
    correctedOwnerId: 'sales-1', correctedOwner: '销售A', originalPeriod: '2026-07', correctedPeriod: '2026-07',
    originalPaidAmount: 100, correctedEntitlementAmount: kind === '补发' ? 120 : 80,
    deltaAmount: kind === '补发' ? 20 : -20, action: kind, payoutRecordIds: ['payout-1'],
  }],
  legs: [{
    id: 'same-leg-id', impactId: 'impact-1', kind, ownerId: 'sales-1', owner: '销售A', departmentId: 'sales', department: '销售部',
    role: '销售', period: '2026-07', amount: 20, sourceCommissionIds: ['commission-1'], status: kind === '补发' ? '待发放' : '待处理',
  }],
  impactHash: `hash-${kind}`,
});

{
  const prisma = new FakePrisma();
  const tx = { businessRecord: prisma.businessRecord } as any;
  await persistCommissionCorrection(tx, preview('补发'), '第一次', admin, { id: 'correction-1', now: '2026-07-30T10:00:00.000Z' });
  await persistCommissionCorrection(tx, preview('补发'), '第二次', admin, { id: 'correction-2', now: '2026-07-30T11:00:00.000Z' });
  const supplements = [...prisma.rows.values()].filter((row) => row.domain === STORAGE_KEYS.COMMISSIONS);
  assert.equal(supplements.length, 2, '不同更正单即使 leg ID 相同，也不得冲突或覆盖补发提成');
  assert.notEqual(supplements[0].recordId, supplements[1].recordId);
  supplements.forEach((row) => {
    row.status = '已撤回';
    row.data = { ...row.data, status: '已撤回' };
  });
  const cancelledList = await createCommissionCorrectionService(prisma as any).list({ page: 1, pageSize: 10 }, finance);
  assert.equal(cancelledList.data?.summary.pendingSupplementAmount, 0, '已撤回的补发提成不得继续计入待补发');
  assert.equal(cancelledList.data?.items.every((item) => item.legs[0].status === '已取消'), true);
}

{
  const prisma = new FakePrisma();
  const tx = { businessRecord: prisma.businessRecord } as any;
  const record = await persistCommissionCorrection(tx, preview('追回'), '金额更正', admin, { id: 'correction-negative', now: '2026-07-30T10:00:00.000Z' });
  const service = createCommissionCorrectionService(prisma as any);
  const denied = await service.completeLeg(record.id, record.legs[0].id, { method: '线下追回', amount: 20, note: '已收回' }, finance);
  assert.equal(denied.code, 403, '差额处理 API 必须仅超级管理员可写');
  const partial = await service.completeLeg(record.id, record.legs[0].id, { method: '线下追回', amount: 10, note: '仅追回一部分' }, admin);
  assert.equal(partial.code, 400, '当前没有部分处理状态时，不得将部分金额误标为全部已处理');
  const invalidWaiver = await service.completeLeg(record.id, record.legs[0].id, { method: '财务确认无需追回', amount: 10, note: '审批免追' }, admin);
  assert.equal(invalidWaiver.code, 400, '无需追回必须以0元留痕');
  const invalidAmount = await service.completeLeg(record.id, record.legs[0].id, { method: '线下追回', amount: Number.NaN, note: '非法金额' }, admin);
  assert.equal(invalidAmount.code, 400, '非有限金额必须被拒绝');
  const completed = await service.completeLeg(record.id, record.legs[0].id, { method: '线下追回', amount: 20, note: '已核对银行收款' }, admin);
  assert.equal(completed.code, 0, completed.message);
  assert.equal(completed.data?.legs[0].status, '已处理');
  const list = await service.list({ page: 1, pageSize: 10 }, finance);
  assert.equal(list.code, 0, list.message);
  assert.equal(list.data?.items[0].status, '已处理');
}

console.log('commission correction service tests passed');
