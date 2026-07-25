import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { LIFECYCLE_STATUS_CODES, STORAGE_KEYS } from '../../src/shared/utils/constants';
import { normalizePhoneForComparison } from '../../src/shared/utils/phoneNumber';
import type { Customer } from '../../src/types/customer';
import type { Lead, LeadIntakeRecord } from '../../src/types/lead';
import type { RecoveryCrmIdentityStatus, RecoveryOrder } from '../../src/types/recoveryOrder';
import {
  createContactIdentityCryptoFromEnv,
  hashContactIdentity,
  lockContactIdentityMutationGate,
  normalizeContactIdentity,
  upsertLeadContactIdentities,
  type ContactIdentityCrypto,
} from './contactIdentityService';

type ContactEntity = {
  id: string;
  name?: string;
  phone?: string;
  wechat?: string;
  customerId?: string;
  deletedAt?: string;
  mergedIntoId?: string;
};
export type RecoveryCrmResolution =
  | { status: '已匹配客户'; customerId: string }
  | { status: '已匹配线索'; leadId: string }
  | { status: '待创建线索' }
  | { status: '身份冲突' };

function phone(value: unknown): string {
  return normalizePhoneForComparison(String(value || '')).replace(/^\+86(?=1\d{10}$)/u, '');
}

