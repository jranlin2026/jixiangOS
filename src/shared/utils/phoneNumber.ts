export type PhoneCountryCode =
  | 'CN'
  | 'HK'
  | 'TW'
  | 'US'
  | 'GB'
  | 'JP'
  | 'KR'
  | 'TR'
  | 'IN'
  | 'PK'
  | 'AF'
  | 'LK'
  | 'MM'
  | 'IR'
  | 'SG'
  | 'MY'
  | 'TH'
  | 'VN'
  | 'ID'
  | 'PH'
  | 'AU';

export type PhoneCountry = {
  code: PhoneCountryCode;
  name: string;
  dialCode: string;
  flag: string;
};

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: 'CN', name: '中国', dialCode: '+86', flag: '🇨🇳' },
  { code: 'HK', name: '中国香港', dialCode: '+852', flag: '🇭🇰' },
  { code: 'TW', name: '中国台湾', dialCode: '+886', flag: '🇹🇼' },
  { code: 'US', name: '美国/加拿大', dialCode: '+1', flag: '🇺🇸' },
  { code: 'GB', name: '英国', dialCode: '+44', flag: '🇬🇧' },
  { code: 'JP', name: '日本', dialCode: '+81', flag: '🇯🇵' },
  { code: 'KR', name: '韩国', dialCode: '+82', flag: '🇰🇷' },
  { code: 'TR', name: '土耳其', dialCode: '+90', flag: '🇹🇷' },
  { code: 'IN', name: '印度', dialCode: '+91', flag: '🇮🇳' },
  { code: 'PK', name: '巴基斯坦', dialCode: '+92', flag: '🇵🇰' },
  { code: 'AF', name: '阿富汗', dialCode: '+93', flag: '🇦🇫' },
  { code: 'LK', name: '斯里兰卡', dialCode: '+94', flag: '🇱🇰' },
  { code: 'MM', name: '缅甸', dialCode: '+95', flag: '🇲🇲' },
  { code: 'IR', name: '伊朗', dialCode: '+98', flag: '🇮🇷' },
  { code: 'SG', name: '新加坡', dialCode: '+65', flag: '🇸🇬' },
  { code: 'MY', name: '马来西亚', dialCode: '+60', flag: '🇲🇾' },
  { code: 'TH', name: '泰国', dialCode: '+66', flag: '🇹🇭' },
  { code: 'VN', name: '越南', dialCode: '+84', flag: '🇻🇳' },
  { code: 'ID', name: '印度尼西亚', dialCode: '+62', flag: '🇮🇩' },
  { code: 'PH', name: '菲律宾', dialCode: '+63', flag: '🇵🇭' },
  { code: 'AU', name: '澳大利亚', dialCode: '+61', flag: '🇦🇺' },
];

const DEFAULT_COUNTRY = PHONE_COUNTRIES[0];
const COUNTRIES_BY_CODE = new Map(PHONE_COUNTRIES.map((country) => [country.code, country]));
const COUNTRIES_BY_DIAL = [...PHONE_COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);

export function getPhoneCountry(code?: string): PhoneCountry {
  return COUNTRIES_BY_CODE.get(code as PhoneCountryCode) || DEFAULT_COUNTRY;
}

export function stripPhoneNumber(value?: string): string {
  return String(value || '').replace(/[^\d]/g, '');
}

export function parseStoredPhoneNumber(value?: string): { countryCode: PhoneCountryCode; nationalNumber: string } {
  const raw = String(value || '').trim();
  if (!raw) return { countryCode: DEFAULT_COUNTRY.code, nationalNumber: '' };
  const compact = raw.replace(/\s+/g, '');
  const matched = compact.startsWith('+')
    ? COUNTRIES_BY_DIAL.find((country) => compact.startsWith(country.dialCode))
    : undefined;
  if (matched) {
    return {
      countryCode: matched.code,
      nationalNumber: stripPhoneNumber(compact.slice(matched.dialCode.length)),
    };
  }
  return { countryCode: DEFAULT_COUNTRY.code, nationalNumber: stripPhoneNumber(raw) };
}

export function validatePhoneNumber(value?: string, countryCode: PhoneCountryCode = DEFAULT_COUNTRY.code): {
  valid: boolean;
  normalized: string;
  message?: string;
} {
  const country = getPhoneCountry(countryCode);
  const nationalNumber = stripPhoneNumber(value);
  if (!nationalNumber) return { valid: true, normalized: '' };
  if (country.code === 'CN' && !/^1[3-9]\d{9}$/.test(nationalNumber)) {
    return { valid: false, normalized: '', message: '手机号格式不正确' };
  }
  if (country.code !== 'CN' && (nationalNumber.length < 5 || nationalNumber.length > 15)) {
    return { valid: false, normalized: '', message: '手机号格式不正确' };
  }
  return { valid: true, normalized: `${country.dialCode}${nationalNumber}` };
}

export function normalizePhoneForStorage(value?: string, countryCode?: PhoneCountryCode): string {
  const parsed = parseStoredPhoneNumber(value);
  const country = countryCode || parsed.countryCode;
  const validation = validatePhoneNumber(parsed.nationalNumber, country);
  return validation.valid ? validation.normalized : String(value || '').trim();
}

export function normalizePhoneForComparison(value?: string): string {
  const parsed = parseStoredPhoneNumber(value);
  const validation = validatePhoneNumber(parsed.nationalNumber, parsed.countryCode);
  if (validation.valid && validation.normalized) return validation.normalized.toLowerCase();
  return stripPhoneNumber(value).toLowerCase();
}

export function isPhoneNumberValid(value?: string): boolean {
  const parsed = parseStoredPhoneNumber(value);
  return validatePhoneNumber(parsed.nationalNumber, parsed.countryCode).valid;
}

export function getPhoneNumberError(value?: string): string {
  if (!String(value || '').trim()) return '';
  const parsed = parseStoredPhoneNumber(value);
  return validatePhoneNumber(parsed.nationalNumber, parsed.countryCode).message || '';
}

export function formatPhoneForDisplay(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = parseStoredPhoneNumber(raw);
  const country = getPhoneCountry(parsed.countryCode);
  return parsed.nationalNumber ? `${country.dialCode} ${parsed.nationalNumber}` : raw;
}
