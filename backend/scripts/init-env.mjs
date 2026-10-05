/**
 * Legt backend/.env aus .env.example an (nur falls noch nicht vorhanden)
 * und ersetzt die Platzhalter-Schlüssel durch zufällig erzeugte Werte.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, '.env');

if (existsSync(target)) {
  // Ausgaben bewusst ASCII: Windows-Konsolen (start.bat) zeigen sonst Umlaute falsch an.
  console.log('backend/.env ist bereits vorhanden - unveraendert gelassen.');
  process.exit(0);
}

const content = readFileSync(path.join(root, '.env.example'), 'utf8')
  .replace('change-me-dev-only-jwt-secret-at-least-32-characters', randomBytes(48).toString('hex'))
  .replace(/^DATABASE_ENCRYPTION_KEY=0{64}$/m, `DATABASE_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`);

writeFileSync(target, content, 'utf8');
console.log('backend/.env wurde mit neuen Zufallsschluesseln angelegt.');
