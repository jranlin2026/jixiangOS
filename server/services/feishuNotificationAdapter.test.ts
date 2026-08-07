import assert from 'node:assert/strict';
import { createFeishuNotificationAdapter } from './feishuNotificationAdapter';

const requests: Array<{ url: string; init?: RequestInit }> = [];
const responses = [
  { code: 0, tenant_access_token: 'tenant-token', expire: 7200 },
  { code: 0, data: { user_list: [{ mobile: '13800000000', user_id: 'ou-user-1' }] } },
  { code: 0, data: { message_id: 'message-1' } },
];
const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
  requests.push({ url: String(url), init });
  return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { 'content-type': 'application/json' } });
};

let savedBinding: any;
const prisma = {
  userChannelBinding: {
    upsert: async (args: any) => {
      savedBinding = args.create;
      return args.create;
    },
  },
};

const adapter = createFeishuNotificationAdapter({
  prisma: prisma as any,
  appId: 'app-id',
  appSecret: 'app-secret',
  publicAppUrl: 'https://os.example.com',
  fetchImpl: fetchImpl as typeof fetch,
});

const result = await adapter.send({
  notification: {
    id: 'notification-1', recipientId: 'user-1', title: '你收到一条新线索',
    content: '客户A已分配给你', severity: 'S1', actionUrl: '/leads?leadId=lead-1',
  },
  recipient: { id: 'user-1', phone: '13800000000' },
  binding: null,
});

assert.deepEqual(result, { status: 'SENT' });
assert.equal(savedBinding.externalUserId, 'ou-user-1');
assert.equal(requests.length, 3);
const messageBody = JSON.parse(String(requests[2].init?.body));
assert.equal(messageBody.receive_id, 'ou-user-1');
assert.match(messageBody.content, /https:\/\/os\.example\.com\/leads\?leadId=lead-1/);

console.log('feishu notification adapter tests passed');
