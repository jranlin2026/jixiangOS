function toDateTimeInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function collapseKnownOcrLabels(text: string): string {
  return text
    .replace(/\u5B9E\s*\u4ED8\s*\u6B3E/g, '\u5B9E\u4ED8\u6B3E')
    .replace(/\u5B9E\s*\u4ED8/g, '\u5B9E\u4ED8')
    .replace(/\u652F\s*\u4ED8\s*\u65F6\s*\u95F4/g, '\u652F\u4ED8\u65F6\u95F4')
    .replace(/\u4ED8\s*\u6B3E\s*\u65F6\s*\u95F4/g, '\u4ED8\u6B3E\u65F6\u95F4')
    .replace(/\u4EA4\s*\u6613\s*\u65F6\s*\u95F4/g, '\u4EA4\u6613\u65F6\u95F4')
    .replace(/\u8BA2\s*\u5355\s*\u7F16\s*[\u53F7\u5DF1]/g, '\u8BA2\u5355\u7F16\u53F7')
    .replace(/\u8BA2\s*\u5355\s*\u53F7/g, '\u8BA2\u5355\u53F7')
    .replace(/\u4EA4\s*\u6613\s*\u5355\s*\u53F7/g, '\u4EA4\u6613\u5355\u53F7')
    .replace(/\u5546\s*\u6237\s*\u5355\s*\u53F7/g, '\u5546\u6237\u5355\u53F7')
    .replace(/\u5546\s*\u5BB6\s*\u8BA2\s*\u5355\s*\u53F7/g, '\u5546\u5BB6\u8BA2\u5355\u53F7');
}

