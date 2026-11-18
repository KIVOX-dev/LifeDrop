import crypto from 'crypto';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { RefreshToken } from '../models';
import { signAccessToken } from '../middleware/auth';
import { ApiError, durationToMs, sha256 } from '../utils/common';

export const REFRESH_COOKIE = 'ld_refresh';
const cookiePath = '/api/v1/auth';

const setCookie = (res: Response, token: string) =>
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'strict',
    path: cookiePath,
    maxAge: durationToMs(env.JWT_REFRESH_EXPIRES_IN),
  });

export const clearRefreshCookie = (res: Response) =>
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: env.cookieSecure, sameSite: 'strict', path: cookiePath });

async function mintRefresh(userId: string, family: string, req: Request) {
  const _id = new Types.ObjectId();
  const token = jwt.sign({ fam: family }, env.JWT_REFRESH_SECRET, {
    subject: userId,
    jwtid: String(_id),
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as any,
  });
  await RefreshToken.create({
    _id,
    user: userId,
    tokenHash: sha256(token),
    family,
    expiresAt: new Date(Date.now() + durationToMs(env.JWT_REFRESH_EXPIRES_IN)),
    userAgent: req.get('user-agent')?.slice(0, 300),
    ip: req.ip,
  });
  return { token, id: _id };
}

/** Issue a fresh access + refresh pair (new token family) and set the refresh cookie. */
export async function startSession(user: { id: string; role: string }, req: Request, res: Response) {
  const { token } = await mintRefresh(user.id, crypto.randomUUID(), req);
  setCookie(res, token);
  return { accessToken: signAccessToken(user) };
}

/** Rotate a refresh token. Re-use of a rotated token revokes the whole family (theft detection). */
export async function rotateSession(req: Request, res: Response) {
  const raw: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (!raw) throw ApiError.unauthorized('No session');
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(raw, env.JWT_REFRESH_SECRET) as jwt.JwtPayload;
  } catch {
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Session expired');
  }
  const doc = await RefreshToken.findOne({ tokenHash: sha256(raw) });
  if (!doc) {
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Session expired');
  }
  // Atomically revoke; only one concurrent request can win.
  const claimed = await RefreshToken.findOneAndUpdate({ _id: doc._id, revokedAt: { $exists: false } }, { revokedAt: new Date() });
  if (!claimed) {
    await RefreshToken.updateMany({ family: doc.family, revokedAt: { $exists: false } }, { revokedAt: new Date() });
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Session revoked');
  }
  const next = await mintRefresh(String(doc.user), doc.family, req);
  await RefreshToken.updateOne({ _id: doc._id }, { replacedBy: next.id });
  setCookie(res, next.token);
  return { userId: String(payload.sub), role: undefined as string | undefined };
}

export async function revokeCurrent(req: Request) {
  const raw: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (!raw) return;
  const doc = await RefreshToken.findOne({ tokenHash: sha256(raw) });
  if (doc) await RefreshToken.updateMany({ family: doc.family, revokedAt: { $exists: false } }, { revokedAt: new Date() });
}

export const revokeAllForUser = (userId: string) =>
  RefreshToken.updateMany({ user: userId, revokedAt: { $exists: false } }, { revokedAt: new Date() });
