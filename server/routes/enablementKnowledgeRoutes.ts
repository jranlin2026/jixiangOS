import express from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { KnowledgeService } from '../services/enablement/knowledgeService';

function withoutPrivateStorageMetadata<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutPrivateStorageMetadata) as T;
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'sourcePath' && key !== 'storageKey')
      .map(([key, nested]) => [key, withoutPrivateStorageMetadata(nested)]),
  ) as T;
}

export function createEnablementKnowledgeRouter(deps: {
  knowledgeService: KnowledgeService;
  requireRead: express.RequestHandler;
  requireReview: express.RequestHandler;
  requirePublish: express.RequestHandler;
}) {
  const router = express.Router();
  const statusFor = (code: number, successStatus = 200) => (
    code === 0 ? successStatus : [400, 403, 404, 409].includes(code) ? code : 400
  );

  router.get('/', deps.requireRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.listCurrent(req.currentUser!);
    res.status(statusFor(result.code)).json(withoutPrivateStorageMetadata(result));
  });

  router.get('/search', deps.requireRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.searchCurrent(String(req.query.query || '').trim(), req.currentUser!);
    res.status(statusFor(result.code)).json(withoutPrivateStorageMetadata(result));
  });

  router.get('/review-queue', deps.requireReview, async (req: AuthenticatedRequest, res) => {
    res.json(withoutPrivateStorageMetadata(await deps.knowledgeService.listReviewQueue(req.currentUser!)));
  });

  router.get('/publication-queue', deps.requirePublish, async (req: AuthenticatedRequest, res) => {
    res.json(withoutPrivateStorageMetadata(await deps.knowledgeService.listPublicationQueue(req.currentUser!)));
  });

  router.get('/:documentId', deps.requireRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.getCurrent(String(req.params.documentId), req.currentUser!);
    res.status(statusFor(result.code)).json(withoutPrivateStorageMetadata(result));
  });

  router.post('/drafts', deps.requirePublish, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.createDraft(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code, 201)).json(withoutPrivateStorageMetadata(result));
  });

  router.post('/:documentId/versions', deps.requirePublish, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.createVersion(String(req.params.documentId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code, 201)).json(withoutPrivateStorageMetadata(result));
  });

  router.post('/versions/:versionId/submit-review', deps.requirePublish, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.submitForReview(String(req.params.versionId), req.currentUser!);
    res.status(statusFor(result.code)).json(withoutPrivateStorageMetadata(result));
  });

  router.post('/versions/:versionId/review', deps.requireReview, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.review(String(req.params.versionId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(withoutPrivateStorageMetadata(result));
  });

  router.post('/versions/:versionId/publish', deps.requirePublish, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.publish(String(req.params.versionId), req.currentUser!);
    res.status(statusFor(result.code)).json(withoutPrivateStorageMetadata(result));
  });

  router.post('/:documentId/retire', deps.requirePublish, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.retire(String(req.params.documentId), req.currentUser!);
    res.status(statusFor(result.code)).json(withoutPrivateStorageMetadata(result));
  });

  return router;
}
