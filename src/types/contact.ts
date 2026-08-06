export type ContactPhoneLabel = '主手机号' | '备用手机号';

/**
 * 客户/线索的手机号集合。旧 phone 字段始终镜像 isPrimary=true 的号码，
 * 以兼容订单、售后和历史导入链路。
 */
export interface ContactPhone {
  number: string;
  isPrimary: boolean;
  label: ContactPhoneLabel;
}
