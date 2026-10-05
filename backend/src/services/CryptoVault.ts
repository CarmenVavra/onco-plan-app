import * as crypto from 'node:crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 Bit – Standard für GCM
const KEY = Buffer.from(env.DATABASE_ENCRYPTION_KEY, 'hex');

/**
 * Application-Layer-Spaltenverschlüsselung (AES-256-GCM).
 * Gespeichertes Format: `ivHex:authTagHex:cipherHex`.
 */
export class CryptoVault {
  static encrypt(plainText: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /** Wirft, wenn der Datensatz manipuliert wurde (Auth-Tag ungültig). */
  static decrypt(payload: string): string {
    const [ivHex, tagHex, dataHex] = payload.split(':');
    if (!ivHex || !tagHex || dataHex === undefined) {
      throw new Error('Ungültiges Chiffrat-Format');
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  }

  static encryptOptional(plainText: string | null | undefined): string | null {
    return plainText ? CryptoVault.encrypt(plainText) : null;
  }

  static decryptOptional(payload: string | null | undefined): string | null {
    return payload ? CryptoVault.decrypt(payload) : null;
  }
}
