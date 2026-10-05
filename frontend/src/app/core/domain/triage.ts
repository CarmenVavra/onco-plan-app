import type { TriageLevel } from '../models/api.models';

/**
 * Spiegel der Backend-Regel (backend/src/services/TriageEngine.ts) – NUR für
 * unmittelbares UI-Feedback und den Offline-Fall. Autoritativ ist der Server.
 */
export const CRITICAL_FEVER_CELSIUS = 38.5;
export const SEVERE_PAIN_LEVEL = 7;
export const RELEVANT_NAUSEA_LEVEL = 2;

export function evaluateTriageLevel(feverCelsius: number, painLevel: number, nauseaLevel: number): TriageLevel {
  if (feverCelsius >= CRITICAL_FEVER_CELSIUS) return 'RED';
  if (painLevel >= SEVERE_PAIN_LEVEL && nauseaLevel >= RELEVANT_NAUSEA_LEVEL) return 'YELLOW';
  return 'GREEN';
}

export const isCriticalFever = (celsius: number): boolean => celsius >= CRITICAL_FEVER_CELSIUS;

/** Übelkeitsskala 0–3 */
export const NAUSEA_LABELS = ['Keine', 'Leicht', 'Mittel', 'Schwer'] as const;

export function nauseaLabel(level: number): string {
  return NAUSEA_LABELS[level] ?? '–';
}

export const LEVEL_LABELS: Record<TriageLevel, string> = { RED: 'Rot', YELLOW: 'Gelb', GREEN: 'Grün' };
