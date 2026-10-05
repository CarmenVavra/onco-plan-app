/**
 * Startet einen lokalen, eingebetteten PostgreSQL-Server für die Entwicklung –
 * ohne Installation, ohne Docker. Daten liegen in backend/.pgdata (git-ignoriert).
 * Beenden mit Strg+C.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.resolve(here, '../.pgdata');
const port = Number(process.env.EMBEDDED_PG_PORT ?? 5433);

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'oncoplan',
  password: 'oncoplan',
  port,
  persistent: true,
  // UTF-8 erzwingen (Windows würde sonst WIN1252 wählen und z. B. Emojis in Notizen ablehnen)
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

const firstRun = !existsSync(path.join(databaseDir, 'PG_VERSION'));
if (firstRun) {
  console.log('Initialisiere Datenverzeichnis …');
  await pg.initialise();
}
await pg.start();
if (firstRun) {
  await pg.createDatabase('oncoplan');
}
console.log(`PostgreSQL läuft auf localhost:${port} (DB "oncoplan"). Beenden mit Strg+C.`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
