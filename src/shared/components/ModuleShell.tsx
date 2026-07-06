import React from 'react';
import { Box, Button, Chip, Stack, Tab, Tabs, Typography } from '@mui/material';
import type { BoxProps, ButtonProps, SxProps, Theme } from '@mui/material';

export const moduleTokens = {
  page: '#F6F8FB',
  surface: '#FFFFFF',
  ink: '#101828',
  muted: '#667085',
  line: '#DDE4EC',
  softLine: '#E5E7EB',
  subtle: '#F8FAFC',
  blue: '#1E6BFF',
  green: '#059669',
  amber: '#B76A00',
  red: '#D92D20',
  gray: '#64748B',
};

export const moduleRadius = '6px';

type ModulePageProps = BoxProps & {
  maxWidth?: number | string;
};

export const ModulePage: React.FC<ModulePageProps> = ({
  children,
  maxWidth = 'none',
  sx,
  ...props
}) => (
  <Box
    sx={{
      minHeight: '100%',
      bgcolor: moduleTokens.page,
      p: 3,
      ...sx,
    }}
    {...props}
  >
    <Box sx={{ width: '100%', maxWidth, mx: maxWidth === 'none' ? 0 : 'auto' }}>
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
      <Typography variant="h5" sx={{ fontWeight: 800, color: moduleTokens.ink, lineHeight: 1.25 }}>
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
    sx={{
      mb: 2,
      minHeight: 40,
      borderBottom: `1px solid ${moduleTokens.softLine}`,
      '& .MuiTab-root': {
        minHeight: 40,
        px: 2,
        fontWeight: 700,
        color: moduleTokens.muted,
      },
      '& .Mui-selected': {
        color: moduleTokens.blue,
      },
      '& .MuiTabs-indicator': {
        height: 3,
        borderRadius: '3px 3px 0 0',
        bgcolor: moduleTokens.blue,
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
    bgcolor: '#F1F5F9',
    color: '#475569',
    fontWeight: 800,
    borderBottom: `1px solid ${moduleTokens.line}`,
  },
  '& .MuiTableCell-root': {
    borderBottom: `1px solid ${moduleTokens.softLine}`,
    fontSize: 13,
  },
  '& .MuiTableRow-hover:hover': {
    bgcolor: '#F8FBFF',
  },
} as const;

export const moduleDialogSx = {
  '& .MuiPaper-root': {
    borderRadius: moduleRadius,
  },
};

export { Tab };
