export type CarrierBrandVariant = 'mobile' | 'unicom' | 'telecom' | 'broadcast' | 'fallback';

export type CarrierBrand = {
  title: string;
  variant: CarrierBrandVariant;
  hex: string;
  secondaryHex?: string;
  fallbackLabel: string;
};

const CARRIER_BRANDS: Array<{ aliases: string[]; brand: CarrierBrand }> = [
  {
    aliases: ['中国移动', '移动', 'cmcc'],
    brand: { title: '中国移动', variant: 'mobile', hex: '0085CC', secondaryHex: '95C11F', fallbackLabel: '移' },
  },
  {
    aliases: ['中国联通', '联通', 'unicom'],
    brand: { title: '中国联通', variant: 'unicom', hex: 'DB2C1C', fallbackLabel: '联' },
  },
  {
    aliases: ['中国电信', '电信', 'telecom'],
    brand: { title: '中国电信', variant: 'telecom', hex: '02489D', fallbackLabel: '电' },
  },
  {
    aliases: ['中国广电', '广电', 'cbn'],
    brand: { title: '中国广电', variant: 'broadcast', hex: '00A651', secondaryHex: 'F4C430', fallbackLabel: '广' },
  },
];

export const resolveCarrierBrand = (operator = ''): CarrierBrand => {
  const normalized = operator.trim().toLowerCase();
  const matched = CARRIER_BRANDS.find(({ aliases }) => aliases.some((alias) => normalized.includes(alias.toLowerCase())));
  if (matched) return matched.brand;
  return {
    title: operator.trim() || '未知运营商',
    variant: 'fallback',
    hex: '64748B',
    fallbackLabel: operator.trim().slice(0, 1) || '?',
  };
};
