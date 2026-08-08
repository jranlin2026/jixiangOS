import assert from 'node:assert/strict';
import { createBrowserLeadIntakeService } from './browserLeadIntakeService';

const actor = {
  id: 'user-customer-service',
  name: '客服小李',
  email: 'service@example.com',
  phone: '13800000000',
  role: '客服',
  permissions: ['leads:create'],
  dataScopes: {},
  isActive: true,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
} as any;

const records = new Map<string, any>();
const createLeadCalls: any[] = [];
const repository = {
  async reserve(input: any) {
    const key = `${input.platform}:${input.shopKey}:${input.platformOrderNo}`;
    const existing = records.get(key);
    if (existing) return { acquired: false as const, record: existing };
    const record = {
      id: `browser-sync-${records.size + 1}`,
      ...input,
      status: 'PENDING',
      orderRemarkStatus: 'NOT_ATTEMPTED',
      greenFlagStatus: 'NOT_ATTEMPTED',
      attemptCount: 1,
      updatedAt: new Date(),
    };
    records.set(key, record);
    return { acquired: true as const, record };
  },
  async markSucceeded(id: string, input: any) {
    const current = [...records.values()].find((item) => item.id === id);
    Object.assign(current, input, { status: 'SUCCEEDED' });
    return current;
  },
  async markFailed(id: string, errorMessage: string) {
    const current = [...records.values()].find((item) => item.id === id);
    Object.assign(current, { status: 'FAILED', lastError: errorMessage });
    return current;
  },
  async reportOrderRemark(id: string, operator: any, input: any) {
    const current = [...records.values()].find((item) => item.id === id);
    if (!current) return null;
    Object.assign(current, {
      orderRemarkStatus: input.status,
      orderRemarkError: input.errorMessage || null,
      remarkOperatorId: operator.id,
      remarkOperatorName: operator.name,
    });
    return current;
  },
  async reportPlatformCompletion(id: string, operator: any, input: any) {
    const current = [...records.values()].find((item) => item.id === id);
    if (!current) return null;
    Object.assign(current, {
      orderRemarkStatus: input.orderRemarkStatus,
      greenFlagStatus: input.greenFlagStatus,
      orderRemarkError: input.errorMessage || null,
      greenFlagError: input.errorMessage || null,
      remarkOperatorId: operator.id,
      remarkOperatorName: operator.name,
    });
    return current;
  },
};

const service = createBrowserLeadIntakeService({
  repository,
  async createLead(input, currentUser) {
    createLeadCalls.push({ input, currentUser });
    return {
      code: 0,
      data: {
        id: 'lead-1',
        name: input.name,
        phone: input.phone,
        wechat: input.wechat,
        assignedTo: '销售小王',
        assignedToId: 'sales-1',
        intakeStatus: '入库成功',
      },
      message: 'success',
    } as any;
  },
});

const input = {
  platform: 'DOUYIN' as const,
  shopKey: 'jixiang-douyin',
  platformOrderNo: 'DY-20260808-001',
  contactName: '张先生',
  contactSource: 'CHAT' as const,
  contactPhone: '13800138000',
  contactWechat: 'wx_original_88',
  sourceProductName: 'AI口播智能体',
};

const first = await service.intake(input, actor);
assert.equal(first.code, 0);
assert.equal(first.data?.outcome, 'CREATED');
assert.equal(first.data?.syncId, 'browser-sync-1');
assert.equal(first.data?.lead.id, 'lead-1');
assert.equal(first.data?.lead.assignedTo, '销售小王');
assert.equal(first.data?.greenFlagStatus, 'NOT_ATTEMPTED');
assert.equal(createLeadCalls.length, 1);
assert.equal([...records.values()][0].sourceProductName, 'AI口播智能体');
assert.deepEqual(createLeadCalls[0].input, {
  externalIntakeKey: 'browser-sync-1',
  name: '张先生',
  phone: '13800138000',
  phones: [{ number: '13800138000', isPrimary: true, label: '主手机号' }],
  wechat: 'wx_original_88',
  source: '抖音电商',
  sourceName: '飞鸽客服',
  sourceType: '公司资源',
  sourcePlatformId: 'DOUYIN',
  sourcePlatformName: '抖音',
  sourceShopId: 'jixiang-douyin',
  platformOrderNo: 'DY-20260808-001',
  remark: '由极享AI浏览器员工从飞鸽客服录入；平台商品：AI口播智能体',
  status: '新线索',
});

