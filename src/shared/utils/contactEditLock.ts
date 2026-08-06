import { isPhoneNumberValid } from './phoneNumber';
import type { ContactPhone } from '../../types/contact';

type ContactLike = {
  phone?: string | null;
  phones?: ContactPhone[] | null;
  wechat?: string | null;
};

export const isBlankContactValue = (value?: string | null): boolean => {
  const text = String(value ?? '').trim();
  return !text || text === '-' || text === '未填写' || text === '未填';
};

export const canCompleteContactField = (currentValue?: string | null): boolean => (
  isBlankContactValue(currentValue)
);

export const canCompletePhoneField = (currentValue?: string | null): boolean => (
  canCompleteContactField(currentValue) || !isPhoneNumberValid(String(currentValue || ''))
);

export function applyContactEditLock<T extends ContactLike>(
  existing: ContactLike,
  patch: Partial<T>,
  options: { canEditLockedContact?: boolean } = {},
): Partial<T> {
  const next = { ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, 'phones') && !options.canEditLockedContact) {
    const canComplete = canCompletePhoneField(existing.phone);
    (next as ContactLike).phones = canComplete ? patch.phones : existing.phones;
  }
  (['phone', 'wechat'] as const).forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) return;
    const currentValue = existing[field];
    const nextValue = patch[field];
    if (options.canEditLockedContact) {
      (next as ContactLike)[field] = isBlankContactValue(nextValue) ? '' : String(nextValue).trim();
      return;
    }
    const canComplete = field === 'phone'
      ? canCompletePhoneField(currentValue)
      : canCompleteContactField(currentValue);
    if (canComplete) {
      (next as ContactLike)[field] = isBlankContactValue(nextValue) ? '' : String(nextValue).trim();
      return;
    }
    (next as ContactLike)[field] = currentValue || '';
  });
  return next;
}
