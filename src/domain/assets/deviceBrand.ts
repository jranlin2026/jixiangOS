import {
  siApple,
  siHonor,
  siHuawei,
  siLenovo,
  siOppo,
  siSamsung,
  siVivo,
  siXiaomi,
} from 'simple-icons';

export type DeviceBrand = {
  title: string;
  hex: string;
  path?: string;
  fallbackLabel: string;
};

const DEVICE_BRANDS = [
  { keywords: ['苹果', 'Apple', 'iPhone', 'iPad'], icon: siApple },
  { keywords: ['荣耀', 'HONOR'], icon: siHonor },
  { keywords: ['华为', 'Huawei'], icon: siHuawei },
  { keywords: ['小米', 'Xiaomi', 'Redmi', '红米'], icon: siXiaomi },
  { keywords: ['OPPO'], icon: siOppo },
  { keywords: ['vivo'], icon: siVivo },
  { keywords: ['三星', 'Samsung'], icon: siSamsung },
  { keywords: ['联想', 'Lenovo'], icon: siLenovo },
] as const;

export function resolveDeviceBrand(value?: string): DeviceBrand {
  const name = String(value || '').trim();
  const lowerName = name.toLowerCase();
  const matched = DEVICE_BRANDS.find((item) => (
    item.keywords.some((keyword) => lowerName.includes(keyword.toLowerCase()))
  ));
  if (matched) {
    return {
      title: matched.icon.title,
      hex: matched.icon.hex,
      path: matched.icon.path,
      fallbackLabel: matched.keywords[0].slice(0, 1),
    };
  }
  return {
    title: name || '设备品牌',
    hex: '64748B',
    fallbackLabel: name.slice(0, 1) || '设',
  };
}
