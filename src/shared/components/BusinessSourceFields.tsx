import React, { useMemo } from 'react';
import { MenuItem, TextField } from '@mui/material';
import type { AfterSalesSourceConfig } from '../../types/settings';

export type BusinessSourceValue = {
  sourcePlatformId: string;
  sourcePlatformName: string;
  sourceShopId: string;
  sourceShopName: string;
  platformOrderNo: string;
  sourcePaymentAt?: string;
};

type BusinessSourceFieldsProps = {
  configs: AfterSalesSourceConfig[];
  value: BusinessSourceValue;
  onChange: (value: BusinessSourceValue) => void;
  includePaymentTime?: boolean;
  paymentTimeLabel?: string;
  platformOrderLabel?: string;
  disabled?: boolean;
};

function dateTimeLocalValue(value?: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 19);
}

function nowDateTimeLocal(): string {
  return dateTimeLocalValue(new Date().toISOString());
}

const BusinessSourceFields: React.FC<BusinessSourceFieldsProps> = ({
  configs,
  value,
  onChange,
  includePaymentTime = false,
  paymentTimeLabel = '付款时间',
  platformOrderLabel = '平台订单号',
  disabled = false,
}) => {
  const platforms = useMemo(() => configs
    .filter((item) => !item.parentId && (item.isActive || item.id === value.sourcePlatformId))
    .sort((left, right) => left.sortOrder - right.sortOrder), [configs, value.sourcePlatformId]);
  const shops = useMemo(() => configs
    .filter((item) => item.parentId === value.sourcePlatformId && (item.isActive || item.id === value.sourceShopId))
    .sort((left, right) => left.sortOrder - right.sortOrder), [configs, value.sourcePlatformId, value.sourceShopId]);

  return (
    <>
      <TextField
        select
        label="来源平台"
        value={value.sourcePlatformId}
        disabled={disabled}
        onChange={(event) => {
          const platform = platforms.find((item) => item.id === event.target.value);
          onChange({
            ...value,
            sourcePlatformId: platform?.id || '',
            sourcePlatformName: platform?.name || '',
            sourceShopId: '',
            sourceShopName: '',
          });
        }}
        fullWidth
      >
        <MenuItem value="">未选择</MenuItem>
        {platforms.map((platform) => <MenuItem key={platform.id} value={platform.id}>{platform.name}</MenuItem>)}
      </TextField>
      <TextField
        select
        label="来源店铺"
        value={value.sourceShopId}
        disabled={disabled || !value.sourcePlatformId}
        onChange={(event) => {
          const shop = shops.find((item) => item.id === event.target.value);
          onChange({ ...value, sourceShopId: shop?.id || '', sourceShopName: shop?.name || '' });
        }}
        fullWidth
      >
        <MenuItem value="">未选择</MenuItem>
        {shops.map((shop) => <MenuItem key={shop.id} value={shop.id}>{shop.name}</MenuItem>)}
      </TextField>
      <TextField
        label={platformOrderLabel}
        value={value.platformOrderNo}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, platformOrderNo: event.target.value })}
        placeholder="可选，保留字母、数字和前导零"
        fullWidth
      />
      {includePaymentTime && (
        <TextField
          label={paymentTimeLabel}
          type="datetime-local"
          value={dateTimeLocalValue(value.sourcePaymentAt)}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, sourcePaymentAt: event.target.value })}
          InputLabelProps={{ shrink: true }}
          inputProps={{ step: 1, max: nowDateTimeLocal() }}
          fullWidth
        />
      )}
    </>
  );
};

export default BusinessSourceFields;
