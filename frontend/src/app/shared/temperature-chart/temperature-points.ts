import { weekdayShort } from '../../core/domain/format';
import type { DailyTemperature, SymptomHistoryEntry } from '../../core/models/api.models';
import type { TemperaturePoint } from './temperature-chart.component';

const pad = (n: number): string => String(n).padStart(2, '0');

function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTemperaturePoints(days: DailyTemperature[]): TemperaturePoint[] {
  return days.map((d) => {
    const [, m, day] = d.date.split('-');
    return { label: weekdayShort(d.date), longLabel: `${weekdayShort(d.date)}, ${Number(day)}.${Number(m)}.`, value: d.maxCelsius };
  });
}

/** Tageshöchstwerte der letzten 7 Kalendertage (inkl. heute) aus der Check-in-Historie. */
export function dailyMaxFromHistory(entries: SymptomHistoryEntry[], now = new Date()): DailyTemperature[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i);
    const iso = localIsoDate(day);
    const values = entries.filter((e) => localIsoDate(new Date(e.loggedAt)) === iso).map((e) => e.feverCelsius);
    return { date: iso, maxCelsius: values.length ? Math.max(...values) : null };
  });
}
