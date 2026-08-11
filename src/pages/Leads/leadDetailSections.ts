export const LEAD_DETAIL_SECTION_STORAGE_KEY = 'jixiangos_lead_detail_sections_v1';

export type LeadDetailSectionKey = 'basic' | 'social' | 'attribution' | 'platform' | 'ownership';
export type LeadDetailSectionState = Record<LeadDetailSectionKey, boolean>;

export const LEAD_DETAIL_SECTION_DEFAULTS: LeadDetailSectionState = {
  basic: true,
  social: false,
  attribution: false,
  platform: false,
  ownership: false,
};

const SECTION_KEYS: LeadDetailSectionKey[] = ['basic', 'social', 'attribution', 'platform', 'ownership'];

export function normalizeLeadDetailSectionState(value: unknown): LeadDetailSectionState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...LEAD_DETAIL_SECTION_DEFAULTS };
  const source = value as Record<string, unknown>;
  return SECTION_KEYS.reduce<LeadDetailSectionState>((result, key) => {
    result[key] = typeof source[key] === 'boolean' ? source[key] : LEAD_DETAIL_SECTION_DEFAULTS[key];
    return result;
  }, { ...LEAD_DETAIL_SECTION_DEFAULTS });
}

export function editableLeadDetailSections(state: LeadDetailSectionState): LeadDetailSectionState {
  return { ...state, basic: true, social: true };
}
