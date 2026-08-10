import type { ContactPhone } from '../../types/contact';
import {
  getPhoneNumberError,
  formatPhoneForDisplay,
  normalizePhoneForComparison,
  normalizePhoneForStorage,
} from './phoneNumber';

function normalizedEntry(number: string, isPrimary: boolean): ContactPhone | null {
  const value = normalizePhoneForStorage(number);
  if (!value) return null;
  return {
    number: value,
    isPrimary,
    label: isPrimary ? '主手机号' : '备用手机号',
  };
}

/** Reads both new multi-phone records and legacy records containing only phone. */
export function canonicalizeContactPhones(
  primaryPhone?: string | null,
  phones?: ContactPhone[] | null,
): ContactPhone[] {
  const entries = Array.isArray(phones) ? phones : [];
  const preferred = normalizePhoneForStorage(primaryPhone || '')
    || normalizePhoneForStorage(entries.find((item) => item?.isPrimary)?.number || '')
    || normalizePhoneForStorage(entries[0]?.number || '');
  const result: ContactPhone[] = [];
  const seen = new Set<string>();

  const append = (number: string, isPrimary: boolean) => {
    const entry = normalizedEntry(number, isPrimary);
    if (!entry) return;
    const identity = normalizePhoneForComparison(entry.number);
    if (!identity || seen.has(identity)) return;
    seen.add(identity);
    result.push(entry);
  };

  if (preferred) append(preferred, true);
  for (const item of entries) append(item?.number || '', false);
  return result;
}

export function contactPhoneNumbers(phones?: ContactPhone[] | null): string[] {
  return canonicalizeContactPhones('', phones).map((item) => item.number);
}

export function getContactPhoneError(
  primaryPhone?: string | null,
  phones?: ContactPhone[] | null,
): string {
  const primary = String(primaryPhone || '').trim();
  const primaryIdentity = normalizePhoneForComparison(primary);
  const entries: Array<{ value: string; label: string }> = [
    { value: primary, label: '主手机号' },
    ...(Array.isArray(phones) ? phones : [])
      .filter((item) => !(
        item?.isPrimary
        && primaryIdentity
        && normalizePhoneForComparison(item.number) === primaryIdentity
      ))
      .map((item) => ({
        value: String(item?.number || ''),
        label: item?.isPrimary ? '主手机号' : '备用手机号',
      })),
  ].filter((item) => item.value.trim());
  const seen = new Set<string>();
  for (const entry of entries) {
    const error = getPhoneNumberError(entry.value);
    if (error) return `${entry.label}格式不正确`;
    const identity = normalizePhoneForComparison(entry.value);
    if (seen.has(identity)) return '主手机号和备用手机号不能重复';
    seen.add(identity);
  }
  return '';
}

export function contactPhonesFromValues(primaryPhone: string, alternatePhone?: string): ContactPhone[] {
  return canonicalizeContactPhones(primaryPhone, [
    ...(primaryPhone ? [{ number: primaryPhone, isPrimary: true, label: '主手机号' as const }] : []),
    ...(alternatePhone ? [{ number: alternatePhone, isPrimary: false, label: '备用手机号' as const }] : []),
  ]);
}

export function getContactPhoneValuesError(primaryPhone: string, alternatePhone?: string): string {
  return getContactPhoneError(primaryPhone, [
    ...(primaryPhone ? [{ number: primaryPhone, isPrimary: true, label: '主手机号' as const }] : []),
    ...(alternatePhone ? [{ number: alternatePhone, isPrimary: false, label: '备用手机号' as const }] : []),
  ]);
}

export function alternateContactPhone(primaryPhone?: string | null, phones?: ContactPhone[] | null): string {
  return canonicalizeContactPhones(primaryPhone, phones).find((item) => !item.isPrimary)?.number || '';
}

export function formatContactPhoneSummary(primaryPhone?: string | null, phones?: ContactPhone[] | null): string {
  const values = canonicalizeContactPhones(primaryPhone, phones);
  if (!values.length) return '';
  const primary = formatPhoneForDisplay(values[0].number);
  return values.length > 1 ? `${primary}  +${values.length - 1}` : primary;
}

export function formatContactPhoneLines(primaryPhone?: string | null, phones?: ContactPhone[] | null): string {
  return canonicalizeContactPhones(primaryPhone, phones)
    .map((item) => `${item.label}：${formatPhoneForDisplay(item.number)}`)
    .join('\n');
}

/** Keeps malformed legacy audit entries readable without inventing a phone number. */
export function formatContactPhoneHistoryValue(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '空';
  return text.includes('[object Object]') ? '旧版记录未保存具体号码' : text;
}
