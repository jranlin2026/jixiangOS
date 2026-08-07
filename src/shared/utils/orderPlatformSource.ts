export type OrderPlatformSourceFields = {
  sourcePlatformId: string;
  sourcePlatformName?: string;
  sourceShopId: string;
  sourceShopName?: string;
  thirdPartyOrderNo: string;
};

export function isSelfOperatedStoreChannel(channel?: string): boolean {
  return channel === '公司自营小店';
}

export function hasOrderPlatformSource(value: OrderPlatformSourceFields): boolean {
  return Boolean(
    value.sourcePlatformId
    || value.sourceShopId
    || value.thirdPartyOrderNo.trim(),
  );
}

export function isOrderPlatformSourceComplete(value: OrderPlatformSourceFields): boolean {
  return Boolean(
    value.sourcePlatformId
    && value.sourceShopId
    && value.thirdPartyOrderNo.trim(),
  );
}

export function clearOrderPlatformSource<T extends OrderPlatformSourceFields>(value: T): T {
  return {
    ...value,
    sourcePlatformId: '',
    sourcePlatformName: '',
    sourceShopId: '',
    sourceShopName: '',
    thirdPartyOrderNo: '',
  };
}
