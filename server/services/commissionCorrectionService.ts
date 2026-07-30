import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  Commission,
  CommissionCorrectionHandlingMethod,
  CommissionCorrectionPage,
  CommissionCorrectionPreview,
  CommissionCorrectionRecord,
} from '../../src/types/commission';

type CorrectionPrisma = Pick<PrismaClient, 'businessRecord' | '$transaction'>;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const clean = (value: unknown) => String(value ?? '').trim();

function parseRecord(value: unknown): CommissionCorrectionRecord {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object') throw new Error('提成更正记录数据损坏');
  return parsed as CommissionCorrectionRecord;
}

function supplementCommission(
  recordId: string,
  correctionId: string,
  preview: CommissionCorrectionPreview,
  leg: CommissionCorrectionRecord['legs'][number],
  reason: string,
  createdAt: string,
): Commission {
  const after = preview.afterBusinessSnapshot;
  const paymentDate = /^\d{4}-\d{2}$/.test(leg.period) ? `${leg.period}-01T00:00:00.000Z` : createdAt;
  return {
    id: recordId,
    orderId: preview.sourceBusinessId,
    orderNo: preview.sourceBusinessNo,
    customerName: clean(after.customerName) || '更正业务单',
    productLevel: (clean(after.productLevel || after.originalProductLevel || after.productName || after.originalProduct) || '更正差额') as Commission['productLevel'],
    orderAmount: Number(after.actualAmount ?? after.recoveryAmount ?? after.amount ?? 0),
    performanceAmount: 0,
    commissionRate: 0,
    commissionAmount: roundMoney(leg.amount),
    role: leg.role,
    ownerId: leg.ownerId,
    owner: leg.owner,
    departmentId: leg.departmentId,
    department: leg.department || '',
    paymentDate,
    status: '待确认',
    sourceType: '人工新增',
    sourceBusinessType: preview.sourceBusinessType,
    sourceRecoveryOrderId: preview.sourceBusinessType === 'after_sales_recovery' ? preview.sourceBusinessId : undefined,
    commissionType: preview.sourceBusinessType === 'after_sales_recovery' ? 'recovery' : 'sales',
    ruleCalculationType: 'fixed',
    correctionCaseId: correctionId,
    correctionImpactId: leg.impactId,
    correctionDeltaType: '补发',
    isManualAdjusted: true,
    adjustReason: reason,
    calculationNote: `发放后更正补发差额 ${roundMoney(leg.amount)} 元`,
    formulaText: `更正后应发与原已发的正差额：${roundMoney(leg.amount)} 元`,
    auditReason: `发放后更正：${reason}`,
    evidenceRequired: true,
    evidenceStatus: '需组长确认',
    proofStatus: '待补充',
    createdAt,
    updatedAt: createdAt,
  };
}

export async function persistCommissionCorrection(
  transaction: Prisma.TransactionClient,
  preview: CommissionCorrectionPreview,
  reason: string,
  actor: AuthenticatedUser,
  options: { id?: string; now?: string } = {},
): Promise<CommissionCorrectionRecord> {
  const id = options.id || randomUUID();
  const createdAt = options.now || new Date().toISOString();
  const correctionNo = `COR-${createdAt.slice(0, 10).replace(/-/g, '')}-${id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`;
  const legs = preview.legs.map((item) => ({ ...item }));
  for (const item of legs) {
    if (item.kind !== '补发' || item.amount <= 0) continue;
    const commissionId = `commission-correction-${id}-${item.id}`;
    const commission = supplementCommission(commissionId, id, preview, item, reason, createdAt);
    await transaction.businessRecord.create({ data: {
      id: `${STORAGE_KEYS.COMMISSIONS}:${commission.id}`,
      domain: STORAGE_KEYS.COMMISSIONS,
      recordId: commission.id,
      title: `${preview.sourceBusinessNo}-${commission.role}-补发`,
      status: commission.status,
      owner: commission.owner,
      orderId: preview.sourceBusinessId,
      amount: commission.commissionAmount,
      eventAt: new Date(commission.paymentDate || createdAt),
      data: jsonValue(commission),
    } });
    item.linkedCommissionId = commission.id;
    item.status = '待发放';
  }
  const record: CommissionCorrectionRecord = {
    ...preview,
    id,
    correctionNo,
    reason: clean(reason),
    legs,
    status: legs.length ? '待处理' : '无差额',
    createdById: actor.id,
    createdByName: actor.name,
    createdAt,
    updatedAt: createdAt,
  };
  await transaction.businessRecord.create({ data: {
    id: `${STORAGE_KEYS.COMMISSION_CORRECTIONS}:${record.id}`,
    domain: STORAGE_KEYS.COMMISSION_CORRECTIONS,
    recordId: record.id,
    title: `${record.correctionNo}-${record.sourceBusinessNo}`,
    status: record.status,
    owner: actor.name,
    orderId: record.sourceBusinessId,
    amount: roundMoney(record.supplementAmount - record.recoverAmount),
    eventAt: new Date(createdAt),
    data: jsonValue(record),
  } });
  return record;
}

