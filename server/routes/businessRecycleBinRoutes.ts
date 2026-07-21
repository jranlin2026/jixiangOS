import { Router, type RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { ApiResponse, PaginatedResponse } from '../../src/api/types';
import type {
  BusinessRecycleBinFilters,
  BusinessRecycleBinItem,
  BusinessRecycleBinType,
} from '../../src/types/businessRecycleBin';

type BusinessRecycleBinReader = {
  list(
    filters: BusinessRecycleBinFilters,
    currentUser: AuthenticatedRequest['currentUser'],
  ): Promise<ApiResponse<PaginatedResponse<BusinessRecycleBinItem> | null>>;
};

function queryText(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.length ? String(value[0]) : undefined;
  return value === undefined ? undefined : String(value);
}

export function createBusinessRecycleBinRouter(options: {
  service: BusinessRecycleBinReader;
  requireRead: RequestHandler;
}) {
  const router = Router();
  router.get('/', options.requireRead, async (req: AuthenticatedRequest, res) => {
    const result = await options.service.list({
      type: queryText(req.query.type) as BusinessRecycleBinType | 'all' | undefined,
      search: queryText(req.query.search),
      page: Number(queryText(req.query.page)),
      pageSize: Number(queryText(req.query.pageSize)),
    }, req.currentUser);
    res.status(result.code === 0 ? 200 : result.code || 500).json(result);
  });
  return router;
}
