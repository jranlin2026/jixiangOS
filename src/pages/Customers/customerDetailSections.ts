export const CUSTOMER_DETAIL_SECTION_STORAGE_KEY = 'jixiangos_customer_detail_sections_v1';

export type CustomerDetailSectionKey = 'basic' | 'attribution' | 'platform' | 'ownership';
export type CustomerDetailSectionState = Record<CustomerDetailSectionKey, boolean>;

export const CUSTOMER_DETAIL_SECTION_DEFAULTS: CustomerDetailSectionState = {
  basic: true,
  attribution: false,
  platform: false,
  ownership: false,
};

const SECTION_KEYS: CustomerDetailSectionKey[] = ['basic', 'attribution', 'platform', 'ownership'];

export function normalizeCustomerDetailSectionState(value: unknown): CustomerDetailSectionState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...CUSTOMER_DETAIL_SECTION_DEFAULTS };
  const source = value as Record<string, unknown>;
  return SECTION_KEYS.reduce<CustomerDetailSectionState>((result, key) => {
    result[key] = typeof source[key] === 'boolean' ? source[key] : CUSTOMER_DETAIL_SECTION_DEFAULTS[key];
    return result;
  }, { ...CUSTOMER_DETAIL_SECTION_DEFAULTS });
}

export function editableCustomerDetailSections(state: CustomerDetailSectionState): CustomerDetailSectionState {
  return { ...state, basic: true, attribution: true, ownership: true };
}
