type RefreshWindowTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
type RefreshDocumentTarget = RefreshWindowTarget & Pick<Document, 'visibilityState'>;

export function subscribePageRefresh(
  refresh: () => void,
  windowTarget: RefreshWindowTarget = window,
  documentTarget: RefreshDocumentTarget = document,
): () => void {
  const handleVisibilityChange = () => {
    if (documentTarget.visibilityState === 'visible') refresh();
  };

  windowTarget.addEventListener('focus', refresh);
  windowTarget.addEventListener('pageshow', refresh);
  documentTarget.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    windowTarget.removeEventListener('focus', refresh);
    windowTarget.removeEventListener('pageshow', refresh);
    documentTarget.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
