import type { BusinessAttachment } from '../../types/businessAttachment';

type RecoveryEvidenceSource = {
  recoveryAttachments?: BusinessAttachment[];
  paymentAttachments?: BusinessAttachment[];
  chatAttachments?: BusinessAttachment[];
};

function normalizeAttachment(attachment: BusinessAttachment): BusinessAttachment {
  return attachment.category === 'recovery-payment-proof'
    ? attachment
    : { ...attachment, category: 'recovery-payment-proof' };
}

export function getRecoveryEvidenceAttachments(source: RecoveryEvidenceSource): BusinessAttachment[] {
  const attachments = source.recoveryAttachments !== undefined
    ? source.recoveryAttachments
    : [...(source.paymentAttachments || []), ...(source.chatAttachments || [])];
  const seen = new Set<string>();
  return attachments.reduce<BusinessAttachment[]>((result, attachment) => {
    if (seen.has(attachment.id)) return result;
    seen.add(attachment.id);
    result.push(normalizeAttachment(attachment));
    return result;
  }, []);
}
