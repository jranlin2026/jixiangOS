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
  const borderColor = hasError ? '#ef4444' : '#93b4ee';
  const headerBackground = hasError ? '#fff1f2' : expanded ? '#eaf2ff' : '#f1f6ff';

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
        borderLeft: '4px solid',
        borderLeftColor: hasError ? '#dc2626' : '#2563eb',
        borderRadius: '12px !important',
        overflow: 'hidden',
        bgcolor: '#fff',
        boxShadow: expanded ? '0 8px 22px rgba(37, 99, 235, 0.08)' : 'none',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
        '&:before': { display: 'none' },
        '& + &': { mt: 2 },
        '&:focus-within': { boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.14)' },
      }}
    >
      <AccordionSummary
        expandIcon={(
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              color: hasError ? '#b91c1c' : '#1d4ed8',
              bgcolor: hasError ? '#fee2e2' : '#dbeafe',
              border: '1px solid',
              borderColor: hasError ? '#fecaca' : '#bfdbfe',
            }}
          >
            <ExpandMoreIcon fontSize="small" />
          </Box>
        )}
        sx={{
          px: { xs: 1.5, sm: 2.25 },
          minHeight: 68,
          bgcolor: headerBackground,
          borderBottom: expanded ? '1px solid' : '0 solid',
          borderBottomColor: hasError ? '#fecaca' : '#bfdbfe',
          cursor: 'pointer',
          transition: 'background-color 160ms ease',
          '&:hover': { bgcolor: hasError ? '#ffe4e6' : '#dfeaff' },
          '&.Mui-expanded': { minHeight: 68 },
          '& .MuiAccordionSummary-content': { my: 1.25, minWidth: 0 },
          '& .MuiAccordionSummary-content.Mui-expanded': { my: 1.25 },
          '& .MuiAccordionSummary-expandIconWrapper': { gap: 0.75 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, flex: 1 }}>
          <Box
            aria-hidden
            sx={{
              width: 30,
              height: 30,
              flex: '0 0 30px',
              borderRadius: 1.25,
              display: 'grid',
              placeItems: 'center',
              bgcolor: hasError ? '#dc2626' : '#2563eb',
              color: '#fff',
              fontSize: 14,
              fontWeight: 900,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {step}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" sx={{ color: '#0f172a', fontWeight: 900, whiteSpace: 'nowrap' }}>
              {title}
            </Typography>
            <Typography
              variant="body2"
              noWrap
              sx={{ minWidth: 0, color: hasError ? '#b91c1c' : '#52647d', fontWeight: hasError ? 700 : 500 }}
            >
              {hasError ? `缺少 ${errorCount} 项必填` : summary || '待填写'}
            </Typography>
          </Box>
          <Typography
            variant="caption"
            sx={{ display: { xs: 'none', sm: 'block' }, mr: 0.5, color: hasError ? '#b91c1c' : '#1d4ed8', fontWeight: 800 }}
          >
            {expanded ? '收起' : '展开'}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: { xs: 1.75, sm: 2.5 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {children}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

export default BusinessFormSection;
