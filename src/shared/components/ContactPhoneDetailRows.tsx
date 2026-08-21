import React, { useEffect, useState } from 'react';
import { Box, Button, Stack } from '@mui/material';
import PhoneNumberInput from './PhoneNumberInput';
import { CRM_DETAIL_FIELD_COLUMNS } from './crmDetailLayout';

type ContactPhoneDetailRowsProps = {
  primaryPhone: string;
  alternatePhone: string;
  editing: boolean;
  primaryEditable: boolean;
  alternateEditable: boolean;
  onPrimaryChange: (value: string) => void;
  onAlternateChange: (value: string) => void;
  error?: boolean;
  helperText?: React.ReactNode;
};

const rowSx = {
  display: 'grid',
  gridTemplateColumns: CRM_DETAIL_FIELD_COLUMNS,
  borderBottom: '1px solid #eef2f7',
  minHeight: 38,
} as const;

const labelSx = {
  bgcolor: '#f6f8fb',
  px: 1.25,
  py: 1,
  color: '#64748b',
  fontSize: 13,
} as const;

const ContactPhoneDetailRows: React.FC<ContactPhoneDetailRowsProps> = ({
  primaryPhone,
  alternatePhone,
  editing,
  primaryEditable,
  alternateEditable,
  onPrimaryChange,
  onAlternateChange,
  error,
  helperText,
}) => {
  const [showAlternateInput, setShowAlternateInput] = useState(Boolean(alternatePhone));

  useEffect(() => {
    if (alternatePhone) setShowAlternateInput(true);
    if (!primaryPhone && !alternatePhone) setShowAlternateInput(false);
  }, [alternatePhone, primaryPhone]);

  const switchPrimary = () => {
    if (!alternatePhone) return;
    onPrimaryChange(alternatePhone);
    onAlternateChange(primaryPhone);
  };

  return (
    <>
      <Box data-testid="contact-phone-detail-primary-row" sx={rowSx}>
        <Box sx={labelSx}>手机</Box>
        <Box sx={{ px: 1.5, py: editing && primaryEditable ? 0.5 : 1, minWidth: 0, fontSize: 13 }}>
          {editing && primaryEditable ? (
            <PhoneNumberInput
              label="主手机号"
              value={primaryPhone}
              onChange={onPrimaryChange}
              error={error}
              helperText={helperText}
              size="small"
              fullWidth
            />
          ) : (primaryPhone || '未填写')}
        </Box>
      </Box>

      <Box data-testid="contact-phone-detail-alternate-row" sx={rowSx}>
        <Box sx={labelSx}>备用手机</Box>
        <Box sx={{ px: 1.5, py: editing && alternateEditable ? 0.5 : 1, minWidth: 0, fontSize: 13 }}>
          {editing && alternateEditable ? (
            showAlternateInput ? (
              <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                <PhoneNumberInput
                  label="备用手机号"
                  value={alternatePhone}
                  onChange={onAlternateChange}
                  error={error}
                  size="small"
                  fullWidth
                />
                <Stack direction="row" spacing={0.5} justifyContent="flex-end" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                  {primaryEditable && (
                    <Button size="small" onClick={switchPrimary} sx={{ whiteSpace: 'nowrap' }}>
                      设为主号
                    </Button>
                  )}
                  <Button
                    size="small"
                    color="error"
                    onClick={() => {
                      onAlternateChange('');
                      setShowAlternateInput(false);
                    }}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    删除备用号
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Button
                variant="outlined"
                size="small"
                disabled={!primaryPhone.trim()}
                onClick={() => setShowAlternateInput(true)}
                sx={{ minHeight: 40, whiteSpace: 'nowrap' }}
              >
                + 添加备用手机号
              </Button>
            )
          ) : (alternatePhone || '未填写')}
        </Box>
      </Box>
    </>
  );
};

export default ContactPhoneDetailRows;
