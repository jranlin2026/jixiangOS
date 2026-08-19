import React from 'react';
import { Box } from '@mui/material';
import { resolvePlatformBrand } from '../../domain/assets/platformBrand';

type PlatformBrandMarkProps = {
  platform: string;
  size?: number;
};

export default function PlatformBrandMark({ platform, size = 34 }: PlatformBrandMarkProps) {
  const brand = resolvePlatformBrand(platform);
  const rgb = brand.hex.match(/.{2}/g)?.map((value) => Number.parseInt(value, 16)) || [100, 116, 139];
  const foreground = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 185 ? '#111827' : '#fff';
  return (
    <Box
      component="span"
      role="img"
      aria-label={`${brand.title} Logo`}
      title={`${brand.title} Logo`}
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: size >= 56 ? 1.5 : 1,
        bgcolor: `#${brand.hex}`,
        color: foreground,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.16)',
        fontSize: Math.max(12, Math.round(size * 0.38)),
        fontWeight: 950,
      }}
    >
      {brand.path ? (
        <svg width={Math.round(size * 0.58)} height={Math.round(size * 0.58)} viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d={brand.path} />
        </svg>
      ) : brand.fallbackLabel}
    </Box>
  );
}
