import type { NextFunction, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { ChangePasswordSchema } from '../validation/schemas';
import { AccountService } from './AccountService';
import { signSessionToken, verifySessionToken } from './AuthTokenService';
import { PasswordHasher } from './PasswordHasher';

const USER = '6ffc7e69-4b31-4d71-94aa-8fc48cf52f87';

describe('ChangePasswordSchema (Passwortregel)', () => {
  const base = { currentPassword: 'Kx7m-Pq4r-T9wz' };

  it('akzeptiert mindestens 10 Zeichen mit Buchstabe und Ziffer (auch Umlaute)', () => {
    expect(ChangePasswordSchema.safeParse({ ...base, newPassword: 'Sonnenblume7' }).success).toBe(true);
    expect(ChangePasswordSchema.safeParse({ ...base, newPassword: 'Grüße aus 1010 Wien' }).success).toBe(true);
  });

  it.each([
    ['zu kurz', 'Kurz12345'],
    ['ohne Ziffer', 'nurbuchstaben'],
    ['ohne Buchstabe', '1234567890'],
    ['gleich wie bisher', 'Kx7m-Pq4r-T9wz'],
  ])('lehnt ab: %s', (_label, newPassword) => {
    expect(ChangePasswordSchema.safeParse({ ...base, newPassword }).success).toBe(false);
  });
});

describe('AccountService.changePassword', () => {
  async function setup(currentPassword: string) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ passwordHash: await PasswordHasher.hash(currentPassword) }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    return { service: new AccountService(prisma as never), prisma };
  }

  it('setzt das neue Passwort (gehasht) und hebt die Änderungspflicht auf', async () => {
    const { service, prisma } = await setup('Kx7m-Pq4r-T9wz');
    await service.changePassword(USER, 'Kx7m-Pq4r-T9wz', 'Sonnenblume7');

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.mustChangePassword).toBe(false);
    expect(data.passwordHash).not.toContain('Sonnenblume7');
    await expect(PasswordHasher.verify('Sonnenblume7', data.passwordHash)).resolves.toBe(true);
  });

  it('lehnt ein falsches bisheriges Passwort ab und ändert nichts', async () => {
    const { service, prisma } = await setup('Kx7m-Pq4r-T9wz');
    await expect(service.changePassword(USER, 'falsch', 'Sonnenblume7')).rejects.toMatchObject({ status: 400 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('Änderungspflicht im Sitzungs-Token', () => {
  it('überträgt das Kennzeichen nur, wenn es gesetzt ist', () => {
    const flagged = verifySessionToken(signSessionToken({ userId: USER, role: 'PATIENT', mustChangePassword: true }));
    const normal = verifySessionToken(signSessionToken({ userId: USER, role: 'PATIENT', mustChangePassword: false }));
    expect(flagged?.mustChangePassword).toBe(true);
    expect(normal?.mustChangePassword).toBe(false);
  });

  it('sperrt fachliche Endpunkte, solange das Startpasswort aktiv ist', () => {
    const run = (mustChangePassword: boolean) => {
      const next = jest.fn() as jest.MockedFunction<NextFunction>;
      const req = { user: { userId: USER, role: 'PATIENT', mustChangePassword } } as unknown as Request;
      requireRole('PATIENT')(req, {} as Response, next);
      return next.mock.calls[0]?.[0] as { code?: string } | undefined;
    };
    expect(run(true)).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
    expect(run(false)).toBeUndefined();
  });
});
