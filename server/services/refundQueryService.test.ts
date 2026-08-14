import assert from 'node:assert/strict';
import test from 'node:test';
import { createRefundQueryService } from './refundQueryService';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';

const actor: any = { id: 'sales-1', name: '销售甲', role: '销售', roleId: 'role-1', departmentId: 'dept-1', isActive: true, permissions: [] };
const order = (id: string, salesId: string, status = '已确认') => ({
  id, orderNo: `ORD-${id}`, customerId: `C-${id}`, customerName: `客户-${id}`, productLevel: '899',
  amount: 999, actualAmount: 999, status, refundStatus: status === '已退款' ? '退款已完成' : '无', owner: '销售甲', salesId,
  salesName: salesId === 'sales-1' ? '销售甲' : '销售乙', payments: [], refundAmount: 300,
  createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-14T02:00:00.000Z',
});

test('refund query applies order row scope and includes visible legacy refunded orders', async () => {
  const rows = [
    { domain: STORAGE_KEYS.ORDERS, recordId: 'visible', data: order('visible', 'sales-1', '已退款') },
    { domain: STORAGE_KEYS.ORDERS, recordId: 'hidden', data: order('hidden', 'sales-2', '已退款') },
    { domain: STORAGE_KEYS.REFUNDS, recordId: 'hidden-refund', data: {
      id: 'hidden-refund', orderId: 'hidden', status: '退款已完成', refundedAt: '2026-08-14T02:00:00.000Z',
    } },
  ];
  const prisma: any = {
    user: { findMany: async () => [{ ...actor, account: 'sales', email: '', phone: '', roleId: 'role-1', employmentStatus: 'active', createdAt: new Date(), updatedAt: new Date() }] },
    role: { findMany: async () => [{
      id: 'role-1', name: '销售', code: 'sales', description: null, departmentId: 'dept-1', permissions: [],
      dataScopes: { orders: 'self' }, memberCount: 1, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    }] },
    department: { findMany: async () => [] },
    businessRecord: { findMany: async () => rows },
  };
  const result = await createRefundQueryService(prisma).list({ status: '退款已完成', startDate: '2026-08-14', endDate: '2026-08-14' }, actor);
  assert.equal(result.code, 0);
  assert.deepEqual(result.data?.items.map((item) => item.id), ['legacy-refund-visible']);
});
