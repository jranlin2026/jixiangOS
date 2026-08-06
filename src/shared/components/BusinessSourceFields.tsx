import React, { useMemo } from 'react';
import { Box, MenuItem, TextField } from '@mui/material';
import type { AfterSalesSourceConfig } from '../../types/settings';
import type { Product } from '../../types/product';
import { getProductLevelColor } from '../utils/constants';

export type BusinessSourceValue = {
  sourcePlatformId: string;
  sourcePlatformName: string;
  sourceShopId: string;
  sourceShopName: string;
  platformOrderNo: string;
  sourceProductId?: string;
  sourceProductName?: string;
  sourcePaymentAmount?: string;
  sourcePaymentAt?: string;
};

type BusinessSourceFieldsProps = {
  configs: AfterSalesSourceConfig[];
  products?: Product[];
  value: BusinessSourceValue;
  onChange: (value: BusinessSourceValue) => void;
  includePaymentTime?: boolean;
  includePurchaseSnapshot?: boolean;
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
  products = [],
  value,
  onChange,
  includePaymentTime = false,
  includePurchaseSnapshot = false,
  paymentTimeLabel = '平台付款时间',
  platformOrderLabel = '平台订单号',
  disabled = false,
}) => {
  const platforms = useMemo(() => configs
    .filter((item) => !item.parentId && (item.isActive || item.id === value.sourcePlatformId))
    .sort((left, right) => left.sortOrder - right.sortOrder), [configs, value.sourcePlatformId]);
  const shops = useMemo(() => configs
    .filter((item) => item.parentId === value.sourcePlatformId && (item.isActive || item.id === value.sourceShopId))
    .sort((left, right) => left.sortOrder - right.sortOrder), [configs, value.sourcePlatformId, value.sourceShopId]);
  const productOptions = useMemo(() => [...products].sort((left, right) => left.sortOrder - right.sortOrder), [products]);
  const selectedProductIsAvailable = productOptions.some((product) => product.id === value.sourceProductId);
  const selectedProductValue = selectedProductIsAvailable
    ? value.sourceProductId || ''
    : value.sourceProductName ? `legacy:${value.sourceProductName}` : '';
  const paymentAmount = Number(value.sourcePaymentAmount);
  const paymentAmountError = Boolean(value.sourcePaymentAmount)
    && (!Number.isFinite(paymentAmount) || paymentAmount < 0);

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
      {includePurchaseSnapshot && (
        <TextField
          select
          label="平台购买产品"
          value={selectedProductValue}
          disabled={disabled}
          onChange={(event) => {
            const product = productOptions.find((item) => item.id === event.target.value);
            onChange({
              ...value,
              sourceProductId: product?.id || '',
              sourceProductName: product?.name || '',
              sourcePaymentAmount: product ? String(product.price) : '',
            });
          }}
          fullWidth
        >
          <MenuItem value="">未选择</MenuItem>
          {productOptions.map((product) => (
            <MenuItem key={product.id} value={product.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: getProductLevelColor(product.level) }} />
                {product.name}
              </Box>
            </MenuItem>
          ))}
          {value.sourceProductName && !selectedProductIsAvailable ? (
            <MenuItem value={`legacy:${value.sourceProductName}`} disabled>{value.sourceProductName}（历史产品）</MenuItem>
          ) : null}
        </TextField>
      )}
      {includePurchaseSnapshot && (
        <TextField
          label="平台付款金额"
          type="number"
          value={value.sourcePaymentAmount || ''}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, sourcePaymentAmount: event.target.value })}
          inputProps={{ min: 0, step: 0.01 }}
          placeholder="可选"
          error={paymentAmountError}
          helperText={paymentAmountError ? '平台付款金额不能小于 0' : '仅作客户来源快照，不计入正式资金流水'}
          fullWidth
        />
      )}
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
