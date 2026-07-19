import type { Customer, CustomerCreateInput } from '../../src/types/customer';
import type { CustomerImportDestination, CustomerImportRow, CustomerImportRowResult, CustomerExportRow } from '../../src/types/customerDataExchange';
import { LIFECYCLE_STATUS_CODES, normalizeLifecycleStatusCode } from '../../src/shared/utils/constants';
import { getPhoneNumberError, normalizePhoneForStorage } from '../../src/shared/utils/phoneNumber';

type NormalizedImportRow = Omit<CustomerImportRow, 'tagNames'> & { tagNames: string[] };

type DirectoryOption = { id: string; name: string };
type LifecycleOption = { code: string; name: string };
type CustomerLevelOption = { value: string; label: string };
type LeadSourceOption = { value: string; label: string; sourceName?: string };
type TagOption = { id: string; name: string };

export type CustomerImportDirectory = {
  currentOwnerId: string;
  currentOwnerName: string;
  canOverrideAttribution: boolean;
  owners: DirectoryOption[];
  lifecycleStatuses: LifecycleOption[];
  customerLevels: CustomerLevelOption[];
  leadSources: LeadSourceOption[];
  tags: TagOption[];
  existingContactKeys: Set<string>;
};

export type ValidatedCustomerImportRow = CustomerImportRowResult & {
  input: CustomerCreateInput;
};

const cleanText = (value: unknown) => String(value ?? '').trim();
const normalizedLookup = (value: unknown) => cleanText(value).toLocaleLowerCase('zh-CN');

function splitTagNames(value: unknown): string[] {
  const source = Array.isArray(value) ? value : cleanText(value).split(/[，,、;；\n]/);
  return Array.from(new Set(source.map(cleanText).filter(Boolean)));
}

export function customerContactKeys(input: Pick<CustomerImportRow, 'phone' | 'wechat'>): string[] {
  const phone = normalizePhoneForStorage(input.phone);
  const wechat = normalizedLookup(input.wechat);
  return [phone ? `phone:${phone}` : '', wechat ? `wechat:${wechat}` : ''].filter(Boolean);
}

export function normalizeCustomerImportRows(rows: CustomerImportRow[]): NormalizedImportRow[] {
  return rows.map((row, index) => ({
    rowNumber: Number.isFinite(Number(row.rowNumber)) ? Math.max(2, Math.floor(Number(row.rowNumber))) : index + 2,
    name: cleanText(row.name),
    phone: normalizePhoneForStorage(row.phone),
    wechat: cleanText(row.wechat),
    company: cleanText(row.company),
    ownerName: cleanText(row.ownerName),
    lifecycleStatus: cleanText(row.lifecycleStatus),
    customerLevel: cleanText(row.customerLevel),
    leadSource: cleanText(row.leadSource),
    industry: cleanText(row.industry),
    city: cleanText(row.city),
    tagNames: splitTagNames(row.tagNames),
    remark: cleanText(row.remark),
  }));
}

function exactlyOneByName<T>(items: T[], value: string, name: (item: T) => string): T | null {
  const target = normalizedLookup(value);
  const matches = items.filter((item) => normalizedLookup(name(item)) === target);
  return matches.length === 1 ? matches[0] : null;
}

function duplicateNameCount<T>(items: T[], value: string, name: (item: T) => string): number {
  const target = normalizedLookup(value);
  return items.filter((item) => normalizedLookup(name(item)) === target).length;
}

