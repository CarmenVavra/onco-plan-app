import jwt from 'jsonwebtoken';
import { signSessionToken, verifySessionToken } from './AuthTokenService';
import { PasswordHasher } from './PasswordHasher';

describe('PasswordHasher (scrypt)', () => {
  it('verifiziert das richtige Passwort und lehnt falsche ab', async () => {
    const hash = await PasswordHasher.hash('richtig-123');
    expect(hash.startsWith('scrypt:')).toBe(true);
    await expect(PasswordHasher.verify('richtig-123', hash)).resolves.toBe(true);
    await expect(PasswordHasher.verify('falsch', hash)).resolves.toBe(false);
  });

  it('lehnt unbekannte Hash-Formate ab', async () => {
    await expect(PasswordHasher.verify('x', 'md5:abc')).resolves.toBe(false);
  });
});

describe('AuthTokenService (JWT)', () => {
  const userId = '6ffc7e69-4b31-4d71-94aa-8fc48cf52f87';

  it('stellt Token aus und liest Nutzer und Rolle zurück', () => {
    expect(verifySessionToken(signSessionToken({ userId, role: 'DOCTOR' }))).toEqual({ userId, role: 'DOCTOR' });
  });

  it('lehnt fehlende, manipulierte und fremd signierte Token ab', () => {
    const token = signSessionToken({ userId, role: 'PATIENT' });
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken(`${token}x`)).toBeNull();
    expect(verifySessionToken(jwt.sign({ role: 'DOCTOR' }, 'fremdes-geheimnis-fremdes-geheimnis', { subject: userId }))).toBeNull();
  });

  it('lehnt Token mit ungültiger Rolle ab', () => {
    const forged = jwt.sign({ role: 'SUPERUSER' }, process.env.JWT_SECRET as string, { subject: userId });
    expect(verifySessionToken(forged)).toBeNull();
  });
});
