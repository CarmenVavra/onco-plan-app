// Baut Frontend und Backend und packt alles für ein Plesk-Webhosting (Phusion Passenger)
// nach deploy/oncoplan.zip. Aufruf aus der Projektwurzel: `npm run deploy:package`
//
// Inhalt des Pakets (Struktur bleibt erhalten, weil das Backend das Frontend
// relativ über ../../frontend/dist/frontend/browser ausliefert):
//   backend/   app.js (Startdatei), dist/, prisma/schema.prisma, package.json, .env*
//   frontend/  dist/frontend/browser/
// * nur wenn deploy/production.env existiert (nie im Git-Repository).
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deployDir = path.join(root, 'deploy');
const out = path.join(deployDir, 'oncoplan');
const zipFile = path.join(deployDir, 'oncoplan.zip');
const prodEnv = path.join(deployDir, 'production.env');

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

console.log('▸ Frontend bauen …');
run('npm run build', path.join(root, 'frontend'));

console.log('▸ Backend bauen …');
rmSync(path.join(root, 'backend', 'dist'), { recursive: true, force: true });
run('npm run build', path.join(root, 'backend'));

console.log('▸ Paket zusammenstellen …');
rmSync(out, { recursive: true, force: true });
rmSync(zipFile, { force: true });
const backendOut = path.join(out, 'backend');
mkdirSync(path.join(backendOut, 'prisma'), { recursive: true });
mkdirSync(path.join(backendOut, 'public'), { recursive: true });

cpSync(path.join(root, 'backend', 'dist'), path.join(backendOut, 'dist'), { recursive: true });
cpSync(path.join(root, 'backend', 'app.js'), path.join(backendOut, 'app.js'));
cpSync(path.join(root, 'backend', 'prisma', 'schema.prisma'), path.join(backendOut, 'prisma', 'schema.prisma'));
cpSync(path.join(root, 'backend', 'package-lock.json'), path.join(backendOut, 'package-lock.json'));
cpSync(
  path.join(root, 'frontend', 'dist', 'frontend', 'browser'),
  path.join(out, 'frontend', 'dist', 'frontend', 'browser'),
  { recursive: true },
);
// Dokumentenstamm für Plesk – bleibt leer, alles liefert die Node-App aus.
writeFileSync(path.join(backendOut, 'public', '.keep'), '');
// Plesk wählt die Node-Version über nodenv. Ohne diese Datei findet `npm install`
// in Install-Skripten kein `node` (z. B. nach dem Löschen des Anwendungsordners).
writeFileSync(path.join(backendOut, '.node-version'), '22\n');

// Server-package.json: nur Laufzeitabhängigkeiten plus Prisma-CLI, damit
// "NPM install" in Plesk den Prisma-Client für das Server-Linux erzeugt.
const pkg = JSON.parse(readFileSync(path.join(root, 'backend', 'package.json'), 'utf8'));
const serverPkg = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  description: pkg.description,
  main: 'app.js',
  scripts: {
    postinstall: 'prisma generate',
    start: 'node app.js',
  },
  dependencies: { ...pkg.dependencies, prisma: pkg.devDependencies.prisma },
};
writeFileSync(path.join(backendOut, 'package.json'), JSON.stringify(serverPkg, null, 2) + '\n');

if (existsSync(prodEnv)) {
  cpSync(prodEnv, path.join(backendOut, '.env'));
  console.log('  .env aus deploy/production.env übernommen');
} else {
  console.warn('  ⚠ deploy/production.env fehlt – .env muss auf dem Server angelegt werden');
}

console.log('▸ ZIP erstellen …');
// tar (Windows 10+ bzw. bsdtar) schreibt ZIP-Pfade mit "/" – wichtig für Linux-Server.
const tar = process.platform === 'win32' ? `"${process.env.SystemRoot}\\System32\\tar.exe"` : 'tar';
if (process.platform === 'win32') {
  run(`${tar} -a -c -f "${zipFile}" backend frontend`, out);
} else {
  run(`zip -qr "${zipFile}" backend frontend`, out);
}
console.log(`✔ Fertig: ${path.relative(root, zipFile)}`);
