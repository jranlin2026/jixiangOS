import type { NextFunction, Request, Response } from 'express';
import { normalizeAccount } from '../../src/shared/utils/auth';

interface LoginRateLimitOptions {
  maxFailures?: number;
  windowMs?: number;
  blockMs?: number;
  now?: () => number;
}

interface LoginBucket {
  failures: number;
  firstFailureAt: number;
  blockedUntil: number;
}

export interface LoginRateLimiter {
  guard: (req: Request, res: Response, next: NextFunction) => void;
  recordFailure: (req: Request) => void;
  reset: (req: Request) => void;
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requestKey(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const account = normalizeAccount(String(req.body?.account || 'unknown'));
  return `${ip}:${account || 'unknown'}`;
}

export function createLoginRateLimiter(options: LoginRateLimitOptions = {}): LoginRateLimiter {
  const maxFailures = options.maxFailures ?? positiveNumber(process.env.LOGIN_RATE_LIMIT_MAX_FAILURES, 5);
  const windowMs = options.windowMs ?? positiveNumber(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
  const blockMs = options.blockMs ?? positiveNumber(process.env.LOGIN_RATE_LIMIT_BLOCK_MS, 15 * 60 * 1000);
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<string, LoginBucket>();

  function currentBucket(key: string): LoginBucket {
    const timestamp = now();
    const existing = buckets.get(key);
    if (existing && timestamp - existing.firstFailureAt <= windowMs) return existing;
    const fresh = { failures: 0, firstFailureAt: timestamp, blockedUntil: 0 };
    buckets.set(key, fresh);
    return fresh;
  }

  return {
    guard(req, res, next) {
      const bucket = buckets.get(requestKey(req));
      if (bucket && bucket.blockedUntil > now()) {
        res.status(429).json({ code: 429, data: null, message: '登录尝试过多，请稍后再试' });
        return;
      }
      next();
    },

    recordFailure(req) {
      const bucket = currentBucket(requestKey(req));
      bucket.failures += 1;
      if (bucket.failures >= maxFailures) {
        bucket.blockedUntil = now() + blockMs;
      }
    },

    reset(req) {
      buckets.delete(requestKey(req));
    },
  };
}
