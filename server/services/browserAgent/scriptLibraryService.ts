import type { PrismaClient } from '@prisma/client';
import type { AuthenticatedUser } from '../../../src/types/auth';
import { STORAGE_KEYS } from '../../../src/shared/utils/constants';
import { isSuperAdmin } from '../../../src/shared/utils/permissions';
import { failure, success, type ApiResponse } from '../../api/response';

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

export const DEFAULT_SCRIPT_LIBRARY: ScriptLibrary = {
  schemaVersion: 1,
  revision: 1,
  groups: [{
    id: 'group-order-customers',
    name: '下单客户',
    enabled: true,
    sortOrder: 10,
    scripts: [
      {
        id: 'script-order-welcome', title: '下单欢迎', enabled: true, sortOrder: 10, priority: 0,
        content: '您好，已经看到您的订单了，我们会尽快为您安排后续服务。',
        match: { orderStatuses: [], productKeywords: [], contactState: 'ANY' },
      },
      {
        id: 'script-request-contact', title: '索要联系方式', enabled: true, sortOrder: 20, priority: 0,
        content: '为了安排专属老师联系您，请回复您的姓名和手机号。',
        match: { orderStatuses: [], productKeywords: [], contactState: 'ANY' },
      },
      {
        id: 'script-off-platform-contact', title: '站外联系', enabled: true, sortOrder: 30, priority: 0,
        content: '如果平台内不方便发送联系方式，您可以通过站外联系老师，取得联系方式后我帮您完成登记。',
        match: { orderStatuses: [], productKeywords: [], contactState: 'ANY' },
      },
    ],
  }],
  updatedAt: '1970-01-01T00:00:00.000Z',
  updatedBy: { id: 'system', name: '系统默认' },
};

type ScriptLibraryPrisma = Pick<PrismaClient, 'appStorage'>;

class LibraryValidationError extends Error {}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LibraryValidationError('话术库格式不正确');
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, maxLength: number) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new LibraryValidationError(`${label}不能为空`);
  if (normalized.length > maxLength) throw new LibraryValidationError(`${label}不能超过${maxLength}个字符`);
  return normalized;
}

function integer(value: unknown, label: string, min: number, max: number) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) {
    throw new LibraryValidationError(`${label}必须是${min}到${max}之间的整数`);
  }
  return normalized;
}

function boolean(value: unknown, label: string) {
  if (typeof value !== 'boolean') throw new LibraryValidationError(`${label}必须是布尔值`);
  return value;
}

