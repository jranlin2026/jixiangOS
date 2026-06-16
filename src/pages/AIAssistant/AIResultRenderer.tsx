import React from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, List, ListItem, ListItemIcon, ListItemText } from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import TableChartIcon from '@mui/icons-material/TableChart';
import ArticleIcon from '@mui/icons-material/Article';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { AIResultData } from '../../types/ai';
import { formatCurrency } from '../../shared/utils/formatters';

interface AIResultRendererProps {
  result: AIResultData;
}

const AIResultRenderer: React.FC<AIResultRendererProps> = ({ result }) => {
  switch (result.type) {
    case 'CHART':
      return (
        <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2, p: 2, mt: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <BarChartIcon fontSize="small" sx={{ color: '#2196F3' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{result.title}</Typography>
          </Box>
          {result.chartData && result.chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={result.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey={Object.keys(result.chartData[0])[0]} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: '0.8125rem' }} />
                <Bar dataKey={Object.keys(result.chartData!).find((k) => k !== Object.keys(result.chartData!)[0]) || 'value'} fill="#2196F3" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Paper>
      );

    case 'TABLE':
      return (
        <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2, p: 2, mt: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <TableChartIcon fontSize="small" sx={{ color: '#4CAF50' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{result.title}</Typography>
          </Box>
          {result.tableHeaders && result.tableRows && (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {result.tableHeaders.map((h) => (
                      <TableCell key={h.key} sx={{ fontWeight: 600, fontSize: '0.75rem' }}>{h.label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.tableRows.map((row, i) => (
                    <TableRow key={i}>
                      {result.tableHeaders!.map((h) => (
                        <TableCell key={h.key} sx={{ fontSize: '0.8125rem' }}>
                          {String(row[h.key] ?? '-')}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      );

    case 'SUGGESTION':
      return (
        <Paper elevation={0} sx={{ border: '1px solid #FFF3E0', borderRadius: 2, p: 2, mt: 1, bgcolor: '#FFFBF0' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <LightbulbIcon fontSize="small" sx={{ color: '#FF9800' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#FF9800' }}>{result.title}</Typography>
          </Box>
          <List dense>
            {result.suggestions?.map((s, i) => (
              <ListItem key={i} sx={{ py: 0.25 }}>
                <ListItemText
                  primary={`${i + 1}. ${s}`}
                  primaryTypographyProps={{ variant: 'body2', color: '#1a1a2e' }}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      );

    case 'TEXT':
    default:
      return (
        <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2, p: 2, mt: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <ArticleIcon fontSize="small" sx={{ color: '#2196F3' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{result.title}</Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#1a1a2e', lineHeight: 1.7 }}>{result.content}</Typography>
        </Paper>
      );
  }
};

export default AIResultRenderer;