function wechat(value: unknown): string {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

function matchesContact(entity: ContactEntity, targetPhone: string, targetWechat: string): boolean {
  return Boolean((targetPhone && phone(entity.phone) === targetPhone) || (targetWechat && wechat(entity.wechat) === targetWechat));
}

export function resolveRecoveryCrmIdentity(input: {
  customers: ContactEntity[];
  leads: ContactEntity[];
  phone?: string;
  wechat?: string;
}): RecoveryCrmResolution {
  const targetPhone = phone(input.phone);
  const targetWechat = wechat(input.wechat);
  const customers = input.customers.filter((item) => !item.deletedAt && !item.mergedIntoId && matchesContact(item, targetPhone, targetWechat));
  const leads = input.leads.filter((item) => !item.deletedAt && matchesContact(item, targetPhone, targetWechat));
  const customerIds = new Set(customers.map((item) => item.id));
  const standaloneLeads = leads.filter((item) => !item.customerId);
  if (customerIds.size > 1 || standaloneLeads.length > 1 || (customerIds.size && standaloneLeads.length)) return { status: '身份冲突' };
  if (customerIds.size === 1) return { status: '已匹配客户', customerId: [...customerIds][0] };
  if (standaloneLeads.length === 1) return { status: '已匹配线索', leadId: standaloneLeads[0].id };
  return { status: '待创建线索' };
}

type RecoveryCrmTx = {
  businessRecord: { findMany(args: any): Promise<Array<{ data: unknown }>>; findUnique(args: any): Promise<any> };
  leadRecord: {
    findMany(args?: any): Promise<Array<{ id: string; data: unknown }>>;
    findUnique(args: any): Promise<{ id: string; data: unknown } | null>;
    create(args: any): Promise<unknown>;
  };
  appStorage: any;
  contactIdentity: any;
  contactIdentityLink: any;
  $queryRaw?: any;
};

function parsed<T>(value: unknown): T | null {
  try {
    const result = typeof value === 'string' ? JSON.parse(value) : value;
    return result && typeof result === 'object' && !Array.isArray(result) ? result as T : null;
  } catch { return null; }
}

async function appendRecoveryLeadIntake(tx: RecoveryCrmTx, lead: Lead, order: RecoveryOrder, at: string): Promise<void> {
  const key = STORAGE_KEYS.LEAD_INTAKE_RECORDS;
  await tx.appStorage.upsert({ where: { key }, update: {}, create: { key, value: [] } });
  const row = tx.$queryRaw
    ? ((await tx.$queryRaw(Prisma.sql`
        SELECT value FROM app_storage WHERE \`key\` = ${key} FOR UPDATE
      `)) as Array<{ value: unknown }>)[0]
    : await tx.appStorage.findUnique({ where: { key }, select: { value: true } });
  const current = Array.isArray(row?.value) ? row.value as LeadIntakeRecord[] : [];
  if (current.some((record) => record.leadId === lead.id)) return;
  const record: LeadIntakeRecord = {
    id: `intake-recovery-${order.id}`.slice(0, 64),
    leadId: lead.id,
    name: lead.name,
    phone: lead.phone || undefined,
    wechat: lead.wechat,
    source: [lead.source, lead.sourceName].filter(Boolean).join('-'),
    inputBy: lead.inputBy,
    status: '待分配',
    matchedRule: '售后挽回审核通过自动沉淀',
    createdAt: at,
  };
  await tx.appStorage.upsert({
    where: { key },
    update: { value: JSON.parse(JSON.stringify([record, ...current])) as Prisma.InputJsonValue },
    create: { key, value: JSON.parse(JSON.stringify([record])) as Prisma.InputJsonValue },
  });
}

export interface RecoveryCrmBridge {
  resolve(tx: unknown, contact: Pick<RecoveryOrder, 'customerPhone' | 'customerWechat'>): Promise<RecoveryCrmResolution>;
  resolveAndSyncLead(tx: unknown, order: RecoveryOrder): Promise<{
    customerId: string;
    linkedLeadId?: string;
    crmIdentityStatus: RecoveryCrmIdentityStatus;
    leadSyncStatus: RecoveryOrder['leadSyncStatus'];
  }>;
}

export function createRecoveryCrmBridge(options: { contactIdentityCrypto?: ContactIdentityCrypto } = {}): RecoveryCrmBridge {
  const crypto = () => options.contactIdentityCrypto || createContactIdentityCryptoFromEnv();
  const legacyFallback = async (
    tx: RecoveryCrmTx,
    contact: Pick<RecoveryOrder, 'customerPhone' | 'customerWechat'>,
  ): Promise<RecoveryCrmResolution> => {
    const targetPhone = phone(contact.customerPhone);
    const targetWechat = wechat(contact.customerWechat);
    const phoneVariants = Array.from(new Set([
      String(contact.customerPhone || '').trim(),
      targetPhone,
      targetPhone ? `+86${targetPhone}` : '',
    ].filter(Boolean)));
    let customerRows: Array<{ data: unknown }>;
    let leadRows: Array<{ id: string; data: unknown }>;
    if (tx.$queryRaw) {
      const customerConditions: Prisma.Sql[] = [];
      const leadConditions: Prisma.Sql[] = [];
      if (targetPhone) {
        const customerDigits = Prisma.sql`REGEXP_REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(data, '$.phone')), ''), '[^0-9]', '')`;
        const leadDigits = Prisma.sql`REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '')`;
        const targetDigits = targetPhone.replace(/\D/g, '');
        if (/^1[3-9]\d{9}$/.test(targetPhone)) {
          customerConditions.push(Prisma.sql`RIGHT(${customerDigits}, 11) = ${targetPhone}`);
          leadConditions.push(Prisma.sql`RIGHT(${leadDigits}, 11) = ${targetPhone}`);
        } else {
          customerConditions.push(Prisma.sql`${customerDigits} = ${targetDigits}`);
          leadConditions.push(Prisma.sql`${leadDigits} = ${targetDigits}`);
        }
      }
      if (targetWechat) {
        customerConditions.push(Prisma.sql`LOWER(TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(data, '$.wechat')), ''))) = ${targetWechat}`);
        leadConditions.push(Prisma.sql`LOWER(TRIM(COALESCE(wechat, ''))) = ${targetWechat}`);
      }
      [customerRows, leadRows] = await Promise.all([
        tx.$queryRaw(Prisma.sql`
          SELECT data FROM business_records
          WHERE domain = ${STORAGE_KEYS.CUSTOMERS}
            AND mergedIntoId IS NULL
            AND (${Prisma.join(customerConditions, ' OR ')})
        `) as Promise<Array<{ data: unknown }>>,
        tx.$queryRaw(Prisma.sql`
          SELECT id, data FROM lead_records
          WHERE ${Prisma.join(leadConditions, ' OR ')}
        `) as Promise<Array<{ id: string; data: unknown }>>,
      ]);
    } else {
      customerRows = await tx.businessRecord.findMany({
        where: {
          domain: STORAGE_KEYS.CUSTOMERS,
          mergedIntoId: null,
          OR: [
            ...phoneVariants.map((value) => ({ data: { path: '$.phone', equals: value } })),
            ...(targetWechat ? [{ data: { path: '$.wechat', equals: targetWechat } }] : []),
          ],
        },
      });
      leadRows = await tx.leadRecord.findMany({
        where: {
          OR: [
            ...(phoneVariants.length ? [{ phone: { in: phoneVariants } }] : []),
            ...(targetWechat ? [{ wechat: targetWechat }] : []),
          ],
        },
      });
    }
    return resolveRecoveryCrmIdentity({
      customers: customerRows.flatMap((row) => { const item = parsed<Customer>(row.data); return item ? [item] : []; }),
      leads: leadRows.flatMap((row) => { const item = parsed<Lead>(row.data); return item ? [{ ...item, id: row.id }] : []; }),
      phone: contact.customerPhone,
      wechat: contact.customerWechat,
    });
  };
  const loadResolution = async (
    tx: RecoveryCrmTx,
    contact: Pick<RecoveryOrder, 'customerPhone' | 'customerWechat'>,
  ): Promise<RecoveryCrmResolution> => {
    const candidates = ([
      ['phone', String(contact.customerPhone || '')],
      ['wechat', String(contact.customerWechat || '')],
    ] as const)
      .map(([type, value]) => ({ type, normalized: normalizeContactIdentity(type, value) }))
      .filter((candidate) => Boolean(candidate.normalized));
    if (!candidates.length) return { status: '待创建线索' } as RecoveryCrmResolution;
    const key = crypto();
    const identities = (await Promise.all(candidates.map((candidate) => tx.contactIdentity.findUnique({
      where: { type_normalizedHash: { type: candidate.type, normalizedHash: hashContactIdentity(candidate.normalized, key.hmacKey) } },
    })))).filter(Boolean);
    if (identities.some((identity: any) => identity.status === 'conflict')) return { status: '身份冲突' };
    const identityIds = identities.map((identity: any) => String(identity.id));
    if (!identityIds.length) return legacyFallback(tx, contact);
    const links = await tx.contactIdentityLink.findMany({
      where: { identityId: { in: identityIds }, linkStatus: 'active' },
      select: { entityType: true, entityId: true },
    });
    const customerIds = new Set<string>();
    const leadIds = new Set<string>();
    identities.forEach((identity: any) => { if (identity.canonicalCustomerId) customerIds.add(String(identity.canonicalCustomerId)); });
    links.forEach((link: any) => {
      if (link.entityType === 'customer') customerIds.add(String(link.entityId));
      if (link.entityType === 'lead') leadIds.add(String(link.entityId));
    });
    if (customerIds.size > 1) return { status: '身份冲突' };
    const leadRows = leadIds.size
      ? await tx.leadRecord.findMany({ where: { id: { in: [...leadIds] } } })
      : [];
    const standaloneLeadIds = new Set(leadRows.flatMap((row) => {
      const lead = parsed<Lead>(row.data);
      return lead && !lead.deletedAt && !lead.customerId ? [row.id] : [];
    }));
    if (standaloneLeadIds.size > 1 || (customerIds.size && standaloneLeadIds.size)) return { status: '身份冲突' };
    const indexed: RecoveryCrmResolution = customerIds.size === 1
      ? { status: '已匹配客户', customerId: [...customerIds][0] }
      : standaloneLeadIds.size === 1
        ? { status: '已匹配线索', leadId: [...standaloneLeadIds][0] }
        : { status: '待创建线索' };
    if (identities.length === candidates.length && indexed.status !== '待创建线索') return indexed;
    const legacy = await legacyFallback(tx, contact);
    if (legacy.status === '身份冲突') return legacy;
    if (indexed.status === '待创建线索') return legacy;
    if (legacy.status === '待创建线索') return indexed;
    if (indexed.status === '已匹配客户' && legacy.status === '已匹配客户' && indexed.customerId === legacy.customerId) return indexed;
    if (indexed.status === '已匹配线索' && legacy.status === '已匹配线索' && indexed.leadId === legacy.leadId) return indexed;
    return { status: '身份冲突' };
  };
  return {
    resolve: (tx, contact) => loadResolution(tx as RecoveryCrmTx, contact),
    async resolveAndSyncLead(txValue, order) {
      const tx = txValue as RecoveryCrmTx;
      await lockContactIdentityMutationGate(tx);
      const resolution = await loadResolution(tx, order);
      if (resolution.status === '身份冲突') return { customerId: '', crmIdentityStatus: '身份冲突', leadSyncStatus: '失败' };
      if (resolution.status === '已匹配客户') return {
        customerId: resolution.customerId, linkedLeadId: undefined, crmIdentityStatus: '已匹配客户', leadSyncStatus: '不需要',
      };
      if (resolution.status === '已匹配线索') return {
        customerId: '', linkedLeadId: resolution.leadId, crmIdentityStatus: '已匹配线索', leadSyncStatus: '已关联',
      };
      const id = `lead-recovery-${order.id}`.slice(0, 64);
      const existing = await tx.leadRecord.findUnique({ where: { id } });
      if (existing) return { customerId: '', linkedLeadId: id, crmIdentityStatus: '已创建线索', leadSyncStatus: '已创建' };
      const at = order.auditedAt || order.updatedAt || new Date().toISOString();
      const lead: Lead = {
        id,
        name: order.submittedCustomerName || order.customerName,
        phone: order.customerPhone || '',
        wechat: order.customerWechat,
        source: '售后服务',
        sourceType: '公司资源',
        sourceName: '售后挽回',
        status: '新线索',
        lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
        lifecycleStatus: '待跟进',
        lifecycleStatusUpdatedAt: at,
        owner: '待分配',
        inputBy: order.createdByName,
        leadContributorId: order.recoveryUserId,
        leadContributorName: order.recoveryUserName,
        intakeStatus: '待分配',
        recoveryOrderId: order.id,
        remark: `由售后挽回订单 ${order.recoveryNo} 审核通过后自动沉淀`,
        followUpRecords: [],
        changeHistory: [{ id: randomUUID(), action: 'create', operator: order.auditorName || '系统', changedAt: at, summary: '售后挽回审核通过自动创建线索' }],
        createdAt: at,
        updatedAt: at,
      };
      await upsertLeadContactIdentities(tx, {
        leadId: id, phone: lead.phone, wechat: lead.wechat, source: 'recovery_approval', crypto: crypto(),
      });
      await tx.leadRecord.create({ data: {
        id, name: lead.name, company: null, phone: lead.phone || null, wechat: lead.wechat || null,
        source: lead.source, status: lead.status, lifecycleStatusCode: lead.lifecycleStatusCode,
        owner: lead.owner, assignedTo: null, inputBy: lead.inputBy || null,
        leadContributorId: lead.leadContributorId || null, data: JSON.parse(JSON.stringify(lead)) as Prisma.InputJsonValue,
        createdAt: new Date(at), updatedAt: new Date(at),
      } });
      await appendRecoveryLeadIntake(tx, lead, order, at);
      return { customerId: '', linkedLeadId: id, crmIdentityStatus: '已创建线索', leadSyncStatus: '已创建' };
    },
  };
}