export function validateCustomerImportRows(
  rows: NormalizedImportRow[],
  directory: CustomerImportDirectory,
  destination: CustomerImportDestination,
): ValidatedCustomerImportRow[] {
  const encountered = new Set<string>();
  return rows.map((row) => {
    const errors: string[] = [];
    if (!row.name) errors.push('客户姓名不能为空');
    if (row.name.length > 100) errors.push('客户姓名不能超过100个字符');
    if (!row.phone && !row.wechat) errors.push('手机号或微信至少填写一项');
    const phoneError = row.phone ? getPhoneNumberError(row.phone) : '';
    if (phoneError) errors.push(phoneError);

    const contactKeys = customerContactKeys(row);
    if (contactKeys.some((key) => directory.existingContactKeys.has(key))) {
      errors.push('手机号或微信在系统中已存在客户');
    }
    if (contactKeys.some((key) => encountered.has(key))) {
      errors.push('手机号或微信在本次导入文件中重复');
    }
    contactKeys.forEach((key) => encountered.add(key));

    const importingToPublicPool = destination === 'public_pool';
    const requestedOwnerName = importingToPublicPool ? '' : row.ownerName || directory.currentOwnerName;
    const ownerCount = importingToPublicPool ? 0 : duplicateNameCount(directory.owners, requestedOwnerName, (item) => item.name);
    const owner = importingToPublicPool ? null : exactlyOneByName(directory.owners, requestedOwnerName, (item) => item.name);
    if (importingToPublicPool && row.ownerName) errors.push('导入公海池时销售负责人必须留空');
    if (!importingToPublicPool && !owner) errors.push(ownerCount > 1 ? `销售负责人姓名存在重名：${requestedOwnerName}` : `销售负责人不存在或已离职：${requestedOwnerName}`);
    if (!importingToPublicPool && owner && owner.id !== directory.currentOwnerId && !directory.canOverrideAttribution) {
      errors.push('无权覆盖销售负责人，请留空或填写本人');
    }

    const lifecycle = row.lifecycleStatus
      ? exactlyOneByName(directory.lifecycleStatuses, row.lifecycleStatus, (item) => item.name)
        || directory.lifecycleStatuses.find((item) => normalizedLookup(item.code) === normalizedLookup(row.lifecycleStatus))
      : null;
    if (importingToPublicPool && row.lifecycleStatus) errors.push('导入公海池时客户进展必须留空，由系统设置为公海');
    else if (row.lifecycleStatus && !lifecycle) errors.push(`客户进展不存在：${row.lifecycleStatus}`);
    else if (lifecycle?.code === LIFECYCLE_STATUS_CODES.PUBLIC_POOL) errors.push('公海不是客户进展，请选择直接导入公海池');

    const level = row.customerLevel
      ? directory.customerLevels.find((item) => [item.value, item.label].some((value) => normalizedLookup(value) === normalizedLookup(row.customerLevel)))
      : null;
    if (row.customerLevel && !level) errors.push(`客户等级不存在：${row.customerLevel}`);

    const sourceLabelMatches = row.leadSource
      ? directory.leadSources.filter((item) => normalizedLookup(item.label) === normalizedLookup(row.leadSource))
      : [];
    const sourceValueMatches = row.leadSource
      ? directory.leadSources.filter((item) => normalizedLookup(item.value) === normalizedLookup(row.leadSource))
      : [];
    const sourceMatches = sourceLabelMatches.length ? sourceLabelMatches : sourceValueMatches;
    const source = sourceMatches.length === 1 ? sourceMatches[0] : null;
    if (row.leadSource && !source) {
      errors.push(sourceMatches.length > 1 ? `线索来源存在重名：${row.leadSource}` : `线索来源不存在：${row.leadSource}`);
    }

    const selectedTags: TagOption[] = [];
    for (const tagName of row.tagNames) {
      const tag = exactlyOneByName(directory.tags, tagName, (item) => item.name);
      if (!tag) errors.push(`客户标签不存在或存在重名：${tagName}`);
      else selectedTags.push(tag);
    }

    const input: CustomerCreateInput = {
      name: row.name,
      phone: row.phone,
      wechat: row.wechat || undefined,
      company: row.company,
      owner: importingToPublicPool ? '公海' : owner?.name || requestedOwnerName,
      ownerId: importingToPublicPool ? undefined : owner?.id,
      ownerIdentityStatus: importingToPublicPool ? 'public_pool' : 'resolved',
      customerLevel: (level?.value || 'L1') as Customer['customerLevel'],
      lifecycleStatusCode: (importingToPublicPool ? LIFECYCLE_STATUS_CODES.PUBLIC_POOL : lifecycle?.code || LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP) as Customer['lifecycleStatusCode'],
      leadSource: source?.value || row.leadSource || undefined,
      sourceName: source?.sourceName || undefined,
      industry: row.industry || undefined,
      city: row.city || undefined,
      manualTagIds: selectedTags.map((tag) => tag.id),
      tags: selectedTags.map((tag) => tag.name),
      remark: row.remark || undefined,
      sourceType: '公司资源',
    };
    input.lifecycleStatusCode = normalizeLifecycleStatusCode(input.lifecycleStatusCode);
    return {
      rowNumber: row.rowNumber,
      name: row.name,
      status: errors.length ? 'blocked' as const : 'ready' as const,
      reason: errors.join('；') || '可导入',
      input,
    };
  });
}

export function projectCustomerExportRows(customers: Customer[], includeSensitive: boolean): CustomerExportRow[] {
  return customers.map((customer) => {
    const row: CustomerExportRow = {
      客户编号: customer.id,
      客户姓名: customer.name || '',
      公司名称: customer.company || '',
      销售负责人: customer.owner || '',
      客户进度: customer.lifecycleStatusCode || '',
      客户等级: customer.customerLevel || '',
      线索来源: [customer.leadSource, customer.sourceName].filter(Boolean).join('-'),
      行业: customer.industry || '',
      城市: customer.city || '',
      客户标签: (customer.tags || []).join('、'),
      累计成交金额: Number(customer.totalSpent || 0),
      订单数量: Number(customer.orderCount || 0),
      备注: customer.remark || '',
      创建时间: customer.createdAt || '',
      更新时间: customer.updatedAt || '',
    };
    if (includeSensitive) {
      row.手机号 = customer.phone || '';
      row.微信 = customer.wechat || '';
    }
    return row;
  });
}
