import { randomInt } from 'node:crypto';

/** Ohne leicht verwechselbare Zeichen (0/O, 1/l/I), damit das Passwort gut diktierbar ist. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * Einmaliges Startpasswort für neue Patient:innen, z. B. "Kx7m-Pq4r-T9wz"
 * (12 Zufallszeichen ≈ 70 Bit, kryptografisch sicher erzeugt).
 */
export function generateInitialPassword(): string {
  const groups = Array.from({ length: 3 }, () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''),
  );
  return groups.join('-');
}
