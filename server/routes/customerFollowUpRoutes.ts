import type { RequestHandler } from 'express';
import type { ApiResponse } from '../api/response';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer } from '../../src/types/customer';
import type { CustomerActivityInput } from '../services/customerListService';

type CustomerFollowUpService = {
  addFollowUp(
    customerId: string,
    input: CustomerActivityInput,
    currentUser?: AuthenticatedUser | null,
  ): Promise<ApiResponse<Customer | null>>;
};

const routeParam = (value: string | string[] | undefined): string => (
  Array.isArray(value) ? String(value[0] || '') : String(value || '')
);

export function createCustomerFollowUpHandler(service: CustomerFollowUpService): RequestHandler {
  return async (request, response) => {
    const result = await service.addFollowUp(routeParam(request.params.id), {
      content: String(request.body?.content || ''),
      operator: typeof request.body?.operator === 'string' ? request.body.operator : undefined,
      type: request.body?.type,
      attachments: request.body?.attachments,
    }, (request as typeof request & { currentUser?: AuthenticatedUser }).currentUser);
    const status = result.code === 0
      ? 200
      : result.code >= 400 && result.code < 500
        ? result.code
        : 500;
    response.status(status).json(result);
  };
}
