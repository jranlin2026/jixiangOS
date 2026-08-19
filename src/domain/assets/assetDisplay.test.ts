import assert from 'node:assert/strict';
import {
  displayAccountEmail,
  displayAccountLogin,
  displayAccountRealName,
  displayDeviceImei,
  displayPhoneIccid,
  displayPhoneImsi,
  displayPhoneNumber,
  displayPhoneRealName,
} from './assetDisplay';

assert.equal(displayDeviceImei({ imei1: '356330123456789', imei1Masked: '356330******6789' }, 1), '356330123456789');
assert.equal(displayDeviceImei({ imei1: '', imei1Masked: '356330******6789' }, 1), '356330******6789');
assert.equal(displayPhoneNumber({ phoneNumber: '15300008565', phoneNumberMasked: '153****8565' }), '15300008565');
assert.equal(displayPhoneRealName({ realName: '张三', realNameMasked: '张*' }), '张三');
assert.equal(displayPhoneIccid({ iccid: '89860012345678901234', iccidMasked: '898600**********1234' }), '89860012345678901234');
assert.equal(displayPhoneImsi({ imsi: '460001234567890', imsiMasked: '46000******7890' }), '460001234567890');
assert.equal(displayAccountLogin({ loginAccount: 'jixiang99889@gmail.com', loginAccountMasked: 'jixiang99889_***' }), 'jixiang99889@gmail.com');
assert.equal(displayAccountRealName({ realName: '深圳极享科技有限公司', realNameMasked: '深***司' }), '深圳极享科技有限公司');
assert.equal(displayAccountEmail({ boundEmail: 'ops@jixiang.com', boundEmailMasked: 'op***@jixiang.com' }), 'ops@jixiang.com');
