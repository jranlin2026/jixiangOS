import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AuthenticatedUser } from '../../src/types/auth';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { failure, success } from '../api/response';
import { bearerToken } from '../middleware/auth';
import {
  authenticateWechatAutomationToken,
  type WechatAutomationConfig,
} from '../services/wechatAutomationSecurity';
import type {
  WechatCustomerAutomationContext,
  WechatCustomerCheckResult,
  WechatCustomerCreateResult,
  WechatCustomerInput,
} from '../services/wechatCustomerAutomationService';

type WechatCustomerAutomationRouteService = {
  check(input: WechatCustomerInput, context: WechatCustomerAutomationContext): Promise<WechatCustomerCheckResult>;
  create(input: WechatCustomerInput, token: string, context: WechatCustomerAutomationContext): Promise<WechatCustomerCreateResult>;
};

export type WechatCustomerAutomationRouterDependencies = {
  config(): WechatAutomationConfig | null;
  resolveActor(account: string): Promise<AuthenticatedUser | null>;
  qaDatabaseIdentity(declaredDatabaseName: string): { databaseName: string } | null;
  service: WechatCustomerAutomationRouteService;
};

type AutomationRequest = Request & { automationActor?: AuthenticatedUser; automationSenderId?: string };

const PRODUCTION_MARKERS = /(prod|production|live|main|primary)/i;
const LOOPBACK_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const QA_RUNTIME_ENVIRONMENTS = new Set(['development', 'test']);

export function readWechatAutomationQaDatabaseIdentity(
  declaredDatabaseName: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): { databaseName: string } | null {
  const expectedName = env.QA_DATABASE_NAME?.trim() || '';
  const runtimeEnvironment = env.NODE_ENV?.trim().toLowerCase() || '';
  if (!QA_RUNTIME_ENVIRONMENTS.has(runtimeEnvironment)
    || env.QA_ALLOW_DESTRUCTIVE_DB !== 'true'
    || !expectedName
    || declaredDatabaseName !== expectedName
    || PRODUCTION_MARKERS.test(expectedName)
    || (!expectedName.toLowerCase().includes('_qa') && !expectedName.toLowerCase().includes('_test'))) {
    return null;
  }
  try {
    const databaseUrl = new URL(env.DATABASE_URL || '');
    const actualName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ''));
    if (!['mysql:', 'mysql2:'].includes(databaseUrl.protocol)
      || !LOOPBACK_DATABASE_HOSTS.has(databaseUrl.hostname)
      || actualName !== expectedName) {
      return null;
    }
    return { databaseName: actualName };
  } catch {
    return null;
  }
}

function unauthorized(response: Response): void {
  response.status(401).json(failure('Unauthorized', 401));
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseCheckBody(value: unknown): WechatCustomerInput {
  const body = record(value);
  const customer = body && Object.keys(body).length === 1 ? record(body.customer) : null;
  if (!customer) throw Object.assign(new Error('WeChat customer request is invalid.'), { statusCode: 400 });
  return customer as WechatCustomerInput;
}

function parseCreateBody(value: unknown): { customer: WechatCustomerInput; precheckToken: string } {
  const body = record(value);
  const customer = body && Object.keys(body).length === 2 ? record(body.customer) : null;
  const token = typeof body?.precheckToken === 'string' ? body.precheckToken.trim() : '';
  if (!customer || !token) throw Object.assign(new Error('WeChat customer request is invalid.'), { statusCode: 400 });
  return { customer: customer as WechatCustomerInput, precheckToken: token };
}

function statusForError(error: unknown): number {
  const code = Number((error as { statusCode?: unknown } | null)?.statusCode);
  return code === 503 ? 503 : code === 409 ? 409 : code === 400 ? 400 : 500;
}

function sendError(response: Response, error: unknown): void {
  const status = statusForError(error);
  const message = status === 409
    ? 'WeChat customer create conflict.'
    : status === 400
      ? 'WeChat customer request is invalid.'
      : 'WeChat customer automation is unavailable.';
  response.status(status).json(failure(message, status));
}

function context(request: AutomationRequest): WechatCustomerAutomationContext {
  if (!request.automationActor || !request.automationSenderId) throw new Error('automation request not authenticated');
  return { actor: request.automationActor, senderId: request.automationSenderId };
}

/** Integration-only bearer auth: it reads a fresh actor and never calls login/session APIs. */
export function createWechatCustomerAutomationRouter(deps: WechatCustomerAutomationRouterDependencies) {
  const router = Router();
  const authenticate = async (request: AutomationRequest, response: Response, next: NextFunction) => {
    try {
      const config = deps.config();
      const sender = request.headers['x-jxos-wechat-sender'];
      const senderId = Array.isArray(sender) ? '' : sender;
      if (!config
        || !authenticateWechatAutomationToken(bearerToken(request), config.token)
        || !authenticateWechatAutomationToken(senderId, config.senderId)) {
        unauthorized(response);
        return;
      }
      const actor = await deps.resolveActor(config.actorAccount);
      if (!actor
        || !actor.isActive
        || !hasPermission(actor, PERMISSION_KEYS.CUSTOMER_LIST, 'read')
        || !hasPermission(actor, PERMISSION_KEYS.CUSTOMER_CREATE, 'write')) {
        unauthorized(response);
        return;
      }
      request.automationActor = actor;
      request.automationSenderId = config.senderId;
      next();
    } catch {
      unauthorized(response);
    }
  };

  router.post('/customers/check', authenticate, async (request: AutomationRequest, response) => {
    try {
      const proofHeader = request.headers['x-jxos-qa-database-proof'];
      if (proofHeader !== undefined) {
        const declaredDatabaseName = Array.isArray(proofHeader) ? '' : proofHeader.trim();
        const identity = declaredDatabaseName ? deps.qaDatabaseIdentity(declaredDatabaseName) : null;
        if (!identity || identity.databaseName !== declaredDatabaseName) {
          throw Object.assign(new Error('QA database identity proof failed.'), { statusCode: 503 });
        }
        response.setHeader('x-jxos-qa-database-proof', identity.databaseName);
      }
      response.status(200).json(success(await deps.service.check(parseCheckBody(request.body), context(request))));
    } catch (error) {
      sendError(response, error);
    }
  });
  router.post('/customers/create', authenticate, async (request: AutomationRequest, response) => {
    try {
      const input = parseCreateBody(request.body);
      response.status(201).json(success(await deps.service.create(input.customer, input.precheckToken, context(request))));
    } catch (error) {
      sendError(response, error);
    }
  });
  return router;
}