function uniqueTexts(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new LibraryValidationError(`${label}格式不正确`);
  if (value.length > 100) throw new LibraryValidationError(`${label}不能超过100项`);
  const normalized = value.map((item) => String(item || '').trim()).filter(Boolean);
  if (normalized.some((item) => item.length > 120)) throw new LibraryValidationError(`${label}单项不能超过120个字符`);
  const seen = new Set<string>();
  return normalized.filter((item) => {
    const key = item.toLocaleLowerCase('zh-CN');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeLibrary(value: unknown): ScriptLibrary {
  if (JSON.stringify(value).length > 1_000_000) throw new LibraryValidationError('话术库数据不能超过1MB');
  const source = object(value);
  if (source.schemaVersion !== 1) throw new LibraryValidationError('话术库版本不受支持');
  const revision = integer(source.revision, '配置版本', 1, Number.MAX_SAFE_INTEGER);
  if (!Array.isArray(source.groups)) throw new LibraryValidationError('话术分组格式不正确');
  if (source.groups.length > 50) throw new LibraryValidationError('话术分组不能超过50个');
  const groupIds = new Set<string>();
  const scriptIds = new Set<string>();
  const groups = source.groups.map((rawGroup, groupIndex): ScriptGroup => {
    const group = object(rawGroup);
    const id = requiredText(group.id, '分组ID', 120);
    if (groupIds.has(id)) throw new LibraryValidationError(`分组ID重复：${id}`);
    groupIds.add(id);
    if (!Array.isArray(group.scripts)) throw new LibraryValidationError(`第${groupIndex + 1}个分组的话术格式不正确`);
    if (group.scripts.length > 200) throw new LibraryValidationError(`第${groupIndex + 1}个分组的话术不能超过200条`);
    const scripts = group.scripts.map((rawScript, scriptIndex): ScriptTemplate => {
      const script = object(rawScript);
      const scriptId = requiredText(script.id, '话术ID', 120);
      if (scriptIds.has(scriptId)) throw new LibraryValidationError(`话术ID重复：${scriptId}`);
      scriptIds.add(scriptId);
      const match = object(script.match);
      const contactState = String(match.contactState || '') as ScriptContactState;
      if (!['ANY', 'MISSING', 'PRESENT'].includes(contactState)) {
        throw new LibraryValidationError(`第${groupIndex + 1}组第${scriptIndex + 1}条话术的联系方式状态不正确`);
      }
      return {
        id: scriptId,
        title: requiredText(script.title, '话术标题', 120),
        content: requiredText(script.content, '话术内容', 2000),
        enabled: boolean(script.enabled, '话术启用状态'),
        sortOrder: integer(script.sortOrder, '话术排序', -100000, 100000),
        priority: integer(script.priority, '话术优先级', -1000, 1000),
        match: {
          orderStatuses: uniqueTexts(match.orderStatuses, '订单状态'),
          productKeywords: uniqueTexts(match.productKeywords, '商品关键词'),
          contactState,
        },
      };
    });
    return {
      id,
      name: requiredText(group.name, '分组名称', 80),
      enabled: boolean(group.enabled, '分组启用状态'),
      sortOrder: integer(group.sortOrder, '分组排序', -100000, 100000),
      scripts,
    };
  });
  return {
    schemaVersion: 1,
    revision,
    groups,
    updatedAt: String(source.updatedAt || ''),
    updatedBy: source.updatedBy && typeof source.updatedBy === 'object'
      ? {
          id: String((source.updatedBy as Record<string, unknown>).id || ''),
          name: String((source.updatedBy as Record<string, unknown>).name || ''),
        }
      : { id: '', name: '' },
  };
}

function response(library: ScriptLibrary, actor: AuthenticatedUser): ApiResponse<ScriptLibraryView> {
  return success({ library, canManage: isSuperAdmin(actor) });
}

export function createBrowserScriptLibraryService(prisma: ScriptLibraryPrisma) {
  async function storedLibrary() {
    const row = await prisma.appStorage.findUnique({
      where: { key: STORAGE_KEYS.BROWSER_EMPLOYEE_SCRIPT_LIBRARY },
    });
    if (!row) return { library: DEFAULT_SCRIPT_LIBRARY, exists: false };
    return { library: normalizeLibrary(row.value), exists: true };
  }

  return {
    async get(actor: AuthenticatedUser) {
      try {
        return response((await storedLibrary()).library, actor);
      } catch (error) {
        return failure<ScriptLibraryView>(error instanceof Error ? error.message : '话术库读取失败', 500);
      }
    },

    async update(input: unknown, actor: AuthenticatedUser) {
      if (!isSuperAdmin(actor)) return failure<ScriptLibraryView>('仅超级管理员可以管理话术库', 403);
      let submitted: ScriptLibrary;
      let stored: { library: ScriptLibrary; exists: boolean };
      try {
        submitted = normalizeLibrary(input);
        stored = await storedLibrary();
      } catch (error) {
        return failure<ScriptLibraryView>(error instanceof Error ? error.message : '话术库格式不正确', 400);
      }
      if (submitted.revision !== stored.library.revision) {
        return failure<ScriptLibraryView>('话术库已被其他管理员更新，请刷新后重试', 409);
      }
      const saved: ScriptLibrary = {
        ...submitted,
        revision: stored.library.revision + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: { id: actor.id, name: actor.name },
      };
      try {
        const historyKey = `${STORAGE_KEYS.BROWSER_EMPLOYEE_SCRIPT_LIBRARY_HISTORY_PREFIX}${stored.library.revision}`;
        await prisma.appStorage.upsert({
          where: { key: historyKey },
          create: { key: historyKey, value: stored.library as any },
          update: { value: stored.library as any },
        });
        if (stored.exists) {
          const updated = await prisma.appStorage.updateMany({
            where: {
              key: STORAGE_KEYS.BROWSER_EMPLOYEE_SCRIPT_LIBRARY,
              value: { path: '$.revision', equals: stored.library.revision },
            },
            data: { value: saved as any },
          });
          if (updated.count !== 1) return failure<ScriptLibraryView>('话术库已被其他管理员更新，请刷新后重试', 409);
        } else {
          await prisma.appStorage.create({
            data: { key: STORAGE_KEYS.BROWSER_EMPLOYEE_SCRIPT_LIBRARY, value: saved as any },
          });
        }
      } catch (error) {
        if ((error as { code?: string })?.code === 'P2002') {
          return failure<ScriptLibraryView>('话术库已被其他管理员更新，请刷新后重试', 409);
        }
        return failure<ScriptLibraryView>(error instanceof Error ? error.message : '话术库保存失败', 500);
      }
      return response(saved, actor);
    },
  };
}

export type BrowserScriptLibraryService = ReturnType<typeof createBrowserScriptLibraryService>;
