import React from 'react';
import { Box, Button, Chip, Stack, Tab, Tabs, Typography } from '@mui/material';
import type { BoxProps, ButtonProps, SxProps, Theme } from '@mui/material';

export const moduleTokens = {
  page: '#F2F2F7',
  surface: '#FFFFFF',
  ink: '#1F2937',
  muted: '#6B7280',
  line: '#E5E7EB',
  softLine: '#EEF0F3',
  subtle: '#F9F9FC',
  blue: '#7C3AED',
  green: '#059669',
  amber: '#B76A00',
  red: '#D92D20',
  gray: '#64748B',
};

export const moduleRadius = '14px';

type ModulePageProps = BoxProps & {
  maxWidth?: number | string;
  workspace?: boolean;
};

export const ModulePage: React.FC<ModulePageProps> = ({
  children,
  maxWidth = 'none',
  workspace = false,
  sx,
  ...props
}) => (
  <Box
    sx={{
      minHeight: '100%',
      bgcolor: moduleTokens.page,
      p: { xs: 2, md: 3 },
      ...(workspace ? {
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      } : {}),
      ...sx,
    }}
    {...props}
  >
    <Box sx={{
      width: '100%',
      maxWidth,
      mx: maxWidth === 'none' ? 0 : 'auto',
      ...(workspace ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : {}),
    }}>
      {children}
    </Box>
  </Box>
);

type ModuleHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  sx?: SxProps<Theme>;
};

export const ModuleHeader: React.FC<ModuleHeaderProps> = ({ title, description, actions, sx }) => (
  <Stack
    direction={{ xs: 'column', lg: 'row' }}
    justifyContent="space-between"
    alignItems={{ xs: 'stretch', lg: 'flex-start' }}
    spacing={2}
    sx={{ mb: 2.5, ...sx }}
  >
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' }, fontWeight: 900, color: moduleTokens.ink, lineHeight: 1.25, letterSpacing: '-0.015em' }}>
        {title}
      </Typography>
      {description ? (
        <Typography variant="body2" sx={{ color: moduleTokens.muted, mt: 0.5, maxWidth: 760 }}>
          {description}
        </Typography>
      ) : null}
    </Box>
    {actions ? (
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', lg: 'flex-end' } }}>
        {actions}
      </Box>
    ) : null}
  </Stack>
);

type ModuleTabsProps = React.ComponentProps<typeof Tabs> & {
  children: React.ReactNode;
};

export const ModuleTabs: React.FC<ModuleTabsProps> = ({ children, sx, ...props }) => (
  <Tabs
    data-module-tabs="primary"
    sx={{
      mb: 2,
      minHeight: 52,
      px: { xs: 0.5, md: 1.5 },
      bgcolor: '#FBFBFD',
      borderTop: `1px solid ${moduleTokens.softLine}`,
      borderBottom: `1px solid ${moduleTokens.line}`,
      '& .MuiTabs-flexContainer': {
        gap: { xs: 0, md: 0.5 },
      },
      '& .MuiTab-root': {
        minHeight: 52,
        px: { xs: 1.5, md: 2.5 },
        py: 1.25,
        minWidth: 0,
        fontSize: { xs: '0.8125rem', md: '0.875rem' },
        lineHeight: 1.35,
        fontWeight: 800,
        letterSpacing: 0,
        textTransform: 'none',
        color: moduleTokens.muted,
        transition: 'color 160ms ease, background-color 160ms ease',
        '&:hover': {
          color: moduleTokens.blue,
          bgcolor: '#F5F3FF',
        },
      },
      '& .MuiTab-root.Mui-selected': {
        color: `${moduleTokens.blue} !important`,
      },
      '& .MuiTabs-indicator': {
        height: 4,
        borderRadius: '4px 4px 0 0',
        bgcolor: moduleTokens.blue,
      },
      '& .MuiTabs-scrollButtons': {
        color: moduleTokens.muted,
      },
      ...sx,
    }}
    {...props}
  >
    {children}
  </Tabs>
);

type ModuleToolbarProps = BoxProps;

