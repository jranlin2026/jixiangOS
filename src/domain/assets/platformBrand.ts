import {
  siApple,
  siBaidu,
  siGoogle,
  siInstagram,
  siKuaishou,
  siLine,
  siMeituan,
  siTiktok,
  siWechat,
  siXiaohongshu,
} from 'simple-icons';

export type PlatformBrandVariant = 'wechat-channels' | 'wecom';

export type PlatformBrand = {
  title: string;
  hex: string;
  path?: string;
  fallbackLabel: string;
  variant?: PlatformBrandVariant;
};

const CUSTOM_BRANDS: Array<{ keyword: string; brand: PlatformBrand }> = [
  {
    keyword: '企业微信',
    brand: {
      title: '企业微信',
      hex: 'FFFFFF',
      fallbackLabel: '企',
      variant: 'wecom',
    },
  },
  {
    keyword: '视频号',
    brand: {
      title: '微信视频号',
      hex: 'FFFFFF',
      fallbackLabel: '视',
      variant: 'wechat-channels',
    },
  },
];

const BRANDS = [
  { keyword: 'Apple ID', icon: siApple },
  { keyword: 'Google账号', icon: siGoogle },
  { keyword: 'LINE', icon: siLine },
  { keyword: 'Instagram', icon: siInstagram },
  { keyword: 'TikTok', icon: siTiktok },
  { keyword: '抖音', icon: siTiktok },
  { keyword: '快手', icon: siKuaishou },
  { keyword: '小红书', icon: siXiaohongshu },
  { keyword: '微信', icon: siWechat },
  { keyword: '美团', icon: siMeituan },
  { keyword: '百度', icon: siBaidu },
] as const;

export function resolvePlatformBrand(platform: string): PlatformBrand {
  const name = String(platform || '').trim();
  const custom = CUSTOM_BRANDS.find((item) => name.includes(item.keyword));
  if (custom) return custom.brand;
  const matched = BRANDS.find((item) => name.includes(item.keyword));
  if (matched) {
    return {
      title: matched.icon.title,
      hex: matched.icon.hex,
      path: matched.icon.path,
      fallbackLabel: matched.keyword.slice(0, 1),
    };
  }
  return {
    title: name || '互联网账号',
    hex: '64748B',
    fallbackLabel: name.slice(0, 1) || '账',
  };
}
