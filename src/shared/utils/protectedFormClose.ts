export type ProtectedFormCloseReason = 'backdropClick' | 'escapeKeyDown' | 'explicit';
export type ProtectedFormCloseAction = 'ignore' | 'close' | 'confirm';

export function shouldMarkProtectedFormButtonClick({
  markButtonClicksDirty,
  isButton,
}: {
  markButtonClicksDirty: boolean;
  isButton: boolean;
}): boolean {
  return markButtonClicksDirty && isButton;
}

export function shouldMarkAutocompleteInputDirty(reason: string): boolean {
  return reason !== 'reset';
}

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
