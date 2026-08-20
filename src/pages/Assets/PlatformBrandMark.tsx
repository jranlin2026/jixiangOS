import React from 'react';
import { Box } from '@mui/material';
import { resolvePlatformBrand, type PlatformBrandVariant } from '../../domain/assets/platformBrand';

type PlatformBrandMarkProps = {
  platform: string;
  size?: number;
};

function CustomBrandLogo({ variant, size }: { variant: PlatformBrandVariant; size: number }) {
  if (variant === 'wecom') {
    const logoWidth = Math.round(size * 0.86);
    const logoHeight = Math.round(size * 0.72);
    return (
      <svg width={logoWidth} height={logoHeight} viewBox="55 10 165 125" aria-hidden="true">
        <path
          d="M174 76c0-31-23-53-51-53S72 44 72 70c0 14 7 26 20 33l-4 14 19-9c6 2 12 3 19 3 13 0 25-3 35-9"
          fill="none"
          stroke="#0B7FF3"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <ellipse cx="176" cy="80" rx="10" ry="15" transform="rotate(-42 176 80)" fill="#22B900" stroke="#fff" strokeWidth="3" />
        <ellipse cx="191" cy="100" rx="15" ry="10" transform="rotate(-20 191 100)" fill="#0B7FF3" stroke="#fff" strokeWidth="3" />
        <ellipse cx="172" cy="117" rx="10" ry="15" transform="rotate(-38 172 117)" fill="#FA4B0B" stroke="#fff" strokeWidth="3" />
        <ellipse cx="151" cy="101" rx="11" ry="10" fill="#FFC400" stroke="#fff" strokeWidth="3" />
      </svg>
    );
  }
  return (
    <svg width={Math.round(size * 0.72)} height={Math.round(size * 0.72)} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.6607 18.9641c-.0419-.0494-.0944-.1177-.1562-.2096-.2378-.3536-.5143-.9053-.8042-1.6271-.5751-1.4322-1.1386-3.3722-1.5362-5.3267-.3997-1.9651-.6159-3.8682-.5367-5.2432.0403-.6996.1525-1.1619.2821-1.417.0293-.0576.055-.0954.0738-.1188.008-.0099.0145-.0169.0192-.0217.2917.0008.739.1619 1.3558.651.6001.476 1.2502 1.1745 1.9272 2.032 1.2355 1.5648 2.4633 3.5316 3.5515 5.326-.1794.3151-.3695.6595-.5648 1.0136-.0916.166-.1844.3342-.2778.5025-.4192.755-.8641 1.5365-1.3245 2.2447-.4651.7155-.9182 1.3124-1.3434 1.7206-.3006.2884-.521.4189-.6658.4738ZM12.0002 11.0762c-.9621-1.5627-2.0427-3.2363-3.1451-4.6326-.7213-.9136-1.4813-1.7467-2.2541-2.3596C5.8464 3.4855 4.9586 3 4.0002 3c-.9227 0-1.5357.5695-1.8737 1.2345-.315.62-.4497 1.4076-.4958 2.208-.0936 1.625.1596 3.7219.5736 5.7568.4161 2.0455 1.0106 4.1055 1.6401 5.6733.3124.7782.6499 1.4765 1.0004 1.9979.1741.259.3772.5133.6129.7129.2256.1911.582.4166 1.0425.4166.8945 0 1.6477-.5259 2.2111-1.0667.5885-.5649 1.1394-1.3105 1.6353-2.0734.5006-.7701.9737-1.6028 1.3963-2.3641.0855-.154.1685-.3042.249-.4501.0081.0149.0161.03.0242.045.0684.1279.1387.259.2108.3932.4083.7597.8661 1.5948 1.3571 2.3673.4865.7656 1.0351 1.5174 1.6385 2.0875.5891.5566 1.359 1.0613 2.2777 1.0613.4605 0 .8169-.2255 1.0425-.4166.2357-.1996.4388-.4539.6129-.7129.3506-.5213.688-1.2197 1.0005-1.9979.6295-1.5677 1.2241-3.6278 1.6402-5.6733.4139-2.0348.6672-4.1317.5736-5.7567-.0461-.8004-.1807-1.5881-.4958-2.2081C21.5362 3.5695 20.9231 3 20.0004 3c-.9584 0-1.8462.4855-2.6009 1.084-.7728.6129-1.5328 1.446-2.2542 2.3596-1.1024 1.3963-2.183 3.0699-3.1451 4.6326Zm1.162 1.9349c1.0886-1.795 2.3168-3.7627 3.5528-5.3281.6771-.8575 1.3271-1.556 1.9273-2.032.6167-.4891 1.0641-.6502 1.3559-.651.0047.0047.0111.0117.0191.0217.0188.0234.0445.0612.0738.1188.1296.255.2418.7174.2821 1.417.0792 1.375-.137 3.2781-.5368 5.2431-.3976 1.9546-.9611 3.8945-1.5363 5.3268-.2898.7218-.5663 1.2734-.8041 1.6271-.0656.0975-.1206.1684-.1638.2184-.1734-.0515-.4168-.1864-.7362-.488-.4264-.4028-.8711-.9936-1.3241-1.7064-.4486-.7059-.8767-1.485-1.2834-2.2415-.0671-.1249-.134-.2498-.2004-.374-.2148-.4013-.4254-.7947-.6259-1.1517Z"
        fill="#FA7D18"
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
          : brand.variant === 'wechat-channels'
            ? 'inset 0 0 0 1px rgba(250,125,24,0.2)'
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
