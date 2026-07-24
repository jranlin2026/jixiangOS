export type LatestCommissionRuleRequestGate = {
  begin: (options?: { silent?: boolean }) => number | null;
  isLatest: (requestId: number) => boolean;
  finish: () => void;
};

export function createLatestCommissionRuleRequestGate(): LatestCommissionRuleRequestGate {
  let latestRequestId = 0;
  let activeRequestCount = 0;
  return {
    begin: ({ silent = false } = {}) => {
      if (silent && activeRequestCount > 0) return null;
      latestRequestId += 1;
      activeRequestCount += 1;
      return latestRequestId;
    },
    isLatest: (requestId) => requestId === latestRequestId,
    finish: () => {
      activeRequestCount = Math.max(0, activeRequestCount - 1);
    },
  };
}
