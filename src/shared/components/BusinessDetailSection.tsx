import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface BusinessDetailSectionProps {
  step?: number;
  title: string;
  summary?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  columns?: 1 | 2 | 3;
}
export function BusinessDetailSection({
  step,
  title,
  summary,
  children,
  defaultExpanded = true,
  columns = 3,
}: BusinessDetailSectionProps) {
  return (
    <Accordion
      component="section"
      defaultExpanded={defaultExpanded}
      disableGutters
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '10px !important',
        overflow: 'hidden',
        '&:before': { display: 'none' },
        '& + &': { mt: 2 },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          px: { xs: 1.5, sm: 2.5 },
          minHeight: 58,
          bgcolor: step ? '#eff6ff' : '#f8fafc',
          borderBottom: step ? '1px solid #dbeafe' : undefined,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          {step ? (
            <Box
              aria-hidden="true"
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1.25,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                bgcolor: '#2563eb',
                color: '#fff',
                fontWeight: 800,
                boxShadow: '0 4px 10px rgba(37, 99, 235, 0.2)',
              }}
            >
              {step}
            </Box>
          ) : null}
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{title}</Typography>
          {summary ? <Typography variant="body2" color="text.secondary" noWrap>{summary}</Typography> : null}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 2.5 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: `repeat(${columns}, minmax(0, 1fr))`,
            },
            gap: 2,
          }}
        >
          {children}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}

interface BusinessDetailFieldProps {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
  strong?: boolean;
}

export function BusinessDetailField({ label, children, wide = false, strong = false }: BusinessDetailFieldProps) {
  return (
    <Box sx={wide ? { gridColumn: { md: '1 / -1' } } : undefined}>
      <Typography variant="body2" sx={{ color: '#6b7280' }}>{label}</Typography>
      <Box sx={{ mt: 0.25, lineHeight: 1.5, fontWeight: strong ? 700 : 500, color: strong ? '#1a1a2e' : 'inherit' }}>
        {children}
      </Box>
    </Box>
  );
}
