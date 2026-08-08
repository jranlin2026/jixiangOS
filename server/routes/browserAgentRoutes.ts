import express from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';
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
  requireAuthenticated: express.RequestHandler;
  requireLeadCreate: express.RequestHandler;
  requireBrowserCatalogRead: express.RequestHandler;
  requireBrowserCatalogWrite: express.RequestHandler;
}) {
  const router = express.Router();

  router.post('/lead-intakes', deps.requireLeadCreate, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.intake(req.body || {}, req.currentUser!);
    const successStatus = result.data?.outcome === 'CREATED' ? 201 : 200;
    res.status(statusFor(result.code, successStatus)).json(result);
  });

  router.post(
    '/lead-intakes/:syncId/order-remark',
    deps.requireLeadCreate,
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
    deps.requireLeadCreate,
    async (req: AuthenticatedRequest, res) => {
      const result = await deps.service.reportPlatformCompletion(
        routeParam(req.params.syncId),
        req.body || {},
        req.currentUser!,
      );
      res.status(statusFor(result.code)).json(result);
    },
  );

  router.get('/script-library', deps.requireAuthenticated, async (req: AuthenticatedRequest, res) => {
    const result = await deps.scriptLibrary.get(req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });

  router.put('/script-library', deps.requireAuthenticated, async (req: AuthenticatedRequest, res) => {
    const result = await deps.scriptLibrary.update(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });

  router.get('/runtime-config', deps.requireAuthenticated, async (_req: AuthenticatedRequest, res) => {
    const result = await deps.catalog.listRuntimeShops();
    res.status(statusFor(result.code)).json(result);
  });

  router.get('/catalog', deps.requireBrowserCatalogRead, async (_req: AuthenticatedRequest, res) => {
    const result = await deps.catalog.listCatalog();
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
