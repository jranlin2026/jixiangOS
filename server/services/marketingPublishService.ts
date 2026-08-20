import type { AssetFilters, AssetMatrixPublishTaskInput } from '../../src/types/asset';
import type { AuthenticatedUser } from '../../src/types/auth';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { createAssetCommandService } from './assetCommandService';
import type { createAssetListService } from './assetListService';

type LegacyPublishCommands = Pick<ReturnType<typeof createAssetCommandService>, 'createMatrixPublishTask'>;
type LegacyPublishLists = Pick<ReturnType<typeof createAssetListService>, 'list' | 'matrixStats' | 'matrixStatsCompanyWide'>;

/**
 * Content operations owns the publish-plan use case. During the compatibility
 * period it reads the historical asset storage record through these adapters,
 * so no existing plan or audit trail is lost.
 */
export function createMarketingPublishService(commands: LegacyPublishCommands, lists: LegacyPublishLists) {
  return {
    listPlans(filters: AssetFilters, actor: AuthenticatedUser) {
      return lists.list('matrix-publish', filters, actor);
    },
    createPlan(input: Partial<AssetMatrixPublishTaskInput>, actor: AuthenticatedUser) {
      return commands.createMatrixPublishTask(input, actor);
    },
    planStats(actor: AuthenticatedUser) {
      return hasPermission(actor, PERMISSION_KEYS.DASHBOARD)
        || hasPermission(actor, PERMISSION_KEYS.BRAIN_DASHBOARD)
        ? lists.matrixStatsCompanyWide()
        : lists.matrixStats(actor);
    },
  };
}
