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

type PlatformBrand = {
  title: string;
  hex: string;
  path?: string;
  fallbackLabel: string;
};

const BRANDS = [
  { keyword: 'Apple ID', icon: siApple },
  { keyword: 'Google账号', icon: siGoogle },
  { keyword: 'LINE', icon: siLine },
  { keyword: 'Instagram', icon: siInstagram },
  { keyword: 'TikTok', icon: siTiktok },
  { keyword: '抖音', icon: siTiktok },
  { keyword: '快手', icon: siKuaishou },
  { keyword: '小红书', icon: siXiaohongshu },
  { keyword: '视频号', icon: siWechat },
  { keyword: '微信', icon: siWechat },
  { keyword: '美团', icon: siMeituan },
  { keyword: '百度', icon: siBaidu },
] as const;

export function resolvePlatformBrand(platform: string): PlatformBrand {
  const name = String(platform || '').trim();
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