const duplicate = await service.intake({
  ...input,
  shopKey: ` ${input.shopKey} `,
  platformOrderNo: ` ${input.platformOrderNo} `,
  contactName: ' 另一个昵称 ',
  contactPhone: ' 13900139000 ',
  contactWechat: ' wx_other_99 ',
}, actor);
assert.equal(duplicate.code, 0);
assert.equal(duplicate.data?.outcome, 'ALREADY_CREATED');
assert.equal(duplicate.data?.lead.id, 'lead-1');
assert.deepEqual(duplicate.data?.storedContact, {
  nickname: '张先生',
  phone: '13800138000',
  wechat: 'wx_original_88',
}, '重复入库必须返回已关联线索的实际联系快照，不得回显本次提交的分歧资料');
assert.equal(createLeadCalls.length, 1, '重复点击不能再创建线索');
assert.equal(records.size, 1, '业务幂等键必须先规范化再持久化');

const invalid = await service.intake({
  ...input,
  platformOrderNo: 'DY-20260808-002',
  contactPhone: undefined,
  contactWechat: undefined,
}, actor);
assert.equal(invalid.code, 400);
assert.equal(invalid.message, '手机号或微信至少填写一项');
assert.equal(createLeadCalls.length, 1, '无效联系方式不能进入线索创建');

const remark = await service.reportOrderRemark('browser-sync-1', { status: 'SUBMITTED' }, actor);
assert.equal(remark.code, 0);
assert.equal(remark.data?.orderRemarkStatus, 'SUBMITTED');
const colleagueRemark = await service.reportOrderRemark(
  'browser-sync-1',
  { status: 'FAILED', errorMessage: '备注按钮未找到' },
  { ...actor, id: 'user-customer-service-2', name: '客服小周' },
);
assert.equal(colleagueRemark.code, 0, '同一订单由另一位有线索录入权限的客服接手时仍可回报备注');

const completion = await service.reportPlatformCompletion('browser-sync-1', {
  orderRemarkStatus: 'SUCCEEDED',
  greenFlagStatus: 'SUCCEEDED',
}, actor);
assert.equal(completion.code, 0);
assert.equal(completion.data?.orderRemarkStatus, 'SUCCEEDED');
assert.equal(completion.data?.greenFlagStatus, 'SUCCEEDED');

const invalidRemarkCompletion = await service.reportPlatformCompletion('browser-sync-1', {
  orderRemarkStatus: 'NOT_ATTEMPTED' as any,
  greenFlagStatus: 'SUCCEEDED',
}, actor);
assert.equal(invalidRemarkCompletion.code, 400);

const invalidGreenFlagCompletion = await service.reportPlatformCompletion('browser-sync-1', {
  orderRemarkStatus: 'SUCCEEDED',
  greenFlagStatus: 'UNKNOWN' as any,
}, actor);
assert.equal(invalidGreenFlagCompletion.code, 400);

const throwingService = createBrowserLeadIntakeService({
  repository,
  async createLead() {
    throw new Error('数据库连接中断');
  },
});
const thrown = await throwingService.intake({ ...input, platformOrderNo: 'DY-20260808-003' }, actor);
assert.equal(thrown.code, 500);
assert.match(thrown.message, /数据库连接中断/);
assert.equal(
  [...records.values()].find((item) => item.platformOrderNo === 'DY-20260808-003')?.status,
  'FAILED',
  '意外异常不能让订单永久停留在入库中',
);

console.log('browser lead intake idempotency: ok');
