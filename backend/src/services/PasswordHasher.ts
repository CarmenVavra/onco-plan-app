import * as crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

/** Passwort-Hashing mit scrypt (Node-Bordmittel). Format: `scrypt:saltHex:hashHex`. */
export class PasswordHasher {
  static async hash(password: string): Promise<string> {
    const salt = crypto.randomBytes(16);
    const derived = await scrypt(password, salt, KEY_LENGTH);
    return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
  }

  static async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, saltHex, hashHex] = stored.split(':');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  }
}
