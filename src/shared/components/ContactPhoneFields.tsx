import React, { useEffect, useState } from 'react';
import { Box, Button, Stack } from '@mui/material';
import PhoneNumberInput from './PhoneNumberInput';

type ContactPhoneFieldsProps = {
  primaryPhone: string;
  alternatePhone: string;
  onPrimaryChange: (value: string) => void;
  onAlternateChange: (value: string) => void;
  readOnly?: boolean;
  error?: boolean;
  helperText?: React.ReactNode;
  size?: 'small' | 'medium';
};

const ContactPhoneFields: React.FC<ContactPhoneFieldsProps> = ({
  primaryPhone,
  alternatePhone,
  onPrimaryChange,
  onAlternateChange,
  readOnly = false,
  error,
  helperText,
  size = 'small',
}) => {
  const [showAlternate, setShowAlternate] = useState(Boolean(alternatePhone));

  useEffect(() => {
    if (alternatePhone) setShowAlternate(true);
    if (!primaryPhone && !alternatePhone) setShowAlternate(false);
  }, [alternatePhone, primaryPhone]);

  const switchPrimary = () => {
    if (!alternatePhone) return;
    onPrimaryChange(alternatePhone);
    onAlternateChange(primaryPhone);
  };

  return (
    <Box
      sx={{
        gridColumn: '1 / -1',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
        gap: 2,
        minWidth: 0,
      }}
    >
      <PhoneNumberInput
        label="主手机号"
        value={primaryPhone}
        onChange={onPrimaryChange}
        error={error}
        helperText={helperText}
        readOnly={readOnly}
        fullWidth
        size={size}
      />
      {showAlternate ? (
        <Stack spacing={0.75} sx={{ minWidth: 0 }}>
          <PhoneNumberInput
            label="备用手机号"
            value={alternatePhone}
            onChange={onAlternateChange}
            error={error}
            readOnly={readOnly}
            fullWidth
            size={size}
          />
          {!readOnly && (
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button size="small" onClick={switchPrimary}>设为主号</Button>
              <Button size="small" color="error" onClick={() => {
                onAlternateChange('');
                setShowAlternate(false);
              }}>删除备用号</Button>
            </Stack>
          )}
        </Stack>
      ) : (
        !readOnly && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
            <Button
              variant="outlined"
              size="small"
              disabled={!primaryPhone.trim()}
              onClick={() => setShowAlternate(true)}
              sx={{ minHeight: size === 'small' ? 40 : 56 }}
            >
              + 添加备用手机号
            </Button>
          </Box>
        )
      )}
    </Box>
  );
};

export default ContactPhoneFields;
