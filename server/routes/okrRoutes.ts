import { Router } from "express";
import type { RequestHandler } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import type { OkrService } from "../services/okr/okrService";
import type { OkrMetricService } from "../services/okr/okrMetricService";

function statusFor(code: number, successStatus = 200) {
  return code === 0
    ? successStatus
    : [400, 403, 404, 409].includes(code)
      ? code
      : 400;
}

function query(req: AuthenticatedRequest) {
  return {
    page: Math.max(1, Number(req.query.page) || 1),
    pageSize: Math.min(100, Math.max(1, Number(req.query.pageSize) || 20)),
    cycleId: String(req.query.cycleId || "").trim(),
    scope: String(req.query.scope || "").trim(),
    status: String(req.query.status || "").trim(),
    owner: String(req.query.owner || "").trim(),
    health: String(req.query.health || "").trim(),
    search: String(req.query.search || "").trim(),
  };
}

export function createOkrRouter({
  service,
  metrics,
  requireAuth,
}: {
  service: OkrService;
  metrics?: OkrMetricService;
  requireAuth: RequestHandler;
}) {
  const router = Router();
  router.use(requireAuth);

  router.get("/directory/users", async (req: AuthenticatedRequest, res) => {
    const result = await service.listAssignableUsers(req.currentUser! as any);
    res.status(statusFor(result.code)).json(result);
  });

  router.get("/cycles", async (req: AuthenticatedRequest, res) => {
    const result = await service.listCycles(
      req.currentUser! as any,
      query(req),
    );
    res.status(statusFor(result.code)).json(result);
  });
  router.post("/cycles", async (req: AuthenticatedRequest, res) => {
    const result = await service.createCycle(
      req.currentUser! as any,
      req.body || {},
    );
    res.status(statusFor(result.code, 201)).json(result);
  });
  const transition =
    (status: "ACTIVE" | "SCORING" | "CLOSED") =>
    async (req: AuthenticatedRequest, res: any) => {
      const result = await service.transitionCycle(
        req.currentUser! as any,
        String(req.params.id || ""),
        status,
      );
      res.status(statusFor(result.code)).json(result);
    };
  router.post("/cycles/:id/activate", transition("ACTIVE"));
  router.post("/cycles/:id/scoring", transition("SCORING"));
  router.post("/cycles/:id/close", transition("CLOSED"));

  router.get("/objectives", async (req: AuthenticatedRequest, res) => {
    const result = await service.listObjectives(
      req.currentUser! as any,
      query(req),
    );
    res.status(statusFor(result.code)).json(result);
  });
  router.get(
    "/directory/alignment-objectives",
    async (req: AuthenticatedRequest, res) => {
      const result = await service.listAlignmentObjectives(
        req.currentUser! as any,
        {
          cycleId: String(req.query.cycleId || "").trim(),
          childScope: String(req.query.childScope || "").trim(),
        },
      );
      res.status(statusFor(result.code)).json(result);
    },
  );
  router.get("/check-ins/due", async (req: AuthenticatedRequest, res) => {
    const result = await service.listDueCheckIns(
      req.currentUser! as any,
      query(req),
    );
    res.status(statusFor(result.code)).json(result);
  });
  router.post("/objectives", async (req: AuthenticatedRequest, res) => {
    const result = await service.createObjective(
      req.currentUser! as any,
      req.body || {},
    );
    res.status(statusFor(result.code, 201)).json(result);
  });
  router.get("/objectives/:id", async (req: AuthenticatedRequest, res) => {
    const result = await service.getObjective(
      req.currentUser! as any,
      String(req.params.id || ""),
    );
    res.status(statusFor(result.code)).json(result);
  });
  router.patch("/objectives/:id", async (req: AuthenticatedRequest, res) => {
    const result = await service.updateObjective(
      req.currentUser! as any,
      String(req.params.id || ""),
      req.body || {},
    );
    res.status(statusFor(result.code)).json(result);
  });
  router.post(
    "/objectives/:id/key-results",
    async (req: AuthenticatedRequest, res) => {
      const result = await service.addKeyResult(
        req.currentUser! as any,
        String(req.params.id || ""),
        req.body || {},
      );
      res.status(statusFor(result.code, 201)).json(result);
    },
  );
  router.post(
    "/key-results/:id/check-ins",
    async (req: AuthenticatedRequest, res) => {
      const result = await service.checkIn(
        req.currentUser! as any,
        String(req.params.id || ""),
        req.body || {},
      );
      res.status(statusFor(result.code, 201)).json(result);
    },
  );
  router.get(
    "/key-results/:id/tasks",
    async (req: AuthenticatedRequest, res) => {
      const result = await service.listKeyResultTasks(
        req.currentUser! as any,
        String(req.params.id || ""),
      );
      res.status(statusFor(result.code)).json(result);
    },
  );
  router.post(
    "/key-results/:id/tasks",
    async (req: AuthenticatedRequest, res) => {
      const result = await service.linkTask(
        req.currentUser! as any,
        String(req.params.id || ""),
        req.body || {},
      );
      res.status(statusFor(result.code, 201)).json(result);
    },
  );
  router.post(
    "/objectives/:id/reviews",
    async (req: AuthenticatedRequest, res) => {
      const result = await service.submitReview(
        req.currentUser! as any,
        String(req.params.id || ""),
        req.body || {},
      );
      res.status(statusFor(result.code, 201)).json(result);
    },
  );

  if (metrics) {
    router.get("/metrics/catalog", async (req: AuthenticatedRequest, res) => {
      const result = await metrics.listCatalog(req.currentUser! as any);
      res.status(statusFor(result.code)).json(result);
    });
    router.post(
      "/key-results/:id/metric-binding",
      async (req: AuthenticatedRequest, res) => {
        const result = await metrics.bind(
          req.currentUser! as any,
          String(req.params.id || ""),
          req.body || {},
        );
        res.status(statusFor(result.code, 201)).json(result);
      },
    );
    router.post(
      "/key-results/:id/metric-refresh",
      async (req: AuthenticatedRequest, res) => {
        const result = await metrics.refresh(
          req.currentUser! as any,
          String(req.params.id || ""),
        );
        res.status(statusFor(result.code)).json(result);
      },
    );
  }

  return router;
}
