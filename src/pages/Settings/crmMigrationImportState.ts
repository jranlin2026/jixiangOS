import type { CrmMigrationFileMap, CrmMigrationPrecheckResult } from '../../api/crmMigrationApi';

const CRM_MIGRATION_FILE_KEYS = ['teamCustomers', 'teamContacts', 'publicPool'] as const;

export interface CrmMigrationPrecheckAttempt {
  requestId: number;
  files: CrmMigrationFileMap;
}

export function snapshotCrmMigrationFiles(files: CrmMigrationFileMap): CrmMigrationFileMap {
  return { ...files };
}

export function isCurrentCrmMigrationPrecheck(
  attempt: CrmMigrationPrecheckAttempt,
  latestRequestId: number,
  currentFiles: CrmMigrationFileMap,
): boolean {
  return attempt.requestId === latestRequestId
    && CRM_MIGRATION_FILE_KEYS.every((key) => attempt.files[key] === currentFiles[key]);
}

export function getCrmMigrationImportBlockers(result: CrmMigrationPrecheckResult): string[] {
  return [
    result.employees.missing.length ? `请先创建负责人：${result.employees.missing.join('、')}` : '',
    result.employees.ambiguous.length ? `负责人姓名不唯一：${result.employees.ambiguous.join('、')}` : '',
    result.tags.missing.length ? `请先同步标签：${result.tags.missing.join('、')}` : '',
    result.tags.ambiguous.length ? `标签名称不唯一：${result.tags.ambiguous.join('、')}` : '',
  ].filter(Boolean);
}

export const canImportCrmMigration = (result: CrmMigrationPrecheckResult): boolean =>
  getCrmMigrationImportBlockers(result).length === 0;
