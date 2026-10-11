// Richtet die Produktionsdatenbank ein: Schema übertragen (prisma db push) und,
// mit `--seed`, Demo-Daten einspielen. Verbindung und Schlüssel kommen aus
// deploy/production.env – derselbe DATABASE_ENCRYPTION_KEY wie auf dem Server ist
// Pflicht, sonst kann der Server die verschlüsselten Seed-Notizen nicht lesen.
//
//   npm run deploy:db            nur Schema (Daten bleiben erhalten)
//   npm run deploy:db -- --seed  Schema + Demo-Daten (LÖSCHT alle vorhandenen Daten!)
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'backend');

process.loadEnvFile(path.join(root, 'deploy', 'production.env'));
if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? '')) {
  console.error('DATABASE_URL in deploy/production.env ist noch nicht gesetzt.');
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { cwd: backend, stdio: 'inherit', env: process.env });

console.log('▸ Schema übertragen …');
run('npx prisma db push --skip-generate');

if (process.argv.includes('--seed')) {
  console.log('▸ Demo-Daten einspielen …');
  run('npx tsx prisma/seed.ts');
}
console.log('✔ Datenbank bereit');
