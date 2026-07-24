import assert from 'node:assert/strict';
import test from 'node:test';
import type { BusinessAttachment } from '../../types/businessAttachment';
import { getRecoveryEvidenceAttachments } from './recoveryEvidence';

const attachment = (id: string, category: BusinessAttachment['category']): BusinessAttachment => ({
  id,
  name: `${id}.png`,
  mimeType: 'image/png',
  size: 100,
  category,
  uploadedById: 'user-1',
  uploadedByName: '系统管理员',
  uploadedAt: '2026-07-24T08:00:00.000Z',
});

test('历史付款截图和聊天记录会合并为一个挽回凭证列表', () => {
  const result = getRecoveryEvidenceAttachments({
    paymentAttachments: [attachment('proof-1', 'recovery-payment-proof')],
    chatAttachments: [
      attachment('proof-1', 'recovery-chat-evidence'),
      attachment('chat-2', 'recovery-chat-evidence'),
    ],
  });

  assert.deepEqual(result.map((item) => item.id), ['proof-1', 'chat-2']);
  assert.ok(result.every((item) => item.category === 'recovery-payment-proof'));
});

test('新版挽回凭证字段存在时以新字段为准', () => {
  const result = getRecoveryEvidenceAttachments({
    recoveryAttachments: [attachment('new-proof', 'recovery-payment-proof')],
    paymentAttachments: [attachment('legacy-proof', 'recovery-payment-proof')],
  });

  assert.deepEqual(result.map((item) => item.id), ['new-proof']);
});
