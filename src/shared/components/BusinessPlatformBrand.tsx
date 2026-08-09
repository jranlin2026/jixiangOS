import React from 'react';
import { Box, Typography } from '@mui/material';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';

export type BusinessPlatformPresetKey = 'douyin' | 'wechat' | 'kuaishou' | 'xiaohongshu';

export type BusinessPlatformPreset = {
  key: BusinessPlatformPresetKey;
  name: string;
  code: string;
  logoSrc: string;
  aliases: string[];
};

export const BUSINESS_PLATFORM_PRESETS: BusinessPlatformPreset[] = [
  { key: 'douyin', name: '抖音小店', code: 'DOUYIN', logoSrc: '/platforms/douyin-shop.png', aliases: ['抖店', '抖音电商', 'douyin'] },
  { key: 'wechat', name: '微信小店', code: 'WECHAT', logoSrc: '/platforms/wechat-shop.png', aliases: ['微信电商', '视频号小店', 'wechat', 'weixin'] },
  { key: 'kuaishou', name: '快手小店', code: 'KUAISHOU', logoSrc: '/platforms/kuaishou-shop.png', aliases: ['快手电商', 'kuaishou'] },
  { key: 'xiaohongshu', name: '小红书电商', code: 'XIAOHONGSHU', logoSrc: '/platforms/xiaohongshu-shop.png', aliases: ['小红书小店', '小红书', 'rednote', 'xiaohongshu'] },
];

function normalizedPlatform(value: string) {
  return value.trim().toLocaleLowerCase('zh-CN').replace(/[\s_-]+/g, '');
}

export function findBusinessPlatformPreset(value: string | null | undefined) {
  const normalized = normalizedPlatform(String(value || ''));
  return BUSINESS_PLATFORM_PRESETS.find((preset) => (
    [preset.name, preset.code, preset.key, ...preset.aliases]
      .some((candidate) => normalizedPlatform(candidate) === normalized)
  ));
}

type Props = {
  platform: string;
  compact?: boolean;
  showName?: boolean;
};

const BusinessPlatformBrand: React.FC<Props> = ({ platform, compact = false, showName = false }) => {
  const preset = findBusinessPlatformPreset(platform);
  if (!preset) return <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
    <Box sx={{ width: compact ? 28 : 36, height: compact ? 28 : 36, display: 'grid', placeItems: 'center', borderRadius: 1.5, bgcolor: '#eef2f7', color: '#64748b', flexShrink: 0 }}>
      <LanguageOutlinedIcon sx={{ fontSize: compact ? 18 : 22 }} />
    </Box>
    {showName ? <Typography variant={compact ? 'caption' : 'body2'} fontWeight={700} noWrap>{platform}</Typography> : null}
  </Box>;

  return <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
    <Box
      component="img"
      src={preset.logoSrc}
      alt={preset.name}
      sx={{
        display: 'block', objectFit: 'contain', objectPosition: 'left center', flexShrink: 0,
        width: compact ? 66 : 118, height: compact ? 26 : 42,
      }}
    />
    {showName ? <Typography variant={compact ? 'caption' : 'body2'} fontWeight={700} noWrap>{preset.name}</Typography> : null}
  </Box>;
};

export default BusinessPlatformBrand;
