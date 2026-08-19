import type { AssetInternetAccount, AssetPhoneNumber } from '../../types/asset';
import { readDeviceImeis, type DeviceImeiLike } from './deviceImei';

function operationalValue(raw: unknown, fallback: unknown): string {
  return String(raw ?? '').trim() || String(fallback ?? '').trim();
}

export function displayDeviceImei(device: DeviceImeiLike, slot: 1 | 2): string {
  const values = readDeviceImeis(device);
  return slot === 1
    ? operationalValue(values.imei1, values.imei1Masked)
    : operationalValue(values.imei2, values.imei2Masked);
}

type PhoneDisplaySource = Partial<Pick<AssetPhoneNumber,
  'phoneNumber' | 'phoneNumberMasked' | 'realName' | 'realNameMasked' | 'iccid' | 'iccidMasked' | 'imsi' | 'imsiMasked'>>;

export const displayPhoneNumber = (phone: PhoneDisplaySource): string => operationalValue(phone.phoneNumber, phone.phoneNumberMasked);
export const displayPhoneRealName = (phone: PhoneDisplaySource): string => operationalValue(phone.realName, phone.realNameMasked);
export const displayPhoneIccid = (phone: PhoneDisplaySource): string => operationalValue(phone.iccid, phone.iccidMasked);
export const displayPhoneImsi = (phone: PhoneDisplaySource): string => operationalValue(phone.imsi, phone.imsiMasked);

type AccountDisplaySource = Partial<Pick<AssetInternetAccount,
  'loginAccount' | 'loginAccountMasked' | 'realName' | 'realNameMasked' | 'boundEmail' | 'boundEmailMasked'>>;

export const displayAccountLogin = (account: AccountDisplaySource): string => operationalValue(account.loginAccount, account.loginAccountMasked);
export const displayAccountRealName = (account: AccountDisplaySource): string => operationalValue(account.realName, account.realNameMasked);
export const displayAccountEmail = (account: AccountDisplaySource): string => operationalValue(account.boundEmail, account.boundEmailMasked);
