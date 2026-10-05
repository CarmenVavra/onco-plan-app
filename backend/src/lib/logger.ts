/**
 * Schlanker strukturierter Logger. Gesundheitsdaten (Notizen, Messwerte, Namen)
 * dürfen NIE geloggt werden – nur IDs und technische Metadaten.
 */
type Level = 'info' | 'warn' | 'error';

function write(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
