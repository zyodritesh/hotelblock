import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Captures Idempotency-Key header for mutating requests.
 * Full durable store can replace the in-memory map in later phases.
 */
const seen = new Map<string, { status: number; body: unknown; at: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const key = req.header('Idempotency-Key');
    if (!key) return next();

    const cached = seen.get(key);
    if (cached && Date.now() - cached.at < TTL_MS) {
      return res.status(cached.status).json(cached.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      seen.set(key, { status: res.statusCode, body, at: Date.now() });
      return originalJson(body);
    };

    return next();
  }
}
