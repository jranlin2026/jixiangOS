import assert from 'node:assert/strict';
import {
  clearOrderPlatformSource,
  hasOrderPlatformSource,
  isOrderPlatformSourceComplete,
  isSelfOperatedStoreChannel,
} from './orderPlatformSource';

assert.equal(isSelfOperatedStoreChannel('公司自营小店'), true);
assert.equal(isSelfOperatedStoreChannel('对公银行转账'), false);

assert.equal(hasOrderPlatformSource({
  sourcePlatformId: 'platform-1',
  sourceShopId: '',
  thirdPartyOrderNo: '',
}), true);
assert.equal(hasOrderPlatformSource({
  sourcePlatformId: '',
  sourceShopId: '',
  thirdPartyOrderNo: '',
}), false);

assert.equal(isOrderPlatformSourceComplete({
  sourcePlatformId: 'platform-1',
  sourceShopId: 'shop-1',
  thirdPartyOrderNo: 'ORDER-1',
}), true);
assert.equal(isOrderPlatformSourceComplete({
  sourcePlatformId: 'platform-1',
  sourceShopId: '',
  thirdPartyOrderNo: 'ORDER-1',
}), false);

assert.deepEqual(clearOrderPlatformSource({
  sourcePlatformId: 'platform-1',
  sourcePlatformName: '抖音',
  sourceShopId: 'shop-1',
  sourceShopName: '旗舰店',
  thirdPartyOrderNo: 'ORDER-1',
  notes: '保留备注',
}), {
  sourcePlatformId: '',
  sourcePlatformName: '',
  sourceShopId: '',
  sourceShopName: '',
  thirdPartyOrderNo: '',
  notes: '保留备注',
});
