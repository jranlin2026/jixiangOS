import React, { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface BusinessFormSectionProps {
  step: number;
  title: string;
  summary?: string;
  errorCount?: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

/** 极享OS业务表单统一分段：步骤、摘要、展开状态和错误状态都在标题栏清晰呈现。 */
const BusinessFormSection: React.FC<BusinessFormSectionProps> = ({
  step,
  title,
  summary,
  errorCount = 0,
  defaultExpanded = true,
  children,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (errorCount > 0) setExpanded(true);
  }, [errorCount]);

  const hasError = errorCount > 0;
  const borderColor = hasError ? '#fecaca' : '#d6e4f5';
  const headerBackground = hasError ? '#fff1f2' : '#eff6ff';

  return (
    <Accordion
      component="section"
      expanded={expanded}
      onChange={(_event, nextExpanded) => setExpanded(nextExpanded)}
      disableGutters
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor,
        borderRadius: '14px !important',
        overflow: 'hidden',
        bgcolor: '#fff',
        boxShadow: expanded
          ? '0 10px 28px rgba(15, 23, 42, 0.06)'
          : '0 3px 10px rgba(15, 23, 42, 0.035)',
        transition: 'border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
        '&:before': { display: 'none' },
        '& + &': { mt: 2 },
        '&:hover': { borderColor: hasError ? '#fca5a5' : '#bfd3ee' },
      }}
    >
      <AccordionSummary
        expandIcon={(
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.5,
              display: 'grid',
              placeItems: 'center',
              color: hasError ? '#b91c1c' : '#1d4ed8',
              bgcolor: 'transparent',
            }}
          >
            <ExpandMoreIcon fontSize="small" />
          </Box>
        )}
        sx={{
          px: { xs: 1.5, sm: 2.25 },
          minHeight: 64,
          bgcolor: headerBackground,
          borderBottom: expanded ? '1px solid' : '0 solid',
          borderBottomColor: hasError ? '#fecaca' : '#dbe7f5',
          cursor: 'pointer',
          transition: 'background-color 160ms ease',
          '&:hover': { bgcolor: hasError ? '#ffe4e6' : '#e8f2ff' },
          '&.Mui-expanded': { minHeight: 64 },
          '& .MuiAccordionSummary-content': { my: 1.25, minWidth: 0 },
          '& .MuiAccordionSummary-content.Mui-expanded': { my: 1.25 },
          '& .MuiAccordionSummary-expandIconWrapper': { ml: 1 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 }, minWidth: 0, flex: 1 }}>
          <Box
            aria-hidden
            sx={{
              width: 34,
              height: 34,
              flex: '0 0 34px',
              borderRadius: 1.5,
              display: 'grid',
              placeItems: 'center',
              bgcolor: '#fff',
              color: hasError ? '#dc2626' : '#2563eb',
              border: '1.5px solid',
              borderColor: hasError ? '#f87171' : '#3b82f6',
              boxShadow: '0 2px 5px rgba(37, 99, 235, 0.08)',
              fontSize: 14,
              fontWeight: 900,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {step}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" sx={{ color: '#0f172a', fontWeight: 800, whiteSpace: 'nowrap' }}>
              {title}
            </Typography>
            <Typography
              component="span"
              variant="caption"
              noWrap
              sx={{
                minWidth: 0,
                maxWidth: '100%',
                px: 1,
                py: 0.35,
                borderRadius: '999px',
                color: hasError ? '#b91c1c' : '#52647d',
                bgcolor: hasError ? '#fee2e2' : '#e4edf8',
                fontWeight: 700,
                lineHeight: 1.35,
              }}
            >
              {hasError ? `缺少 ${errorCount} 项必填` : summary || '待填写'}
            </Typography>
          </Box>
          <Typography
            component="span"
            sx={{ position: 'absolute', width: 1, height: 1, p: 0, m: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }}
          >
            {expanded ? '收起' : '展开'}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: { xs: 2, sm: 2.5 }, bgcolor: '#fff' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {children}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

export default BusinessFormSection;