function canRead(actor: AuthenticatedUser): boolean {
  return isSuperAdmin(actor) || hasPermission(actor, PERMISSION_KEYS.FINANCE_PAYOUT, 'read');
}

function canHandle(actor: AuthenticatedUser): boolean {
  return isSuperAdmin(actor);
}

export function resolveCommissionCorrectionStatuses(
  records: CommissionCorrectionRecord[],
  commissionStatusById: Map<string, string>,
): CommissionCorrectionRecord[] {
  return records.map((record) => {
    const legs = record.legs.map((item) => {
      if (!item.linkedCommissionId) return item;
      const status = commissionStatusById.get(item.linkedCommissionId);
      return {
        ...item,
        status: status === '已发放' ? '已处理' as const
          : ['已撤回', '已取消', '已冲销'].includes(status || '') ? '已取消' as const
            : '待发放' as const,
      };
    });
    const status = legs.length === 0 ? '无差额' as const
      : legs.every((item) => ['已处理', '已取消'].includes(item.status)) ? '已处理' as const
        : '待处理' as const;
    return { ...record, legs, status };
  });
}

export function createCommissionCorrectionService(prisma: CorrectionPrisma) {
  return {
    async list(
      filters: { search?: string; status?: string; page?: number; pageSize?: number },
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<CommissionCorrectionPage | null>> {
      if (!canRead(actor)) return failure<CommissionCorrectionPage>('无权查看更正与差额记录', 403);
      const rows = await prisma.businessRecord.findMany({
        where: { domain: STORAGE_KEYS.COMMISSION_CORRECTIONS },
        orderBy: [{ eventAt: 'desc' }, { createdAt: 'desc' }],
      });
      const commissionIds: string[] = [];
      const records = rows.map((row) => parseRecord(row.data));
      records.forEach((record) => record.legs.forEach((item) => {
        if (item.linkedCommissionId) commissionIds.push(item.linkedCommissionId);
      }));
      const linkedRows = commissionIds.length ? await prisma.businessRecord.findMany({
        where: { domain: STORAGE_KEYS.COMMISSIONS, recordId: { in: commissionIds } },
      }) : [];
      const linkedStatus = new Map(linkedRows.map((row) => [row.recordId, clean(row.status) || clean((row.data as any)?.status)]));
      const normalized = resolveCommissionCorrectionStatuses(records, linkedStatus);
      const search = clean(filters.search).toLocaleLowerCase();
      const filtered = normalized.filter((record) => (
        (!search || [record.correctionNo, record.sourceBusinessNo, record.reason, record.createdByName]
          .some((value) => clean(value).toLocaleLowerCase().includes(search)))
        && (!filters.status || filters.status === '全部' || record.status === filters.status)
      ));
      const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 10));
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(totalPages, Math.max(1, Number(filters.page) || 1));
      const items = filtered.slice((page - 1) * pageSize, page * pageSize);
      const allLegs = normalized.flatMap((record) => record.legs);
      return success<CommissionCorrectionPage>({
        items,
        pagination: { page, pageSize, total, totalPages },
        summary: {
          correctionCount: normalized.length,
          pendingSupplementAmount: roundMoney(allLegs.filter((item) => item.kind === '补发' && item.status === '待发放').reduce((sum, item) => sum + item.amount, 0)),
          pendingRecoverAmount: roundMoney(allLegs.filter((item) => item.kind === '追回' && item.status === '待处理').reduce((sum, item) => sum + item.amount, 0)),
          handledAmount: roundMoney(allLegs.filter((item) => item.status === '已处理').reduce((sum, item) => sum + Number(item.handledAmount ?? item.amount), 0)),
        },
      });
    },

    async completeLeg(
      correctionId: string,
      legId: string,
      input: { method: CommissionCorrectionHandlingMethod; amount: number; note: string },
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<CommissionCorrectionRecord | null>> {
      if (!canHandle(actor)) return failure<CommissionCorrectionRecord>('无权处理更正差额', 403);
      if (!clean(input.note)) return failure<CommissionCorrectionRecord>('请填写差额处理说明', 400);
      const allowedMethods: CommissionCorrectionHandlingMethod[] = ['线下追回', '下月提成抵扣', '财务确认无需追回'];
      if (!allowedMethods.includes(input.method)) return failure<CommissionCorrectionRecord>('追回差额处理方式无效', 400);
      return prisma.$transaction(async (transaction) => {
        const [row] = await transaction.$queryRaw<Array<{ data: Prisma.JsonValue }>>(Prisma.sql`
          SELECT data
          FROM business_records
          WHERE domain = ${STORAGE_KEYS.COMMISSION_CORRECTIONS}
            AND recordId = ${clean(correctionId)}
          LIMIT 1
          FOR UPDATE
        `);
        if (!row) return failure<CommissionCorrectionRecord>('更正记录不存在', 404);
        const current = parseRecord(row.data);
        const index = current.legs.findIndex((item) => item.id === clean(legId));
        if (index < 0) return failure<CommissionCorrectionRecord>('差额明细不存在', 404);
        const target = current.legs[index];
        if (target.kind !== '追回') return failure<CommissionCorrectionRecord>('补发差额应通过提成发放链路处理', 409);
        if (target.status === '已处理') return failure<CommissionCorrectionRecord>('该差额已处理', 409);
        const rawAmount = Number(input.amount);
        if (!Number.isFinite(rawAmount)) return failure<CommissionCorrectionRecord>('处理金额无效', 400);
        const amount = roundMoney(rawAmount);
        if (input.method === '财务确认无需追回') {
          if (amount !== 0) return failure<CommissionCorrectionRecord>('确认无需追回时处理金额必须为0', 400);
        } else if (Math.abs(amount - roundMoney(target.amount)) >= 0.01) {
          return failure<CommissionCorrectionRecord>('当前仅支持全额追回或全额抵扣，不能将部分金额标记为全部已处理', 400);
        }
        const handledAt = new Date().toISOString();
        const legs = current.legs.map((item, itemIndex) => itemIndex === index ? {
          ...item,
          status: '已处理' as const,
          handlingMethod: input.method,
          handledAmount: amount,
          handledById: actor.id,
          handledBy: actor.name,
          handledAt,
          handlingNote: clean(input.note),
        } : item);
        const status = legs.every((item) => ['已处理', '已取消'].includes(item.status)) ? '已处理' : '待处理';
        const next: CommissionCorrectionRecord = { ...current, legs, status, updatedAt: handledAt };
        await transaction.businessRecord.update({
          where: { domain_recordId: { domain: STORAGE_KEYS.COMMISSION_CORRECTIONS, recordId: current.id } },
          data: { status, data: jsonValue(next), updatedAt: new Date(handledAt) },
        });
        return success(next);
      });
    },
  };
}
