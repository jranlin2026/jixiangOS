import React from 'react';
import { Box } from '@mui/material';
import { resolveDeviceBrand } from '../../domain/assets/deviceBrand';

type DeviceBrandMarkProps = {
  brand?: string;
  size?: number;
};

export default function DeviceBrandMark({ brand = '', size = 34 }: DeviceBrandMarkProps) {
  const resolved = resolveDeviceBrand(brand);
  const rgb = resolved.hex.match(/.{2}/g)?.map((value) => Number.parseInt(value, 16)) || [100, 116, 139];
  const foreground = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 185 ? '#111827' : '#fff';
  return (
    <Box
      component="span"
      role="img"
      aria-label={`${resolved.title} Logo`}
      title={`${resolved.title} Logo`}
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: size >= 48 ? 1.5 : 1,
        bgcolor: `#${resolved.hex}`,
        color: foreground,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
        fontSize: Math.max(12, Math.round(size * 0.38)),
        fontWeight: 950,
      }}
    >
      {resolved.path ? (
        <svg width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d={resolved.path} />
        </svg>
      ) : resolved.fallbackLabel}
    </Box>
  );
}
