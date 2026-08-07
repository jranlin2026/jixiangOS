import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { NotificationChannelAdapter } from './notificationWorker';

type FeishuOptions = {
  prisma: Pick<PrismaClient, 'userChannelBinding'>;
  appId?: string;
  appSecret?: string;
  publicAppUrl?: string;
  fetchImpl?: typeof fetch;
};

type FeishuJson = { code?: number; msg?: string; [key: string]: any };

function cleanPhone(value: unknown) {
  return String(value || '').replace(/[\s-]/g, '').trim();
}

function safeActionUrl(baseUrl: string, actionUrl: unknown) {
  const path = String(actionUrl || '').trim();
  if (!path.startsWith('/') || path.startsWith('//')) return baseUrl;
  const base = new URL(`${baseUrl.replace(/\/$/, '')}/`);
  const target = new URL(path, base);
  return target.origin === base.origin ? target.toString() : base.toString();
}

function card(notification: any, url: string) {
  const severityLabel: Record<string, string> = { S0: '紧急', S1: '重要', S2: '提醒', S3: '通知' };
  return {
    config: { wide_screen_mode: true },
    header: {
      template: notification.severity === 'S0' ? 'red' : notification.severity === 'S1' ? 'orange' : 'blue',
      title: { tag: 'plain_text', content: String(notification.title || '极享OS提醒') },
    },
    elements: [
      {
        tag: 'markdown',
        content: `**${severityLabel[String(notification.severity)] || '提醒'}**\n${String(notification.content || '请进入极享OS查看详情')}`,
      },
      {
        tag: 'action',
        actions: [{
          tag: 'button', type: 'primary', text: { tag: 'plain_text', content: '进入极享OS处理' }, url,
        }],
      },
    ],
  };
}

export function createFeishuNotificationAdapter(options: FeishuOptions): NotificationChannelAdapter {
  const fetchImpl = options.fetchImpl || fetch;
  const appId = String(options.appId || '').trim();
  const appSecret = String(options.appSecret || '').trim();
  const publicAppUrl = String(options.publicAppUrl || '').trim().replace(/\/$/, '');
  let tokenCache: { token: string; expiresAt: number } | null = null;

  const post = async (url: string, body: unknown, token?: string): Promise<FeishuJson> => {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await response.json() as FeishuJson;
    if (!response.ok) throw new Error(`飞书接口HTTP ${response.status}`);
    return data;
  };

  const tenantToken = async () => {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
    const result = await post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      app_id: appId,
      app_secret: appSecret,
    });
    const token = String(result.tenant_access_token || '');
    if (result.code !== 0 || !token) throw new Error(result.msg || '无法获取飞书访问凭证');
    tokenCache = { token, expiresAt: Date.now() + Number(result.expire || 7200) * 1000 };
    return token;
  };

  const resolveExternalUserId = async (context: any, token: string) => {
    if (context.binding?.active !== false && context.binding?.externalUserId) {
      return String(context.binding.externalUserId);
    }
    const mobile = cleanPhone(context.recipient?.phone);
    if (!mobile) return '';
    const result = await post(
      'https://open.feishu.cn/open-apis/contact/v3/users/batch_get_id?user_id_type=user_id',
      { mobiles: [mobile] },
      token,
    );
    const externalUserId = String(result.data?.user_list?.[0]?.user_id || '');
    if (result.code !== 0 || !externalUserId) return '';
    await options.prisma.userChannelBinding.upsert({
      where: { userId_channel: { userId: context.recipient.id, channel: 'FEISHU' } },
      create: {
        id: `binding-${randomUUID()}`, userId: context.recipient.id, channel: 'FEISHU',
        externalUserId, active: true, verifiedAt: new Date(), lastError: null,
      },
      update: { externalUserId, active: true, verifiedAt: new Date(), lastError: null },
    });
    return externalUserId;
  };

  return {
    async send(context: any) {
      if (!appId || !appSecret || !publicAppUrl) {
        return { status: 'SKIPPED', error: '飞书应用尚未配置' };
      }
      const token = await tenantToken();
      const externalUserId = await resolveExternalUserId(context, token);
      if (!externalUserId) return { status: 'SKIPPED', error: '员工尚未绑定飞书账号' };
      const result = await post(
        'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=user_id',
        {
          receive_id: externalUserId,
          msg_type: 'interactive',
          content: JSON.stringify(card(
            context.notification,
            safeActionUrl(publicAppUrl, context.notification?.actionUrl),
          )),
        },
        token,
      );
      if (result.code !== 0) {
        return { status: 'FAILED', error: result.msg || `飞书错误 ${String(result.code)}`, retryable: true };
      }
      return { status: 'SENT' };
    },
  };
}
