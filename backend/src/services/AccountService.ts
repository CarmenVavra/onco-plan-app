import type { PrismaClient } from '@prisma/client';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { PasswordHasher } from './PasswordHasher';

/** Konto-Funktionen der angemeldeten Person selbst (Passwort ändern). */
export class AccountService {
  constructor(private readonly prisma: Pick<PrismaClient, 'user'>) {}

  /**
   * Prüft das bisherige Passwort (bzw. Startpasswort), setzt das neue und hebt die
   * Pflicht zur Passwortänderung auf. Die Passwortregel prüft vorher das Zod-Schema.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user) throw AppError.unauthorized();
    if (!(await PasswordHasher.verify(currentPassword, user.passwordHash))) {
      throw AppError.badRequest('Das bisherige Passwort ist nicht korrekt.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await PasswordHasher.hash(newPassword), mustChangePassword: false },
    });
    logger.info('Passwort geändert', { userId });
  }
}
