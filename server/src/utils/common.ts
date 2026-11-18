import crypto from 'crypto';
import { NextFunction, Request, RequestHandler, Response } from 'express';

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'DONOR'] as const;
export type Role = (typeof ROLES)[number];

export const POINTS_PER_DONATION = 100;

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
  static badRequest(m: string, details?: unknown) { return new ApiError(400, m, 'BAD_REQUEST', details); }
  static unauthorized(m = 'Authentication required') { return new ApiError(401, m, 'UNAUTHORIZED'); }
  static forbidden(m = 'You do not have permission to perform this action') { return new ApiError(403, m, 'FORBIDDEN'); }
  static notFound(m = 'Resource not found') { return new ApiError(404, m, 'NOT_FOUND'); }
  static conflict(m: string) { return new ApiError(409, m, 'CONFLICT'); }
  static unavailable(m: string) { return new ApiError(503, m, 'SERVICE_UNAVAILABLE'); }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const ok = (res: Response, data: unknown = null, meta?: unknown, status = 200) =>
  res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });

export const created = (res: Response, data: unknown) => ok(res, data, undefined, 201);

export const sha256 = (v: string | Buffer) => crypto.createHash('sha256').update(v).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

export const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const paginate = (q: { page?: number; limit?: number }) => {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

export const pageMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

/** Parse "15m", "7d" style durations to milliseconds. */
export const durationToMs = (s: string) => {
  const m = /^(\d+)\s*(ms|s|m|h|d)$/.exec(s.trim());
  if (!m) return 7 * 24 * 3600 * 1000;
  const n = Number(m[1]);
  return n * { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2] as 'ms' | 's' | 'm' | 'h' | 'd'];
};

export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, '$1***$2');
