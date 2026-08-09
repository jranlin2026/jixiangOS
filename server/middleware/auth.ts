import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiResponse } from '../api/response';
import type { AuthenticatedUser } from '../../src/types/auth';
import { hasPermission } from '../../src/shared/utils/permissions';

type AuthReader = {
  getCurrentUser(token?: string): Promise<ApiResponse<AuthenticatedUser | null>>;
  getBrowserAgentUser?(token?: string): Promise<ApiResponse<AuthenticatedUser | null>>;
};

export type AuthenticatedRequest = Request & {
  currentUser?: AuthenticatedUser;
};

export type PermissionRequirement = {
  permissionKey: string;
  action: string;
};

export function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

export function createRequireBrowserAgentPermission(
  authService: AuthReader,
  permissionKey: string,
  action = 'write',
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    const browserAuth = await authService.getBrowserAgentUser?.(token);
    const browserUser = browserAuth?.code === 0 ? browserAuth.data : null;
    const osAuth = browserUser ? null : await authService.getCurrentUser(token);
    const user = browserUser || (osAuth?.code === 0 ? osAuth.data : null);
    if (!user) {
      res.status(401).json({ code: 401, data: null, message: '极享OS登录状态已失效，请重新连接', errorCode: 'BROWSER_AGENT_SESSION_EXPIRED' });
      return;
    }
    if (!hasPermission(user, permissionKey, action)) {
      res.status(403).json({
        code: 403,
        data: null,
        message: '当前账号没有“线索-新建线索”权限，无法使用浏览器员工，请联系管理员授权',
        errorCode: 'BROWSER_AGENT_PERMISSION_DENIED',
      });
      return;
    }
    (req as AuthenticatedRequest).currentUser = user;
    next();
  };
}

export function createRequireBrowserAgentOrOsAuth(
  authService: AuthReader,
  browserPermissionKey: string,
  action = 'write',
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    const osAuth = await authService.getCurrentUser(token);
    const osUser = osAuth.code === 0 ? osAuth.data : null;
    if (osUser) {
      (req as AuthenticatedRequest).currentUser = osUser;
      next();
      return;
    }
    const browserAuth = await authService.getBrowserAgentUser?.(token);
    const browserUser = browserAuth?.code === 0 ? browserAuth.data : null;
    if (!browserUser) {
      res.status(401).json({ code: 401, data: null, message: 'Unauthorized' });
      return;
    }
    if (!hasPermission(browserUser, browserPermissionKey, action)) {
      res.status(403).json({ code: 403, data: null, message: '当前账号没有“线索-新建线索”权限，无法使用浏览器员工', errorCode: 'BROWSER_AGENT_PERMISSION_DENIED' });
      return;
    }
    (req as AuthenticatedRequest).currentUser = browserUser;
    next();
  };
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

export function createRequireAnyPermission(
  authService: AuthReader,
  permissionRequirements: readonly (string | PermissionRequirement)[],
  action = 'read',
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = await authService.getCurrentUser(bearerToken(req));
    const user = auth.code === 0 ? auth.data : null;
    if (!user) {
      res.status(401).json({ code: 401, data: null, message: 'Unauthorized' });
      return;
    }

    if (!permissionRequirements.some((requirement) => (
      typeof requirement === 'string'
        ? hasPermission(user, requirement, action)
        : hasPermission(user, requirement.permissionKey, requirement.action)
    ))) {
      res.status(403).json({ code: 403, data: null, message: 'Forbidden' });
      return;
    }

    (req as AuthenticatedRequest).currentUser = user;
    next();
  };
}
