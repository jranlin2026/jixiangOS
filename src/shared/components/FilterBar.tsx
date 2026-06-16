import React from 'react';
import { Box, TextField, MenuItem } from '@mui/material';

interface FilterItem {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

interface FilterBarProps {
  filters: Record<string, string>;
  filterItems: FilterItem[];
  onChange: (key: string, value: string) => void;
}

const FilterBar: React.FC<FilterBarProps> = ({ filters, filterItems, onChange }) => {
  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {filterItems.map((item) => (
        <TextField
          key={item.key}
          select
          size="small"
          label={item.label}
          value={filters[item.key] || ''}
          onChange={(e) => onChange(item.key, e.target.value)}
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="">全部</MenuItem>
          {item.options.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
          ))}
        </TextField>
      ))}
    </Box>
  );
};

export default FilterBar;
