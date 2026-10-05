import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { UserRole } from '@prisma/client';
import { env } from '../config/env';

export const AUTH_COOKIE = 'oncoplan_session';

export interface SessionUser {
  userId: string;
  role: UserRole;
}

const TokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  role: z.enum(['PATIENT', 'DOCTOR', 'ADMIN']),
});

export function signSessionToken(user: SessionUser): string {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.userId,
    expiresIn: Math.round(env.JWT_EXPIRES_IN_HOURS * 3600),
    algorithm: 'HS256',
  });
}

/** Gibt `null` zurück, wenn das Token fehlt, abgelaufen oder manipuliert ist. */
export function verifySessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    const payload = TokenPayloadSchema.parse(decoded);
    return { userId: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

/** HTTP-Only, SameSite=Strict – das JWT ist für JavaScript im Browser unsichtbar. */
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: env.NODE_ENV === 'production',
  path: '/',
  maxAge: env.JWT_EXPIRES_IN_HOURS * 3600 * 1000,
};
