import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import TableChartIcon from '@mui/icons-material/TableChart';
import ArticleIcon from '@mui/icons-material/Article';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import InsightsIcon from '@mui/icons-material/Insights';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AIAssistantTone, AIResultData } from '../../types/ai';

interface AIResultRendererProps {
  result: AIResultData;
}

const toneColors: Record<AIAssistantTone, string> = {
  primary: '#2563eb',
  success: '#16a34a',
  warning: '#f59e0b',
  error: '#dc2626',
  info: '#0891b2',
  neutral: '#6b7280',
};

function ResultShell({ children, tone = 'primary' }: { children: React.ReactNode; tone?: AIAssistantTone }) {
  return (
    <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2, p: 2, mt: 1, bgcolor: '#fff' }}>
      <Box sx={{ borderLeft: `3px solid ${toneColors[tone]}`, pl: 1.5 }}>
        {children}
      </Box>
    </Paper>
  );
}

const AIResultRenderer: React.FC<AIResultRendererProps> = ({ result }) => {
  const navigate = useNavigate();
  const renderActions = () => {
    if (!result.actions?.length) return null;
    return (
      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
        {result.actions.map((action) => (
          <Button
            key={`${action.label}-${action.path}`}
            size="small"
            variant={action.variant || 'outlined'}
            endIcon={<OpenInNewIcon fontSize="small" />}
            onClick={() => navigate(action.path)}
          >
            {action.label}
          </Button>
        ))}
      </Stack>
    );
  };

  switch (result.type) {
    case 'METRIC':
      return (
        <ResultShell tone="info">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
            <InsightsIcon fontSize="small" sx={{ color: '#0891b2' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{result.title}</Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 1 }}>
            {result.metrics?.map((metric) => (
              <Box key={metric.id} sx={{ border: '1px solid #eef2f7', borderRadius: 1.5, p: 1.25 }}>
                <Typography variant="caption" sx={{ color: '#6b7280' }}>{metric.label}</Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: toneColors[metric.tone] }}>{metric.value}</Typography>
                {metric.subValue && <Typography variant="caption" sx={{ color: '#9ca3af' }}>{metric.subValue}</Typography>}
              </Box>
            ))}
          </Box>
          {renderActions()}
        </ResultShell>
      );

    case 'ACTION':
      return (
        <ResultShell tone="primary">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <OpenInNewIcon fontSize="small" sx={{ color: '#2563eb' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{result.title}</Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#4b5563', mt: 0.75 }}>{result.content}</Typography>
          {renderActions()}
        </ResultShell>
      );

    case 'CHART': {
      const firstRow = result.chartData?.[0] || {};
      const keys = Object.keys(firstRow);
      const xKey = keys[0] || 'name';
      const yKey = keys.find((key) => key !== xKey && typeof firstRow[key] === 'number') || keys[1] || 'value';
      return (
        <ResultShell tone="primary">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
            <BarChartIcon fontSize="small" sx={{ color: '#2563eb' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{result.title}</Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#6b7280', mb: 1 }}>{result.content}</Typography>
          {result.chartData && result.chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={result.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: '0.8125rem' }} />
                <Bar dataKey={yKey} fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {renderActions()}
        </ResultShell>
      );
    }

    case 'TABLE':
      return (
        <ResultShell tone="success">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
            <TableChartIcon fontSize="small" sx={{ color: '#16a34a' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{result.title}</Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#6b7280', mb: 1 }}>{result.content}</Typography>
          {result.tableHeaders && result.tableRows && (
            <TableContainer sx={{ border: '1px solid #eef2f7', borderRadius: 1.5 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {result.tableHeaders.map((header) => (
                      <TableCell key={header.key} sx={{ fontWeight: 700, fontSize: '0.75rem', bgcolor: '#f8fafc' }}>
                        {header.label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.tableRows.map((row, index) => (
                    <TableRow key={index}>
                      {result.tableHeaders!.map((header) => (
                        <TableCell key={header.key} sx={{ fontSize: '0.8125rem' }}>
                          {String(row[header.key] ?? '-')}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {renderActions()}
        </ResultShell>
      );

    case 'SUGGESTION':
      return (
        <ResultShell tone="warning">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
            <LightbulbIcon fontSize="small" sx={{ color: '#f59e0b' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{result.title}</Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#6b7280' }}>{result.content}</Typography>
          <List dense sx={{ py: 0.5 }}>
            {result.suggestions?.map((suggestion, index) => (
              <ListItem key={index} sx={{ py: 0.25, px: 0 }}>
                <Chip label={index + 1} size="small" sx={{ mr: 1, height: 20, minWidth: 20 }} />
                <ListItemText primary={suggestion} primaryTypographyProps={{ variant: 'body2', color: '#111827' }} />
              </ListItem>
            ))}
          </List>
          {renderActions()}
        </ResultShell>
      );

    case 'TEXT':
    default:
      return (
        <ResultShell tone="primary">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
            <ArticleIcon fontSize="small" sx={{ color: '#2563eb' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{result.title}</Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#1f2937', lineHeight: 1.7 }}>{result.content}</Typography>
          {renderActions()}
        </ResultShell>
      );
  }
};

export default AIResultRenderer;
