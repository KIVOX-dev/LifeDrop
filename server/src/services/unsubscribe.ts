import jwt from 'jsonwebtoken';
import { env } from '../config/env';

/** Signed, user-bound unsubscribe link usable straight from an email (no login needed). */
export const unsubscribeUrl = (userId: string) => {
  const token = jwt.sign({ purpose: 'unsubscribe' }, env.JWT_ACCESS_SECRET, { subject: String(userId), expiresIn: '365d', issuer: 'lifedrop-unsub' });
  return `${env.API_BASE_URL.replace(/\/$/, '')}/notifications/unsubscribe?token=${token}`;
};

export const verifyUnsubscribeToken = (token: string): string | null => {
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'lifedrop-unsub' }) as jwt.JwtPayload;
    return p.purpose === 'unsubscribe' && p.sub ? p.sub : null;
  } catch {
    return null;
  }
};
