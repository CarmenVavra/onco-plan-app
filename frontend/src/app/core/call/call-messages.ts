/** Gründe, aus denen der Server einen Anruf beendet (Spiegel: backend/src/services/CallService.ts) */
export type CallEndReason = 'hangup' | 'declined' | 'timeout' | 'disconnected' | 'answered-elsewhere';

export type CallStartError = 'NOT_FOUND' | 'UNREACHABLE' | 'BUSY' | 'ALREADY_IN_CALL' | 'INVALID';

/** Lokale Gründe (Gerät, Netzwerk) zusätzlich zu den Server-Gründen */
export type CallEndCause = CallEndReason | 'self' | 'failed' | 'no-microphone' | 'no-connection' | CallStartError;

export type CallRole = 'caller' | 'callee';

/** „03:12“ bzw. „1:02:05“ */
export function formatCallDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Verständliche Meldung zum Ende eines Anrufs – aus Sicht der anrufenden (Ärzt:in)
 * bzw. angerufenen Person (Patient:in). `durationMs` ist null, wenn nie gesprochen wurde.
 */
export function callEndMessage(cause: CallEndCause, role: CallRole, durationMs: number | null): string {
  if (durationMs !== null && (cause === 'hangup' || cause === 'self' || cause === 'disconnected')) {
    return `Anruf beendet · ${formatCallDuration(durationMs)}`;
  }
  switch (cause) {
    case 'declined':
      return role === 'caller' ? 'Der Anruf wurde abgelehnt.' : 'Anruf abgelehnt.';
    case 'timeout':
      return role === 'caller' ? 'Niemand hat abgenommen.' : 'Verpasster Anruf.';
    case 'UNREACHABLE':
      return 'Die Person ist gerade nicht in der App erreichbar. Bitte per Telefon anrufen.';
    case 'BUSY':
      return 'Die Person telefoniert gerade bereits über OncoPlan.';
    case 'ALREADY_IN_CALL':
      return 'Sie führen bereits einen Anruf.';
    case 'NOT_FOUND':
    case 'INVALID':
      return 'Anruf nicht möglich.';
    case 'no-microphone':
      return 'Kein Zugriff auf das Mikrofon. Bitte im Browser erlauben und erneut versuchen.';
    case 'no-connection':
      return 'Keine Verbindung zum Server. Bitte Internetverbindung prüfen.';
    case 'failed':
      return 'Die Verbindung konnte nicht aufgebaut werden – das Netzwerk blockiert vermutlich Anrufe. Bitte per Telefon anrufen.';
    case 'disconnected':
      return 'Die Verbindung wurde unterbrochen.';
    case 'answered-elsewhere':
      return 'Auf einem anderen Gerät angenommen.';
    case 'hangup':
      return role === 'caller' ? 'Aufgelegt.' : 'Anruf beendet.';
    case 'self':
      return 'Anruf beendet.';
  }
}
