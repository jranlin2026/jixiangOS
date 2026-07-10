import type {
  CreateKnowledgeDraftInput,
  CreateKnowledgeVersionInput,
  KnowledgeSensitivity,
  VisibilitySubjectType,
} from '../../../src/types/enablement';

type ValidationResult<T> = { value: T } | { error: string };
type JsonRecord = Record<string, unknown>;

const sensitivities = new Set<KnowledgeSensitivity>(['INTERNAL', 'DEPARTMENT', 'MANAGEMENT', 'FINANCE', 'CUSTOMER']);
const subjectTypes = new Set<VisibilitySubjectType>(['ALL_EMPLOYEES', 'DEPARTMENT', 'ROLE', 'POSITION']);

const isRecord = (value: unknown): value is JsonRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const fail = <T>(error: string): ValidationResult<T> => ({ error });

function requiredString(source: JsonRecord, key: string, label: string, maxLength: number): ValidationResult<string> {
  const raw = source[key];
  if (typeof raw !== 'string') return fail(`${label}必须为字符串`);
  const value = raw.trim();
  if (!value) return fail(`${label}不能为空`);
  if (value.length > maxLength) return fail(`${label}不能超过${maxLength}个字符`);
  return { value };
}

function optionalString(source: JsonRecord, key: string, label: string, maxLength: number): ValidationResult<string | undefined> {
  const raw = source[key];
  if (raw === undefined || raw === null || raw === '') return { value: undefined };
  if (typeof raw !== 'string') return fail(`${label}必须为字符串`);
  const value = raw.trim();
  if (value.length > maxLength) return fail(`${label}不能超过${maxLength}个字符`);
  return { value: value || undefined };
}

function requiredSourceText(source: JsonRecord, key: string, label: string, maxLength: number): ValidationResult<string> {
  const raw = source[key];
  if (typeof raw !== 'string') return fail(`${label}必须为字符串`);
  if (!raw.trim()) return fail(`${label}不能为空`);
  if (raw.length > maxLength) return fail(`${label}不能超过${maxLength}个字符`);
  return { value: raw };
}

function optionalDate(source: JsonRecord, key: string, label: string): ValidationResult<string | undefined> {
  const parsed = optionalString(source, key, label, 64);
  if ('error' in parsed || !parsed.value) return parsed;
  const timestamp = Date.parse(parsed.value);
  if (!Number.isFinite(timestamp)) return fail(`${label}格式无效`);
  return { value: new Date(timestamp).toISOString() };
}

function versionFields(source: JsonRecord): ValidationResult<CreateKnowledgeVersionInput> {
  const fileName = requiredString(source, 'sourceFileName', '源文件名', 255);
  if ('error' in fileName) return fileName;
  const fileNameParts = fileName.value.split(/[\\/]/);
  if (fileName.value !== fileNameParts[fileNameParts.length - 1] || !/\.md$/i.test(fileName.value)) {
    return fail('源文件必须是不含路径的 .md 文件');
  }
  const markdown = requiredSourceText(source, 'markdown', 'Markdown正文', 5_000_000);
  if ('error' in markdown) return markdown;
  const sourceReference = optionalString(source, 'sourceReference', '来源说明', 993);
  if ('error' in sourceReference) return sourceReference;
  const effectiveAt = optionalDate(source, 'effectiveAt', '生效时间');
  if ('error' in effectiveAt) return effectiveAt;
  const expiresAt = optionalDate(source, 'expiresAt', '失效时间');
  if ('error' in expiresAt) return expiresAt;
  if (effectiveAt.value && expiresAt.value && Date.parse(expiresAt.value) <= Date.parse(effectiveAt.value)) {
    return fail('失效时间必须晚于生效时间');
  }
  return { value: {
    sourceFileName: fileName.value,
    markdown: markdown.value,
    ...(sourceReference.value ? { sourceReference: sourceReference.value } : {}),
    ...(effectiveAt.value ? { effectiveAt: effectiveAt.value } : {}),
    ...(expiresAt.value ? { expiresAt: expiresAt.value } : {}),
  } };
}

export function validateKnowledgeVersionInput(input: unknown): ValidationResult<CreateKnowledgeVersionInput> {
  return isRecord(input) ? versionFields(input) : fail('请求体必须是对象');
}

export function validateKnowledgeDraftInput(input: unknown): ValidationResult<CreateKnowledgeDraftInput> {
  if (!isRecord(input)) return fail('请求体必须是对象');
  const slug = requiredString(input, 'slug', '知识标识', 160);
  if ('error' in slug) return slug;
  const title = requiredString(input, 'title', '标题', 240);
  if ('error' in title) return title;
  const category = requiredString(input, 'category', '分类', 120);
  if ('error' in category) return category;
  const summary = requiredString(input, 'summary', '摘要', 16_000);
  if ('error' in summary) return summary;
  const ownerDepartmentId = requiredString(input, 'ownerDepartmentId', '归属部门', 64);
  if ('error' in ownerDepartmentId) return ownerDepartmentId;
  const ownerUserId = optionalString(input, 'ownerUserId', '归属用户', 64);
  if ('error' in ownerUserId) return ownerUserId;
  if (typeof input.sensitivity !== 'string' || !sensitivities.has(input.sensitivity as KnowledgeSensitivity)) {
    return fail('敏感级别无效');
  }
  if (!Array.isArray(input.visibility) || input.visibility.length === 0 || input.visibility.length > 100) {
    return fail('可见范围必须包含1到100条规则');
  }
  const visibility: CreateKnowledgeDraftInput['visibility'] = [];
  for (const rawRule of input.visibility) {
    if (!isRecord(rawRule) || typeof rawRule.subjectType !== 'string' || !subjectTypes.has(rawRule.subjectType as VisibilitySubjectType)) {
      return fail('可见范围类型无效');
    }
    const subjectType = rawRule.subjectType as VisibilitySubjectType;
    const subjectId = optionalString(rawRule, 'subjectId', '可见对象ID', 64);
    if ('error' in subjectId) return subjectId;
    if (subjectType === 'ALL_EMPLOYEES' && subjectId.value) return fail('全体员工规则不得包含对象ID');
    if (subjectType !== 'ALL_EMPLOYEES' && !subjectId.value) return fail(`${subjectType}可见规则必须包含对象ID`);
    visibility.push({ subjectType, ...(subjectId.value ? { subjectId: subjectId.value } : {}) });
  }
  if (input.sensitivity === 'DEPARTMENT' && visibility.some((rule) => (
    rule.subjectType !== 'DEPARTMENT' || rule.subjectId !== ownerDepartmentId.value
  ))) return fail('部门敏感知识只能对归属部门明确可见');
  const version = versionFields(input);
  if ('error' in version) return version;
  return { value: {
    slug: slug.value, title: title.value, category: category.value, summary: summary.value,
    ownerDepartmentId: ownerDepartmentId.value,
    ...(ownerUserId.value ? { ownerUserId: ownerUserId.value } : {}),
    sensitivity: input.sensitivity as KnowledgeSensitivity,
    visibility,
    ...version.value,
  } };
}

export function validateReviewInput(input: unknown): ValidationResult<{ decision: 'APPROVE' | 'REJECT'; comment?: string }> {
  if (!isRecord(input) || (input.decision !== 'APPROVE' && input.decision !== 'REJECT')) return fail('审核决策必须为通过或驳回');
  const comment = optionalString(input, 'comment', '审核意见', 16_000);
  if ('error' in comment) return comment;
  return { value: { decision: input.decision, ...(comment.value ? { comment: comment.value } : {}) } };
}
