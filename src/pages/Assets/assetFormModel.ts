import { readDeviceCommunicationType } from '../../domain/assets/assetFields';
import type { AssetDevice, AssetPhoneNumber } from '../../types/asset';

export type AssetFormType = 'device' | 'phone' | 'account';

export function formatPhoneSlotImeiLabel(
  slot: '卡槽1' | '卡槽2',
  device?: Pick<AssetDevice, 'imei1Masked' | 'imei2Masked'>,
): string {
  const imeiLabel = slot === '卡槽2' ? 'IMEI 2' : 'IMEI 1';
  const imei = slot === '卡槽2' ? device?.imei2Masked : device?.imei1Masked;
  return imei ? `${slot}（${imeiLabel}：${imei}）` : `${slot}（对应 ${imeiLabel}）`;
}

export function buildDeviceSlotRows(
  device: Pick<AssetDevice, 'communicationType' | 'simType' | 'imei1Masked' | 'imei2Masked'>,
  phones: Array<Pick<AssetPhoneNumber, 'id' | 'slotType' | 'phoneNumberMasked'>>,
) {
  const communicationType = readDeviceCommunicationType(device);
  const slots: Array<'卡槽1' | '卡槽2'> = communicationType === '无SIM'
    ? []
    : communicationType === '双卡' ? ['卡槽1', '卡槽2'] : ['卡槽1'];
  return slots.map((slotType) => {
    const isSecondSlot = slotType === '卡槽2';
    const phone = phones.find((item) => item.slotType === slotType);
    return {
      slotType,
      imeiLabel: isSecondSlot ? 'IMEI 2' : 'IMEI 1',
      imeiMasked: isSecondSlot ? device.imei2Masked : device.imei1Masked,
      phoneId: phone?.id,
      phoneNumberMasked: phone?.phoneNumberMasked,
    };
  });
}

export const ASSET_FORM_SECTIONS: Record<AssetFormType, Array<{ title: string; summary: string }>> = {
  device: [
    { title: '设备信息', summary: '类型 / 名称 / 品牌型号' },
    { title: '硬件与通信标识', summary: '序列号 / 通信方式 / IMEI' },
    { title: '归属与使用', summary: '主体 / 部门 / 负责人 / 使用人' },
    { title: '状态与成本', summary: '取得方式 / 成本 / 保修 / 状态' },
  ],
  phone: [
    { title: '号码与SIM', summary: '手机号 / SIM形态 / ICCID / IMSI' },
    { title: '设备绑定', summary: '可先建档，后绑定设备卡槽' },
    { title: '归属与使用', summary: '实名主体 / 实名信息 / 部门 / 负责人' },
    { title: '套餐与状态', summary: '运营商 / 归属地 / 服务密码 / 套餐 / 状态' },
  ],
  account: [
    { title: '平台与账号', summary: '平台 / 类型 / 登录账号 / 实名主体' },
    { title: '安全与绑定', summary: '手机号 / 邮箱 / 二次验证 / 控制权' },
    { title: '归属与使用', summary: '主体 / 部门 / 负责人 / 使用人' },
    { title: '经营与状态', summary: '业务场景 / 服务商 / 费用 / 状态' },
  ],
};

export function createAssetFormDefaults(type: AssetFormType): Record<string, string> {
  if (type === 'device') return {
    deviceCategory: '手机',
    communicationType: '无SIM',
    ownerSubject: '公司',
    acquisitionType: '购买',
    purchaseAmount: '0',
    monthlyRent: '0',
    status: '库存中',
  };
  if (type === 'phone') return {
    simForm: '实体SIM',
    deviceId: '',
    slotType: '',
    ownerSubject: '公司',
    operator: '',
    attributionLocation: '',
    monthlyFee: '0',
    status: '待启用',
  };
  return {
    platform: '',
    accountCategory: '主账号',
    phoneId: '',
    ownerSubject: '公司',
    controlStatus: '已掌控',
    accountStatus: '使用中',
    monthlyFee: '0',
  };
}
