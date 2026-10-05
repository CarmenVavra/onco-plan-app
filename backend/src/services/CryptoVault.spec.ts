import { CryptoVault } from './CryptoVault';

describe('CryptoVault (AES-256-GCM)', () => {
  it('ver- und entschlüsselt verlustfrei inkl. Umlaute', () => {
    const plain = 'Schüttelfrost seit gestern Abend – 38,9 °C';
    const cipher = CryptoVault.encrypt(plain);
    expect(cipher).not.toContain('Schüttelfrost');
    expect(cipher.split(':')).toHaveLength(3);
    expect(CryptoVault.decrypt(cipher)).toBe(plain);
  });

  it('erzeugt für denselben Klartext unterschiedliche Chiffrate (zufälliger IV)', () => {
    expect(CryptoVault.encrypt('gleich')).not.toBe(CryptoVault.encrypt('gleich'));
  });

  it('erkennt Manipulation am Chiffrat (Auth-Tag)', () => {
    const [iv, tag, data] = CryptoVault.encrypt('geheim').split(':');
    const tampered = `${iv}:${tag}:${data?.startsWith('0') ? '1' : '0'}${data?.slice(1)}`;
    expect(() => CryptoVault.decrypt(tampered)).toThrow();
  });

  it('lehnt ungültige Formate ab', () => {
    expect(() => CryptoVault.decrypt('kein-chiffrat')).toThrow('Ungültiges Chiffrat-Format');
  });

  it('behandelt leere optionale Werte als null', () => {
    expect(CryptoVault.encryptOptional('')).toBeNull();
    expect(CryptoVault.encryptOptional(undefined)).toBeNull();
    expect(CryptoVault.decryptOptional(null)).toBeNull();
  });
});
