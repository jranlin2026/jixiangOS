export type ScriptContactState = 'ANY' | 'MISSING' | 'PRESENT';

export type ScriptTemplate = {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  sortOrder: number;
  priority: number;
  match: {
    orderStatuses: string[];
    productKeywords: string[];
    contactState: ScriptContactState;
  };
};

export type ScriptGroup = {
  id: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  scripts: ScriptTemplate[];
};

export type ScriptLibrary = {
  schemaVersion: 1;
  revision: number;
  groups: ScriptGroup[];
  updatedAt: string;
  updatedBy: { id: string; name: string };
};

export type ScriptLibraryView = { library: ScriptLibrary; canManage: boolean };

export type ScriptMatchFacts = { orderStatus: string; productName: string; hasContact: boolean };

export type ScriptMatch = {
  group: ScriptGroup;
  script: ScriptTemplate;
  reasons: string[];
};

function normalized(value: string) {
  return String(value || '').trim().toLocaleLowerCase('zh-CN');
}

function evaluate(script: ScriptTemplate, facts: ScriptMatchFacts) {
  const orderStatus = normalized(facts.orderStatus);
  const productName = normalized(facts.productName);
  const statuses = script.match.orderStatuses.map(normalized).filter(Boolean);
  const keywords = script.match.productKeywords.map(normalized).filter(Boolean);
  if (statuses.length && !statuses.includes(orderStatus)) return null;
  const keywordIndex = keywords.findIndex((keyword) => productName.includes(keyword));
  if (keywords.length && keywordIndex < 0) return null;
  if (script.match.contactState === 'MISSING' && facts.hasContact) return null;
  if (script.match.contactState === 'PRESENT' && !facts.hasContact) return null;

  const reasons: string[] = [];
  if (statuses.length) reasons.push(`订单状态：${facts.orderStatus.trim()}`);
  if (keywordIndex >= 0) reasons.push(`商品关键词：${script.match.productKeywords[keywordIndex].trim()}`);
  if (script.match.contactState === 'MISSING') reasons.push('客户未提供联系方式');
  if (script.match.contactState === 'PRESENT') reasons.push('客户已提供联系方式');
  const specificity = Number(Boolean(statuses.length)) + Number(Boolean(keywords.length))
    + Number(script.match.contactState !== 'ANY');
  if (specificity === 0) return null;
  return { reasons, specificity };
}

export function matchScript(library: ScriptLibrary, facts: ScriptMatchFacts): ScriptMatch | null {
  if (!normalized(facts.orderStatus)) return null;
  const candidates = library.groups
    .filter((group) => group.enabled)
    .flatMap((group) => group.scripts
      .filter((script) => script.enabled)
      .flatMap((script) => {
        const result = evaluate(script, facts);
        return result ? [{ group, script, ...result }] : [];
      }));
  candidates.sort((left, right) => (
    right.script.priority - left.script.priority
    || right.specificity - left.specificity
    || left.group.sortOrder - right.group.sortOrder
    || left.script.sortOrder - right.script.sortOrder
    || left.script.id.localeCompare(right.script.id)
  ));
  const best = candidates[0];
  return best ? { group: best.group, script: best.script, reasons: best.reasons } : null;
}

export function recommendationKey(orderNo: string, scriptId: string) {
  return `${orderNo.trim()}:${scriptId.trim()}`;
}

export function shouldAttemptAutoFill(input: {
  orderNo: string;
  orderStatus: string;
  key: string;
  attemptedKeys: ReadonlySet<string>;
}) {
  return Boolean(input.orderNo.trim() && input.orderStatus.trim() && input.key && !input.attemptedKeys.has(input.key));
}
