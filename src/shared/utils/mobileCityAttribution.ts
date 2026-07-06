import { parseStoredPhoneNumber } from './phoneNumber';

const MOBILE_CITY_PREFIXES: Record<string, string> = {
  '1332895': '昆明',
  '1380000': '北京',
  '1390000': '上海',
  '1370000': '深圳',
  '1360000': '广州',
  '1350000': '成都',
  '1340000': '杭州',
  '1330000': '南京',
  '1320000': '武汉',
  '1310000': '天津',
  '1300001': '重庆',
};

export function inferMainlandMobileCity(phone?: string): string {
  const parsed = parseStoredPhoneNumber(phone);
  if (parsed.countryCode !== 'CN') return '';
  const nationalNumber = parsed.nationalNumber;
  if (!/^1[3-9]\d{9}$/.test(nationalNumber)) return '';

  for (let length = 7; length >= 3; length -= 1) {
    const city = MOBILE_CITY_PREFIXES[nationalNumber.slice(0, length)];
    if (city) return city;
  }
  return '';
}

export function completeCityFromPhone(currentCity?: string, phone?: string): string {
  const city = String(currentCity || '').trim();
  if (city) return city;
  return inferMainlandMobileCity(phone);
}
