import assert from 'node:assert/strict';
import { submitOkrCheckIn } from './okrPageActions';
import type { CreateOkrCheckInInput, OkrCheckIn } from '../../types/okr';

const calls: string[] = [];
const input: CreateOkrCheckInInput = {
  currentValue: 72,
  confidence: 4,
  health: 'AT_RISK',
  blocker: '线索质量波动',
  nextAction: '复盘无效渠道',
  evidence: [{ type: 'TEXT', content: '周报链接' }],
};

const result = await submitOkrCheckIn({
  createCheckIn: async (keyResultId, payload) => {
    calls.push(`submit:${keyResultId}:${payload.currentValue}`);
    return {
      code: 0,
      message: 'success',
      data: {
        checkIn: {
          id: 'checkin-1',
          keyResultId,
          currentValue: payload.currentValue,
          health: payload.health || 'ON_TRACK',
          createdAt: '2026-08-13T08:00:00.000Z',
        } satisfies OkrCheckIn,
        keyResult: {} as never,
        objectiveProgress: 72,
      },
    };
  },
  reload: async () => { calls.push('reload'); },
}, 'kr-1', input);

assert.equal(result.ok, true);
assert.deepEqual(calls, ['submit:kr-1:72', 'reload'], '检视成功后必须刷新列表以展示服务端最终进度');

const failedCalls: string[] = [];
const failed = await submitOkrCheckIn({
  createCheckIn: async () => ({ code: 400, message: '当前周期已关闭', data: null as never }),
  reload: async () => { failedCalls.push('reload'); },
}, 'kr-1', input);

assert.deepEqual(failed, { ok: false, message: '当前周期已关闭' });
assert.deepEqual(failedCalls, [], '提交失败不能刷新并掩盖错误');

console.log('okr check-in submit and refresh test passed');
