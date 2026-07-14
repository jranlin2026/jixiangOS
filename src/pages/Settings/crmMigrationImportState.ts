import type { CrmMigrationPrecheckResult } from '../../api/crmMigrationApi';

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
