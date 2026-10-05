import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Services } from '../container';
import type { SessionUserDto } from '../dto';
import { AppError } from '../lib/errors';
import { authenticate, currentUser } from '../middleware/auth';
import { AUTH_COOKIE, sessionCookieOptions, signSessionToken } from '../services/AuthTokenService';
import { PasswordHasher } from '../services/PasswordHasher';
import { LoginSchema } from '../validation/schemas';

/** Schutz gegen Brute-Force: 10 Versuche pro 15 Minuten und IP. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Zu viele Anmeldeversuche. Bitte warten Sie 15 Minuten.' } },
});

export function authRoutes({ prisma }: Services): Router {
  const router = Router();

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = LoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    // Gleiche Antwort für unbekannte E-Mail und falsches Passwort (keine User-Enumeration).
    if (!user || !(await PasswordHasher.verify(password, user.passwordHash))) {
      throw AppError.unauthorized('E-Mail oder Passwort ist falsch.');
    }
    res.cookie(AUTH_COOKIE, signSessionToken({ userId: user.id, role: user.role }), sessionCookieOptions);
    const dto: SessionUserDto = { id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role };
    res.json({ user: dto });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(AUTH_COOKIE, { ...sessionCookieOptions, maxAge: undefined });
    res.status(204).end();
  });

  router.get('/me', authenticate, async (req, res) => {
    const { userId } = currentUser(req);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    if (!user) throw AppError.unauthorized();
    const dto: SessionUserDto = user;
    res.json({ user: dto });
  });

  return router;
}
