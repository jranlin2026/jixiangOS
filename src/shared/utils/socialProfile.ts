export type SocialProfileFields = {
  wechat?: string;
  wechatNickname?: string;
  douyinId?: string;
  douyinNickname?: string;
};

export const SOCIAL_PROFILE_FIELD_KEYS = [
  'wechatNickname',
  'douyinId',
  'douyinNickname',
] as const;

export type OptionalSocialProfileFieldKey = typeof SOCIAL_PROFILE_FIELD_KEYS[number];

export const SOCIAL_PROFILE_FIELD_LABELS: Record<OptionalSocialProfileFieldKey, string> = {
  wechatNickname: '微信昵称',
  douyinId: '抖音号',
  douyinNickname: '抖音昵称',
};

export function normalizeOptionalSocialProfileValue(value: unknown, label: string): string | undefined {
  const text = String(value || '').trim();
  if (!text) return undefined;
  if (/[\r\n]/.test(text)) throw new Error(`${label}不能包含换行`);
  if (text.length > 100) throw new Error(`${label}不能超过100个字符`);
  return text;
}

export function normalizeOptionalSocialProfileFields<T extends Partial<SocialProfileFields>>(value: T): T {
  const normalized = { ...value };
  for (const key of SOCIAL_PROFILE_FIELD_KEYS) {
    (normalized as Partial<SocialProfileFields>)[key] = normalizeOptionalSocialProfileValue(
      value[key],
      SOCIAL_PROFILE_FIELD_LABELS[key],
    );
  }
  return normalized;
}

export function formatSocialProfileSummary(profile: Partial<SocialProfileFields>): string {
  const wechat = String(profile.wechatNickname || profile.wechat || '').trim();
  const douyin = String(profile.douyinNickname || profile.douyinId || '').trim();
  const parts = [wechat ? `微信：${wechat}` : '', douyin ? `抖音：${douyin}` : ''].filter(Boolean);
  return parts.join(' · ') || '暂未填写社交账号';
}
