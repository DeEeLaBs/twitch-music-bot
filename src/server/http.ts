import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { BotError } from './errors.ts';

export type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>;

/**
 * Express 4 does not automatically forward rejected promises to the error middleware.
 * Keep that behavior in one place so every async route follows the same contract.
 */
export function asyncRoute(handler: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function messageFromUnknown(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function validationError(error: unknown, fallback: string): BotError {
  if (error instanceof BotError) return error;
  return new BotError('VALIDATION', messageFromUnknown(error, fallback), 400);
}
