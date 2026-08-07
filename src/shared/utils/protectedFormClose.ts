export type ProtectedFormCloseReason = 'backdropClick' | 'escapeKeyDown' | 'explicit';
export type ProtectedFormCloseAction = 'ignore' | 'close' | 'confirm';

export function resolveProtectedFormClose({
  reason,
  dirty,
  submitting,
}: {
  reason: ProtectedFormCloseReason;
  dirty: boolean;
  submitting: boolean;
}): ProtectedFormCloseAction {
  if (submitting || reason === 'backdropClick' || reason === 'escapeKeyDown') return 'ignore';
  return dirty ? 'confirm' : 'close';
}
