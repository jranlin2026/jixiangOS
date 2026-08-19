import React from 'react';
import { Box } from '@mui/material';
import { resolveCarrierBrand } from '../../domain/assets/carrierBrand';

type CarrierBrandMarkProps = {
  operator?: string;
  size?: number;
};

const CarrierGlyph = ({ variant, secondary }: { variant: ReturnType<typeof resolveCarrierBrand>['variant']; secondary?: string }) => {
  if (variant === 'mobile') {
    return (
      <svg width="72%" height="72%" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 7.5C8.8 3.2 15.2 3.2 19 7.5L16.7 9.3C14.2 6.5 9.8 6.5 7.3 9.3L5 7.5Z" fill="currentColor" />
        <path d="M5 16.5C8.8 20.8 15.2 20.8 19 16.5L16.7 14.7C14.2 17.5 9.8 17.5 7.3 14.7L5 16.5Z" fill={secondary || '#8DC21F'} />
      </svg>
    );
  }
  if (variant === 'unicom') {
    return (
      <svg width="70%" height="70%" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.1 4.2a3.9 3.9 0 0 1 3.9 3.9 3.9 3.9 0 1 1 3.9 3.9 3.9 3.9 0 1 1-3.9 3.9 3.9 3.9 0 1 1-3.9-3.9 3.9 3.9 0 1 1 0-7.8Z" fill="none" stroke="currentColor" strokeWidth="2.4" />
      </svg>
    );
  }
  if (variant === 'telecom') {
    return (
      <svg width="72%" height="72%" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 16.8C7.2 12.5 11.4 8.7 19.8 5.5c-4.1 4-6.2 7.4-6.9 10.2 2.2-.9 4.4-2.2 6.6-3.8-2.5 3.6-6.2 6.1-10.3 6.1-2.2 0-4-.4-5.2-1.2Z" fill="currentColor" />
      </svg>
    );
  }
  if (variant === 'broadcast') {
    return (
      <svg width="72%" height="72%" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17.8 7.1A7 7 0 1 0 18 16.7l-2.8-2a3.6 3.6 0 1 1-.1-5.4l2.7-2.2Z" fill="currentColor" />
        <circle cx="12" cy="12" r="2.1" fill={secondary || '#F4C430'} />
      </svg>
    );
  }
  return null;
};

export default function CarrierBrandMark({ operator = '', size = 30 }: CarrierBrandMarkProps) {
  const resolved = resolveCarrierBrand(operator);
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
        borderRadius: 1,
        bgcolor: '#fff',
        color: `#${resolved.hex}`,
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
        fontSize: Math.max(11, Math.round(size * 0.38)),
        fontWeight: 950,
      }}
    >
      {resolved.variant === 'fallback'
        ? resolved.fallbackLabel
        : <CarrierGlyph variant={resolved.variant} secondary={resolved.secondaryHex ? `#${resolved.secondaryHex}` : undefined} />}
    </Box>
  );
}
