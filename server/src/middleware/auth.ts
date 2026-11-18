import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User } from '../models';
import { ApiError, Role } from '../utils/common';

export interface AuthUser { id: string; role: Role; email: string; fullName: string }

declare module 'express-serve-static-core' {
  interface Request { user?: AuthUser }
}

export const signAccessToken = (u: { id: string; role: string }) =>
  jwt.sign({ role: u.role }, env.JWT_ACCESS_SECRET, { subject: u.id, expiresIn: env.JWT_ACCESS_EXPIRES_IN as any, issuer: 'lifedrop' });

/** Verifies the bearer token and re-checks the account in the database on every request. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw ApiError.unauthorized();
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(h.slice(7), env.JWT_ACCESS_SECRET, { issuer: 'lifedrop' }) as jwt.JwtPayload;
    } catch {
      throw ApiError.unauthorized('Invalid or expired token');
    }
    const user = await User.findById(payload.sub).select('role isActive deletedAt email fullName').lean();
    if (!user || user.deletedAt) throw ApiError.unauthorized('Account not found');
    if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');
    // Role comes from the database, never from the token claim.
    req.user = { id: String(user._id), role: user.role as Role, email: user.email, fullName: user.fullName };
    next();
  } catch (e) {
    next(e);
  }
}

export const authorize =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };

/** Convenience guard stacks used by routers. */
export const requireAuth = [authenticate];
export const requireAdmin = [authenticate, authorize('ADMIN', 'SUPER_ADMIN')];
export const requireSuperAdmin = [authenticate, authorize('SUPER_ADMIN')];
export const requireDonor = [authenticate, authorize('DONOR')];
