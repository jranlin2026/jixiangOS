import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureLeadSourceConfigsInTransaction, reconcileLeadSourceConfigs } from './leadSourceConfigSyncService';

test('自动补齐业务数据中缺失的一级和二级线索来源', () => {
  const result = reconcileLeadSourceConfigs(
    [{
      id: 'source-douyin',
      name: '抖音',
      isActive: true,
      sortOrder: 1,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }],
    [
      { leadSource: '抖音', sourceName: '直播部-视频号01' },
      { leadSource: '小红书', sourceName: '品牌号' },
    ],
    '2026-07-26T10:00:00.000Z',
  );

  const douyin = result.configs.find((item) => item.name === '抖音' && !item.parentId);
  const xiaohongshu = result.configs.find((item) => item.name === '小红书' && !item.parentId);
  assert.ok(douyin);
  assert.ok(xiaohongshu);
  assert.ok(result.configs.some((item) => item.name === '直播部-视频号01' && item.parentId === douyin.id));
  assert.ok(result.configs.some((item) => item.name === '品牌号' && item.parentId === xiaohongshu.id));
  assert.equal(result.added.length, 3);
});

test('已有的来源配置不改名、不重复、不强制启用', () => {
  const existing = [
    { id: 'source-douyin', name: '抖音', isActive: false, sortOrder: 4, createdAt: 'old', updatedAt: 'old' },
    { id: 'source-live', name: '直播', parentId: 'source-douyin', isActive: false, sortOrder: 2, createdAt: 'old', updatedAt: 'old' },
  ];
  const result = reconcileLeadSourceConfigs(existing, [
    { leadSource: '  抖音 ', sourceName: ' 直播 ' },
    { leadSource: '抖音', sourceName: '抖音' },
  ], 'now');

  assert.deepEqual(result.configs, existing);
  assert.deepEqual(result.added, []);
});

test('事务内追加来源会先加锁，并保留管理员已有配置', async () => {
  const calls: string[] = [];
  let saved: unknown;
  const tx = {
    $executeRaw: async () => { calls.push('ensure-row'); return 1; },
    $queryRaw: async () => {
      calls.push('lock');
      return [{ value: [{
        id: 'manual', name: '官网', isActive: false, sortOrder: 1, createdAt: 'old', updatedAt: 'old',
      }] }];
    },
    appStorage: {
      update: async (input: { data: { value: unknown } }) => {
        calls.push('update');
        saved = input.data.value;
        return { value: saved };
      },
    },
  };

  const configs = await ensureLeadSourceConfigsInTransaction(tx as any, [{
    leadSource: '售后服务', sourceName: '售后挽回',
  }], '2026-07-26T12:00:00.000Z');

  assert.deepEqual(calls, ['ensure-row', 'lock', 'update']);
  assert.equal(configs.find((item) => item.id === 'manual')?.isActive, false);
  const primary = configs.find((item) => item.name === '售后服务' && !item.parentId);
  assert.ok(primary);
  assert.ok(configs.some((item) => item.name === '售后挽回' && item.parentId === primary.id));
  assert.deepEqual(saved, configs);
});
