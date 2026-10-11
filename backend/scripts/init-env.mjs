/**
 * Legt backend/.env aus .env.example an (nur falls noch nicht vorhanden)
 * und ersetzt die Platzhalter-Schlüssel durch zufällig erzeugte Werte.
 * Einer bestehenden .env ohne VAPID-Schlüssel (Web-Push) wird ein neues Schlüsselpaar angehängt.
 */
import { createECDH, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, '.env');

/** VAPID-Schlüsselpaar (P-256) im base64url-Format, wie es web-push erwartet. */
function generateVapidKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  // Der private Schlüssel muss genau 32 Byte lang sein (führende Nullen auffüllen)
  const privateKey = Buffer.alloc(32);
  const raw = ecdh.getPrivateKey();
  raw.copy(privateKey, 32 - raw.length);
  return { publicKey: ecdh.getPublicKey().toString('base64url'), privateKey: privateKey.toString('base64url') };
}

// Ausgaben bewusst ASCII: Windows-Konsolen (start.bat) zeigen sonst Umlaute falsch an.
if (existsSync(target)) {
  const current = readFileSync(target, 'utf8');
  if (/^VAPID_PUBLIC_KEY=\S+/m.test(current)) {
    console.log('backend/.env ist bereits vorhanden - unveraendert gelassen.');
    process.exit(0);
  }
  const { publicKey, privateKey } = generateVapidKeys();
  const prefix = current.endsWith('\n') ? '' : '\n';
  appendFileSync(
    target,
    `${prefix}\n# Web-Push fuer Terminerinnerungen (automatisch ergaenzt)\nVAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n`,
    'utf8',
  );
  console.log('backend/.env um VAPID-Schluessel (Web-Push) ergaenzt.');
  process.exit(0);
}

const vapid = generateVapidKeys();
const content = readFileSync(path.join(root, '.env.example'), 'utf8')
  .replace('change-me-dev-only-jwt-secret-at-least-32-characters', randomBytes(48).toString('hex'))
  .replace(/^DATABASE_ENCRYPTION_KEY=0{64}$/m, `DATABASE_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`)
  .replace(/^VAPID_PUBLIC_KEY=$/m, `VAPID_PUBLIC_KEY=${vapid.publicKey}`)
  .replace(/^VAPID_PRIVATE_KEY=$/m, `VAPID_PRIVATE_KEY=${vapid.privateKey}`);

writeFileSync(target, content, 'utf8');
console.log('backend/.env wurde mit neuen Zufallsschluesseln angelegt.');
