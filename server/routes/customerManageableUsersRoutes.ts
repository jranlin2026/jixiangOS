import type { RequestHandler } from 'express';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { CustomerManageableUser } from '../../src/types/customer';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { ApiResponse } from '../api/response';
import type { PermissionRequirement } from '../middleware/auth';

export const CUSTOMER_MANAGEABLE_USERS_PERMISSION_REQUIREMENTS: readonly PermissionRequirement[] = [
  { permissionKey: PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, action: 'write' },
  { permissionKey: PERMISSION_KEYS.CUSTOMER_SET_TAGS, action: 'write' },
  { permissionKey: PERMISSION_KEYS.CUSTOMER_SET_TODOS, action: 'write' },
  { permissionKey: PERMISSION_KEYS.CUSTOMER_SET_PROGRESS, action: 'write' },
  { permissionKey: PERMISSION_KEYS.CUSTOMER_EDIT_ATTRIBUTION, action: 'write' },
  { permissionKey: PERMISSION_KEYS.CUSTOMER_TRANSFER, action: 'write' },
  { permissionKey: PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL, action: 'write' },
  { permissionKey: PERMISSION_KEYS.CUSTOMER_DELETE, action: 'delete' },
];

type CustomerManageableUsersReader = {
  list(currentUser: AuthenticatedUser): Promise<ApiResponse<CustomerManageableUser[]>>;
};

export function createCustomerManageableUsersHandler(reader: CustomerManageableUsersReader): RequestHandler {
  return async (request, response) => {
    const currentUser = (request as typeof request & { currentUser: AuthenticatedUser }).currentUser;
    const result = await reader.list(currentUser);
    response.status(result.code === 0 ? 200 : result.code).json(result);
  };
}
