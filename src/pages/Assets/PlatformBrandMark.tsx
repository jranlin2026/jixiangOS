import React from 'react';
import { Box } from '@mui/material';
import { resolvePlatformBrand, type PlatformBrandVariant } from '../../domain/assets/platformBrand';

type PlatformBrandMarkProps = {
  platform: string;
  size?: number;
};

function CustomBrandLogo({ variant, size }: { variant: PlatformBrandVariant; size: number }) {
  const logoSize = Math.round(size * 0.68);
  if (variant === 'wecom') {
    return (
      <svg width={logoSize} height={logoSize} viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M3.5 5.2c0-1.2 1-2.2 2.2-2.2h10.1c1.2 0 2.2 1 2.2 2.2v7.1c0 1.2-1 2.2-2.2 2.2H10l-4.3 3.3v-3.3a2.2 2.2 0 0 1-2.2-2.2V5.2Z"
          fill="none"
          stroke="#2F7FEA"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="17.4" cy="16.7" r="2.1" fill="#20C676" stroke="#fff" strokeWidth="0.7" />
        <circle cx="20.5" cy="13.4" r="1.65" fill="#FFB72B" stroke="#fff" strokeWidth="0.7" />
        <circle cx="20.7" cy="18.8" r="1.5" fill="#F26B3A" stroke="#fff" strokeWidth="0.7" />
      </svg>
    );
  }
  return (
    <svg width={logoSize} height={logoSize} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 12C9.8 7.1 6.1 4.9 3.8 6.8 1.4 8.8 4.6 12.6 12 12Zm0 0c2.2-4.9 5.9-7.1 8.2-5.2 2.4 2-0.8 5.8-8.2 5.2Zm0 0c-2.2 4.9-5.9 7.1-8.2 5.2-2.4-2 0.8-5.8 8.2-5.2Zm0 0c2.2 4.9 5.9 7.1 8.2 5.2 2.4-2-0.8-5.8-8.2-5.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
        boxShadow: brand.variant === 'wecom'
          ? 'inset 0 0 0 1px rgba(47,127,234,0.18)'
          : 'inset 0 0 0 1px rgba(255,255,255,0.16)',
        fontSize: Math.max(12, Math.round(size * 0.38)),
        fontWeight: 950,
      }}
    >
      {brand.variant ? (
        <CustomBrandLogo variant={brand.variant} size={size} />
      ) : brand.path ? (
        <svg width={Math.round(size * 0.58)} height={Math.round(size * 0.58)} viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d={brand.path} />
        </svg>
      ) : brand.fallbackLabel}
    </Box>
  );
}
