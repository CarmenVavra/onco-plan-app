// Startdatei für Plesk / Phusion Passenger (z. B. netcup Webhosting).
// Passenger startet Node ohne `--env-file`, daher wird die .env hier geladen.
// Lokal weiterhin `npm start` bzw. `npm run dev` verwenden.
const path = require('node:path');

try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch (err) {
  // Ohne .env gelten die in Plesk gesetzten Umgebungsvariablen.
  if (err.code !== 'ENOENT') throw err;
}

require('./dist/server.js');
