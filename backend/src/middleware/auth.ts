import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { AppError } from '../lib/errors';
import { AUTH_COOKIE, type SessionUser, verifySessionToken } from '../services/AuthTokenService';

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

/** Liest das JWT aus dem HTTP-Only-Cookie. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const user = verifySessionToken(cookies?.[AUTH_COOKIE]);
  if (!user) {
    next(AppError.unauthorized());
    return;
  }
  req.user = user;
  next();
}

/** Rollenprüfung – jeder Endpunkt prüft serverseitig (Frontend-Guards sind nur UX). */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
}

/** Typsicherer Zugriff auf den authentifizierten Nutzer innerhalb geschützter Routen. */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
