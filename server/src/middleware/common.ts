import { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { ZodError, ZodType } from 'zod';
import { env } from '../config/env';
import { ApiError } from '../utils/common';
import { logger } from '../utils/logger';

/* ------------------------------ request validation ------------------------------ */
export const validate =
  (schemas: { body?: ZodType<any>; query?: ZodType<any>; params?: ZodType<any> }): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) (req as any).query = schemas.query.parse(req.query);
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (e) {
      next(e);
    }
  };

/* ------------------------------ NoSQL injection guard ------------------------------ */
const clean = (v: unknown, depth = 0): unknown => {
  if (depth > 12) return undefined;
  if (Array.isArray(v)) return v.map((x) => clean(x, depth + 1));
  if (v && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (k.startsWith('$') || k.includes('.')) continue; // drop operator / path-injection keys
      out[k] = clean(val, depth + 1);
    }
    return out;
  }
  return v;
};

export const sanitizeInput: RequestHandler = (req, _res, next) => {
  if (req.body) req.body = clean(req.body);
  if (req.query) (req as any).query = clean(req.query);
  if (req.params) req.params = clean(req.params) as any;
  next();
};

export const validObjectId = (v: string) => mongoose.isValidObjectId(v);

/* ----------------------------------- rate limits ----------------------------------- */
const limiter = (windowMs: number, limit: number, message: string, keyByUser = false) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.isTest && !process.env.TEST_RATE_LIMIT,
    keyGenerator: (req) => (keyByUser && req.user ? `u:${req.user.id}` : req.ip ?? 'unknown'),
    validate: { keyGeneratorIpFallback: false },
    handler: (_req, res) => {
      res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message } });
    },
  });

export const globalLimiter = limiter(15 * 60_000, 600, 'Too many requests, please slow down.');
export const authLimiter = limiter(15 * 60_000, 20, 'Too many authentication attempts. Try again in a few minutes.');
/** Session restore runs on every page load, so it gets a far higher ceiling than login/register. */
export const refreshLimiter = limiter(15 * 60_000, 300, 'Too many session refreshes. Please wait a moment.');
export const sensitiveLimiter = limiter(60 * 60_000, 10, 'Too many requests. Try again later.');
export const aiLimiter = limiter(60_000, 15, 'AI request limit reached. Please wait a minute.', true);
export const uploadLimiter = limiter(60 * 60_000, 30, 'Upload limit reached. Try again later.', true);

/* ----------------------------------- not found / errors ----------------------------------- */
export const notFound: RequestHandler = (req, _res, next) => next(ApiError.notFound(`Route ${req.method} ${req.path} not found`));

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong';
  let details: unknown;

  if (err instanceof ApiError) {
    ({ statusCode: status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    code = 'BAD_REQUEST';
    message = `Invalid ${err.path}`;
  } else if (err?.code === 11000) {
    status = 409;
    code = 'CONFLICT';
    message = 'A record with these details already exists';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body too large';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'BAD_REQUEST';
    message = 'Malformed JSON';
  }

  if (status >= 500) logger.error({ err: err?.message, stack: err?.stack, path: req.path }, 'unhandled error');
  res.status(status).json({
    success: false,
    error: { code, message: status >= 500 && env.isProd ? 'Something went wrong' : message, ...(details ? { details } : {}) },
  });
};