export const ModuleToolbar: React.FC<ModuleToolbarProps> = ({ children, sx, ...props }) => (
  <Box
    sx={{
      display: 'flex',
      gap: 1.5,
      mb: 2,
      flexWrap: 'wrap',
      alignItems: 'center',
      '& .MuiTextField-root': {
        bgcolor: moduleTokens.surface,
      },
      '& .MuiOutlinedInput-root': {
        borderRadius: moduleRadius,
      },
      '& .MuiInputBase-root': {
        minHeight: 40,
      },
      ...sx,
    }}
    {...props}
  >
    {children}
  </Box>
);

type StatusTone = 'blue' | 'green' | 'amber' | 'red' | 'gray';

const toneMap: Record<StatusTone, { color: string; bg: string }> = {
  blue: { color: moduleTokens.blue, bg: '#EEF4FF' },
  green: { color: moduleTokens.green, bg: '#ECFDF3' },
  amber: { color: moduleTokens.amber, bg: '#FFFAEB' },
  red: { color: moduleTokens.red, bg: '#FEF3F2' },
  gray: { color: moduleTokens.gray, bg: '#F2F4F7' },
};

export type StatusSegmentItem<T extends string = string> = {
  value: T;
  label: React.ReactNode;
  count?: number;
  tone?: StatusTone;
};

type StatusSegmentBarProps<T extends string = string> = {
  items: StatusSegmentItem<T>[];
  value: T;
  onChange: (value: T) => void;
  sx?: SxProps<Theme>;
  size?: ButtonProps['size'];
};

export function StatusSegmentBar<T extends string = string>({
  items,
  value,
  onChange,
  sx,
  size = 'medium',
}: StatusSegmentBarProps<T>) {
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, ...sx }}>
      {items.map((item) => {
        const active = item.value === value;
        const tone = toneMap[item.tone || (active ? 'blue' : 'gray')];
        return (
          <Button
            key={item.value}
            size={size}
            variant={active ? 'contained' : 'outlined'}
            onClick={() => onChange(item.value)}
            sx={{
              height: size === 'small' ? 34 : 40,
              px: size === 'small' ? 1.35 : 1.75,
              borderRadius: moduleRadius,
              fontWeight: 800,
              color: active ? '#fff' : tone.color,
              bgcolor: active ? moduleTokens.blue : moduleTokens.surface,
              borderColor: active ? moduleTokens.blue : moduleTokens.line,
              boxShadow: 'none',
              '&:hover': {
                boxShadow: 'none',
                bgcolor: active ? '#175CD3' : tone.bg,
                borderColor: active ? '#175CD3' : tone.color,
              },
            }}
          >
            <Stack direction="row" spacing={0.75} alignItems="center">
              <span>{item.label}</span>
              {typeof item.count === 'number' ? (
                <Chip
                  size="small"
                  label={item.count}
                  sx={{
                    height: size === 'small' ? 20 : 22,
                    minWidth: size === 'small' ? 20 : 22,
                    fontWeight: 800,
                    color: active ? moduleTokens.blue : moduleTokens.ink,
                    bgcolor: active ? '#DDEBFF' : tone.bg,
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              ) : null}
            </Stack>
          </Button>
        );
      })}
    </Box>
  );
}

export const moduleTablePaperSx = {
  border: `1px solid ${moduleTokens.line}`,
  borderRadius: moduleRadius,
  boxShadow: 'none',
  overflow: 'hidden',
} as const;

export const moduleTableSx = {
  '& .MuiTableHead-root .MuiTableCell-root': {
    bgcolor: '#FAF9FD',
    color: '#625D76',
    fontWeight: 800,
    borderBottom: `1px solid ${moduleTokens.line}`,
  },
  '& .MuiTableCell-root': {
    borderBottom: `1px solid ${moduleTokens.softLine}`,
    fontSize: 13,
  },
  '& .MuiTableRow-hover:hover': {
    bgcolor: '#FAF8FF',
  },
} as const;

export const moduleDialogSx = {
  '& .MuiPaper-root': {
    borderRadius: moduleRadius,
  },
};

export { Tab };
