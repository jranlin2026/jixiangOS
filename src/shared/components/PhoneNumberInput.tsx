import React, { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, TextField } from '@mui/material';
import {
  getPhoneCountry,
  getPhoneNumberError,
  parseStoredPhoneNumber,
  PHONE_COUNTRIES,
  stripPhoneNumber,
  validatePhoneNumber,
  type PhoneCountry,
} from '../utils/phoneNumber';

type PhoneNumberInputProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  error?: boolean;
  helperText?: React.ReactNode;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
};

const PhoneNumberInput: React.FC<PhoneNumberInputProps> = ({
  label = '手机号',
  value,
  onChange,
  required,
  disabled,
  readOnly,
  error,
  helperText,
  size = 'medium',
  fullWidth = true,
}) => {
  const parsed = useMemo(() => parseStoredPhoneNumber(value), [value]);
  const [countryCode, setCountryCode] = useState(parsed.countryCode);
  const [countryOpen, setCountryOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const country = getPhoneCountry(countryCode);
  const phoneError = getPhoneNumberError(value);
  const showError = Boolean(error || phoneError);

  useEffect(() => {
    if (String(value || '').trim()) setCountryCode(parsed.countryCode);
  }, [parsed.countryCode, value]);

  const commitValue = (nextCountry: PhoneCountry, nationalNumber: string) => {
    setCountryCode(nextCountry.code);
    const cleanNumber = stripPhoneNumber(nationalNumber);
    if (!cleanNumber) {
      onChange('');
      return;
    }
    const validation = validatePhoneNumber(cleanNumber, nextCountry.code);
    onChange(validation.valid && validation.normalized ? validation.normalized : `${nextCountry.dialCode}${cleanNumber}`);
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '148px minmax(0, 1fr)', gap: 0.75, width: fullWidth ? '100%' : undefined, minWidth: 0 }}>
      <Autocomplete
        size={size}
        disabled={disabled || readOnly}
        options={PHONE_COUNTRIES}
        slotProps={{ popper: { sx: { minWidth: 260 } } }}
        open={countryOpen}
        onOpen={() => {
          setCountrySearch('');
          setCountryOpen(true);
        }}
        onClose={() => {
          setCountrySearch('');
          setCountryOpen(false);
        }}
        inputValue={countryOpen ? countrySearch : `${country.name} ${country.dialCode}`}
        onInputChange={(_, nextInputValue, reason) => {
          if (!countryOpen || reason === 'reset') return;
          setCountrySearch(nextInputValue);
        }}
        value={country}
        disableClearable
        getOptionLabel={(option) => `${option.name} ${option.dialCode}`}
        isOptionEqualToValue={(option, selected) => option.code === selected.code}
        onChange={(_, nextCountry) => {
          commitValue(nextCountry, parsed.nationalNumber);
          setCountrySearch('');
          setCountryOpen(false);
        }}
        renderOption={(props, option) => (
          <Box component="li" {...props} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Box component="span" sx={{ width: 22 }}>{option.flag}</Box>
            <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{option.name}</Box>
            <Box component="span" sx={{ ml: 'auto', color: '#64748b' }}>{option.dialCode}</Box>
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            variant="outlined"
            placeholder="搜索"
            required={required}
            sx={{
              width: '100%',
              '& .MuiInputBase-root': { height: size === 'small' ? 40 : 56 },
              '& .MuiInputBase-input': {
                fontSize: '0.8125rem',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            }}
            InputProps={{
              ...params.InputProps,
              readOnly,
              startAdornment: (
                <Box component="span" sx={{ mr: 0.5, fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  {country.flag}
                </Box>
              ),
            }}
          />
        )}
      />
      <TextField
        label={label}
        value={parsed.nationalNumber}
        onChange={(event) => commitValue(country, event.target.value)}
        required={required}
        disabled={disabled}
        error={showError}
        helperText={phoneError || helperText}
        size={size}
        fullWidth
        sx={{
          minWidth: 0,
          '& .MuiInputBase-root': { height: size === 'small' ? 40 : 56 },
        }}
        InputProps={{ readOnly }}
      />
    </Box>
  );
};

export default PhoneNumberInput;
