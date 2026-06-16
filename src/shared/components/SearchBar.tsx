import React from 'react';
import { TextField, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ value, onChange, placeholder = '搜索...' }) => {
  return (
    <TextField
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      sx={{ minWidth: 240 }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon sx={{ color: '#9ca3af', fontSize: 20 }} />
          </InputAdornment>
        ),
      }}
    />
  );
};

export default SearchBar;