function normalizeRecognizedText(rawText: string): string {
  const normalized = safeDecodeURIComponent(rawText)
    .replace(/\.[A-Za-z0-9]{2,5}$/i, '')
    .replace(/[\uFF0D\u2212\u2014\u2013]/g, '-')
    .replace(/[\uFF08\uFF09]/g, (match) => (match === '\uFF08' ? '(' : ')'))
    .replace(/[\u5E74\u6708]/g, '-')
    .replace(/[\u65E5\u53F7]/g, ' ')
    .replace(/\uFF1A/g, ':')
    .replace(/(\d{1,2})[\u65F6\u6642\u70B9\u9EDE](\d{1,2})?\u5206?/g, (_match, hour, minute = '00') => `${hour}:${minute}`)
    .replace(/[\uFF0C\u3002]/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return collapseKnownOcrLabels(normalized)
    .replace(/(?<=\d)\s*-\s*(?=\d)/g, '-')
    .replace(/(?<=\d)\s*:\s*(?=\d)/g, ':')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDateTimeMatch(match: RegExpMatchArray, dayFirst = false): string {
  if (dayFirst) {
    const [, month, day, year, hour = '00', minute = '00'] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  const [, year, month, day, hour = '00', minute = '00'] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

function parseDateInText(text: string): string | null {
  const candidates = [
    /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})[\s_T-]+(\d{1,2})[:.-](\d{1,2})/,
    /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\s+(\d{1,2})(\d{2})\b/,
    /(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})[\s_T-]+(\d{1,2})[:.-](\d{1,2})/,
    /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/,
  ];

  for (const [index, pattern] of candidates.entries()) {
    const match = text.match(pattern);
    if (!match) continue;
    return formatDateTimeMatch(match, index === 2);
  }

  const compact = text.match(/\b(20\d{2})(\d{2})(\d{2})(\d{2})?(\d{2})?\b/);
  if (compact) {
    const [, year, month, day, hour = '00', minute = '00'] = compact;
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }

  return null;
}

function normalizeRecognizedDate(text: string): string | null {
  const paymentTimeLabels = [
    '\u652F\u4ED8\u65F6\u95F4',
    '\u4ED8\u6B3E\u65F6\u95F4',
    '\u4EA4\u6613\u65F6\u95F4',
    '\u6536\u6B3E\u65F6\u95F4',
    '\u8F6C\u8D26\u65F6\u95F4',
    '\u5230\u8D26\u65F6\u95F4',
  ];
  for (const label of paymentTimeLabels) {
    const index = text.indexOf(label);
    if (index < 0) continue;
    const parsed = parseDateInText(text.slice(index, index + 90));
    if (parsed) return parsed;
  }

  return parseDateInText(text);
}

function normalizeAmount(value: string): number {
  return Number(value.replace(/,/g, ''));
}

function findAmountByLabels(text: string): number | null {
  const amountLabels = [
    '\u5B9E\u4ED8\u6B3E',
    '\u5B9E\u4ED8\u91D1\u989D',
    '\u5B9E\u4ED8',
    '\u4ED8\u6B3E\u91D1\u989D',
    '\u652F\u4ED8\u91D1\u989D',
    '\u6536\u6B3E\u91D1\u989D',
    '\u8F6C\u8D26\u91D1\u989D',
    '\u8BA2\u5355\u91D1\u989D',
    '\u91D1\u989D',
    '\u5408\u8BA1',
    'amount',
    'amt',
  ];
  for (const label of amountLabels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${escapedLabel}[^0-9\\u00A5\\uFFE5-]{0,30}[\\u00A5\\uFFE5]?\\s*-?\\s*(\\d[\\d,]*(?:\\.\\d{1,2})?)`, 'i');
    const match = text.match(pattern);
    if (!match) continue;
    const amount = normalizeAmount(match[1]);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return null;
}

function findTopLevelPaidAmount(text: string): number | null {
  const negativeAmount = text.match(/(?:^|\s)-\s*[\u00A5\uFFE5]?\s*(\d[\d,]*(?:\.\d{1,2})?)/);
  if (negativeAmount) return normalizeAmount(negativeAmount[1]);

  const currencyAmounts = Array.from(text.matchAll(/[\u00A5\uFFE5]\s*-?\s*(\d[\d,]*(?:\.\d{1,2})?)/g))
    .map((match) => normalizeAmount(match[1]))
    .filter((amount) => Number.isFinite(amount) && amount > 0);
  return currencyAmounts[0] || null;
}

function cleanOrderNoCandidate(value: string): string {
  return value.replace(/\s+/g, '').replace(/[^\w-]/g, '');
}

function isLikelyOrderNo(value: string): boolean {
  if (!value) return false;
  if (/^20\d{12}$/.test(value)) return false;
  if (!/\d/.test(value)) return false;
  return value.length >= 12 || /^(PAY|TXN|TRADE|ORD)[-_]?[A-Za-z0-9]/i.test(value);
}

function findOrderNoByLabels(text: string): string | null {
  const labels = [
    '\u8BA2\u5355\u7F16\u53F7',
    '\u652F\u4ED8\u8BA2\u5355\u53F7',
    '\u8BA2\u5355\u53F7',
    '\u4EA4\u6613\u5355\u53F7',
    '\u4EA4\u6613\u53F7',
    '\u6D41\u6C34\u53F7',
    '\u5546\u6237\u8BA2\u5355\u53F7',
    '\u5546\u5BB6\u8BA2\u5355\u53F7',
    '\u5546\u6237\u5355\u53F7',
    '\u51ED\u8BC1\u53F7',
  ];
  for (const label of labels) {
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const index = text.indexOf(label, searchFrom);
      if (index < 0) break;
      searchFrom = index + label.length;

      const segment = text.slice(searchFrom, searchFrom + 100);
      const match = segment.match(/[:\uFF1A\s-]*([A-Za-z0-9][A-Za-z0-9\s-]{5,80})/);
      if (!match) continue;
      const candidate = cleanOrderNoCandidate(match[1]);
      if (isLikelyOrderNo(candidate)) return candidate;
    }
  }
  return null;
}

function findLongOrderNoFallbacks(text: string): string[] {
  const compactDigitText = text.replace(/(?<=\d)\s+(?=\d)/g, '');
  return Array.from(compactDigitText.matchAll(/\b\d{12,64}\b/g))
    .map((match) => match[0])
    .filter(isLikelyOrderNo)
    .sort((a, b) => b.length - a.length);
}

function choosePaymentOrderNo(prefix: string | undefined, byLabel: string | null, fallbackCandidates: string[]): string {
  if (prefix) return prefix;
  const wechatShopOrderNo = fallbackCandidates.find((candidate) => /^37\d{17}$/.test(candidate));
  if (wechatShopOrderNo && !/^37\d{17}$/.test(byLabel || '')) return wechatShopOrderNo;
  return byLabel || fallbackCandidates[0] || `PAY-${Date.now()}`;
}

export function recognizePaymentProof(rawText: string, fallbackAmount: number, fallbackDate = new Date()) {
  const text = normalizeRecognizedText(rawText);
  const paidDate = normalizeRecognizedDate(text) || toDateTimeInputValue(fallbackDate);
  const recognizedAmount = findAmountByLabels(text) || findTopLevelPaidAmount(text);
  const amount = recognizedAmount && !(recognizedAmount < 100 && fallbackAmount > recognizedAmount)
    ? recognizedAmount
    : fallbackAmount;
  const orderNoByLabel = findOrderNoByLabels(text);
  const orderNoByPrefix = text.match(/(?:^|[^A-Za-z0-9])((?:PAY|TXN|TRADE|ORD)[-_]?[A-Za-z0-9]{6,40})\b/);
  const fallbackOrderNumbers = findLongOrderNoFallbacks(text);

  return {
    paidDate,
    amount,
    paymentOrderNo: choosePaymentOrderNo(orderNoByPrefix?.[1], orderNoByLabel, fallbackOrderNumbers),
  };
}
