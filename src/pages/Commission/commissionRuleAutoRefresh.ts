import { subscribePageRefresh } from '../../shared/utils/pageRefresh';

type RefreshWindowTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
type RefreshDocumentTarget = RefreshWindowTarget & Pick<Document, 'visibilityState'>;
type RefreshTimerTarget = {
  setInterval: (handler: () => void, timeout: number) => number;
  clearInterval: (id: number) => void;
};

type CommissionRuleAutoRefreshOptions = {
  windowTarget?: RefreshWindowTarget;
  documentTarget?: RefreshDocumentTarget;
  timerTarget?: RefreshTimerTarget;
  intervalMs?: number;
};

export const COMMISSION_RULE_REFRESH_INTERVAL_MS = 10_000;

export function subscribeCommissionRuleAutoRefresh(
  refresh: () => void,
  options: CommissionRuleAutoRefreshOptions = {},
): () => void {
  const windowTarget = options.windowTarget ?? window;
  const documentTarget = options.documentTarget ?? document;
  const timerTarget = options.timerTarget ?? window;
  const intervalMs = options.intervalMs ?? COMMISSION_RULE_REFRESH_INTERVAL_MS;
  const unsubscribePageRefresh = subscribePageRefresh(refresh, windowTarget, documentTarget);
  const intervalId = timerTarget.setInterval(() => {
    if (documentTarget.visibilityState === 'visible') refresh();
  }, intervalMs);

  return () => {
    unsubscribePageRefresh();
    timerTarget.clearInterval(intervalId);
  };
}
