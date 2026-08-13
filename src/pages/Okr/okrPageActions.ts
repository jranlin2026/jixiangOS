import type { ApiResponse } from '../../api/types';
import type { CreateOkrCheckInInput, OkrCheckIn, OkrKeyResult } from '../../types/okr';

interface OkrCheckInAdapter {
  createCheckIn: (keyResultId: string, input: CreateOkrCheckInInput) => Promise<ApiResponse<OkrCheckIn | { checkIn: OkrCheckIn; keyResult: OkrKeyResult; objectiveProgress: number }>>;
  reload: () => Promise<void>;
}

export const submitOkrCheckIn = async (
  adapter: OkrCheckInAdapter,
  keyResultId: string,
  input: CreateOkrCheckInInput,
): Promise<{ ok: boolean; message: string }> => {
  const response = await adapter.createCheckIn(keyResultId, input);
  if (response.code !== 0) return { ok: false, message: response.message };
  await adapter.reload();
  return { ok: true, message: '周检视已提交，进度已刷新。' };
};
