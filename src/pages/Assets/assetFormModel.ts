export type AssetFormType = 'device' | 'phone' | 'account';

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
    { title: '归属与使用', summary: '实名 / 主体 / 部门 / 负责人' },
    { title: '套餐与状态', summary: '运营商 / 套餐 / 费用 / 状态' },
  ],
  account: [
    { title: '平台与账号', summary: '平台 / 类型 / 名称 / 登录账号' },
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
