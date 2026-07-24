export type OrderReviewLoadAttempt = {
  requestId: number;
  signal: AbortSignal;
};

export type OrderReviewLoadGate = {
  begin: () => OrderReviewLoadAttempt;
  isLatest: (requestId: number) => boolean;
  finish: (requestId: number) => boolean;
  dispose: () => void;
};

export function createOrderReviewLoadGate(): OrderReviewLoadGate {
  let latestRequestId = 0;
  let activeController: AbortController | null = null;

  return {
    begin() {
      activeController?.abort();
      activeController = new AbortController();
      latestRequestId += 1;
      return { requestId: latestRequestId, signal: activeController.signal };
    },
    isLatest: (requestId) => requestId === latestRequestId,
    finish: (requestId) => requestId === latestRequestId,
    dispose() {
      activeController?.abort();
      activeController = null;
      latestRequestId += 1;
    },
  };
}
