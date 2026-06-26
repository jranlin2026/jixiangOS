import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiResponse } from '../api/response';
import type { AuthenticatedUser } from '../../src/types/auth';
import { hasPermission } from '../../src/shared/utils/permissions';

type AuthReader = {
  getCurrentUser(token?: string): Promise<ApiResponse<AuthenticatedUser | null>>;
};

export type AuthenticatedRequest = Request & {
  currentUser?: AuthenticatedUser;
};

export function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

export function createRequireAuth(authService: AuthReader, permissionKey?: string, action = 'read'): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = await authService.getCurrentUser(bearerToken(req));
    const user = auth.code === 0 ? auth.data : null;
    if (!user) {
      res.status(401).json({ code: 401, data: null, message: 'Unauthorized' });
      return;
    }

    if (permissionKey && !hasPermission(user, permissionKey, action)) {
      res.status(403).json({ code: 403, data: null, message: 'Forbidden' });
      return;
    }

    (req as AuthenticatedRequest).currentUser = user;
    next();
  };
}
