import express from 'express';
import { readFile } from 'node:fs/promises';
import { bearerToken, type AuthenticatedRequest } from '../middleware/auth';
import type { createAuthService } from '../services/authService';
import type { BrowserLeadIntakeService } from '../services/browserAgent/browserLeadIntakeService';
import type { BrowserCatalogService } from '../services/browserAgent/browserCatalogService';
import type { BrowserScriptLibraryService } from '../services/browserAgent/scriptLibraryService';

function statusFor(code: number, successStatus = 200) {
  if (code === 0) return successStatus;
  return code >= 400 && code < 500 ? code : 500;
}

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export function createBrowserAgentRouter(deps: {
  service: BrowserLeadIntakeService;
  scriptLibrary: BrowserScriptLibraryService;
  catalog: BrowserCatalogService;
  authService: ReturnType<typeof createAuthService>;
  requireAuthenticated: express.RequestHandler;
  requireLeadCreate: express.RequestHandler;
  requireBrowserEmployeeUse: express.RequestHandler;
  requireScriptLibraryRead: express.RequestHandler;
  requireBrowserCatalogRead: express.RequestHandler;
  requireBrowserCatalogWrite: express.RequestHandler;
  downloadArchivePath: string;
}) {
  const router = express.Router();

  router.get('/download', deps.requireLeadCreate, async (_req, res) => {
    try {
      const archive = await readFile(deps.downloadArchivePath);
      res.attachment('jixiang-ai-browser-employee.zip');
      res.type('application/zip').send(archive);
    } catch (error) {
      console.error('Browser employee archive is unavailable', error);
      res.status(503).json({
        code: 503,
        data: null,
        errorCode: 'BROWSER_EMPLOYEE_ARCHIVE_UNAVAILABLE',
        message: '插件安装包暂不可用，请联系管理员重新发布',
      });
    }
  });

  router.post('/auth/authorize', deps.requireLeadCreate, async (req: AuthenticatedRequest, res) => {
    const result = await deps.authService.authorizeBrowserAgent({
      parentToken: bearerToken(req),
      userId: req.currentUser!.id,
      deviceId: String(req.body?.deviceId || ''),
      redirectUri: String(req.body?.redirectUri || ''),
      codeChallenge: String(req.body?.codeChallenge || ''),
    });
    res.status(statusFor(result.code)).json(result);
  });

  router.post('/auth/exchange', async (req, res) => {
    const result = await deps.authService.exchangeBrowserAgentGrant(req.body || {});
    res.status(statusFor(result.code)).json(result);
  });

  router.post('/auth/logout', async (req, res) => {
    const result = await deps.authService.logoutBrowserAgent(bearerToken(req));
    res.status(statusFor(result.code)).json(result);
  });

  router.get('/auth/session', deps.requireBrowserEmployeeUse, async (req: AuthenticatedRequest, res) => {
    res.json({ code: 0, data: { user: req.currentUser }, message: 'success' });
  });

  router.post('/lead-intakes', deps.requireBrowserEmployeeUse, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.intake(req.body || {}, req.currentUser!);
    const successStatus = result.data?.outcome === 'CREATED' ? 201 : 200;
    res.status(statusFor(result.code, successStatus)).json(result);
  });

  router.post(
    '/lead-intakes/:syncId/order-remark',
    deps.requireBrowserEmployeeUse,
    async (req: AuthenticatedRequest, res) => {
      const result = await deps.service.reportOrderRemark(
        routeParam(req.params.syncId),
        req.body || {},
        req.currentUser!,
      );
      res.status(statusFor(result.code)).json(result);
    },
  );

  router.post(
    '/lead-intakes/:syncId/platform-completion',
    deps.requireBrowserEmployeeUse,
    async (req: AuthenticatedRequest, res) => {
      const result = await deps.service.reportPlatformCompletion(
        routeParam(req.params.syncId),
        req.body || {},
        req.currentUser!,
      );
      res.status(statusFor(result.code)).json(result);
    },
  );

  router.get('/script-library', deps.requireScriptLibraryRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.scriptLibrary.get(req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });

  router.put('/script-library', deps.requireAuthenticated, async (req: AuthenticatedRequest, res) => {
    const result = await deps.scriptLibrary.update(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });

  router.get('/runtime-config', deps.requireBrowserEmployeeUse, async (_req: AuthenticatedRequest, res) => {
    const result = await deps.catalog.listRuntimeShops();
    res.status(statusFor(result.code)).json(result);
  });

  router.post('/product-preview', deps.requireBrowserEmployeeUse, async (req: AuthenticatedRequest, res) => {
    const result = await deps.catalog.previewProductMapping(req.body || {});
    res.status(statusFor(result.code)).json(result);
  });

  router.get('/catalog', deps.requireBrowserCatalogRead, async (_req: AuthenticatedRequest, res) => {
    const result = await deps.catalog.listCatalog();
    res.status(statusFor(result.code)).json(result);
  });

  router.put('/catalog/business-shops/:id/sync', deps.requireBrowserCatalogWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.catalog.syncBusinessShop(routeParam(req.params.id), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });

  router.post('/catalog/shops', deps.requireBrowserCatalogWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.catalog.createShop(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code, 201)).json(result);
  });

  router.put('/catalog/shops/:id', deps.requireBrowserCatalogWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.catalog.updateShop(routeParam(req.params.id), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });

  router.post('/catalog/product-mappings', deps.requireBrowserCatalogWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.catalog.saveMapping(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code, 201)).json(result);
  });

  router.put(
    '/catalog/product-mappings/:id',
    deps.requireBrowserCatalogWrite,
    async (req: AuthenticatedRequest, res) => {
      const result = await deps.catalog.updateMapping(routeParam(req.params.id), req.body || {}, req.currentUser!);
      res.status(statusFor(result.code)).json(result);
    },
  );

  router.delete(
    '/catalog/product-mappings/:id',
    deps.requireBrowserCatalogWrite,
    async (req: AuthenticatedRequest, res) => {
      const result = await deps.catalog.deleteMapping(routeParam(req.params.id), req.currentUser!);
      res.status(statusFor(result.code)).json(result);
    },
  );

  return router;
}
