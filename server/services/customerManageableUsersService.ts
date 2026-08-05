import type { AuthenticatedUser } from '../../src/types/auth';
import type { CustomerManageableUser } from '../../src/types/customer';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { success } from '../api/response';
import { mapPrismaUser } from '../db/prismaMappers';
import { loadCustomerAccessContext } from './customerAccessPolicy';

type CustomerManageableUsersDirectory = {
  user: { findMany(args?: unknown): Promise<any[]> };
  role: { findMany(args?: unknown): Promise<any[]> };
  department: { findMany(args?: unknown): Promise<any[]> };
};

export function createCustomerManageableUsersService(directory: CustomerManageableUsersDirectory) {
  return {
    async list(currentUser: AuthenticatedUser) {
      const customerAccess = await loadCustomerAccessContext(directory, currentUser);
      const rows = await directory.user.findMany({
        where: { isActive: true, employmentStatus: 'active' },
        orderBy: { createdAt: 'asc' },
      });
      const users: CustomerManageableUser[] = rows
        .map(mapPrismaUser)
        .filter((user) => (
          user.id === currentUser.id
          || (
            customerAccess.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_TRANSFER)
            && customerAccess.manageableOwnerIds.has(user.id)
          )
        ))
        .map((user) => ({
          id: user.id,
          name: user.name,
          ...(user.positionName ? { positionName: user.positionName } : {}),
        }));
      return success(users);
    },

    async listContributors() {
      const rows = await directory.user.findMany({
        where: { isActive: true, employmentStatus: 'active' },
        orderBy: { createdAt: 'asc' },
      });
      return success<CustomerManageableUser[]>(rows
        .map(mapPrismaUser)
        .filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active')
        .map((user) => ({
          id: user.id,
          name: user.name,
          ...(user.positionName ? { positionName: user.positionName } : {}),
        })));
    },
  };
}
