import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatCelsius } from '../../core/domain/format';
import { CRITICAL_FEVER_CELSIUS } from '../../core/domain/triage';

export interface TemperaturePoint {
  /** Achsenbeschriftung, z. B. "Mo" */
  label: string;
  /** Langtext für Screenreader, z. B. "Montag, 5.10." */
  longLabel: string;
  value: number | null;
}

/** Y-Skala 36–40 °C → Grenzwert 38,5 °C liegt bei 62,5 % */
const SCALE_MIN = 36;
const SCALE_MAX = 40;

@Component({
  selector: 'app-temperature-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="chart">
      <figcaption class="chart__head">
        <span class="chart__title">{{ title() }}</span>
        <span class="chart__legend">— Grenzwert 38,5 °C</span>
      </figcaption>
      <div class="chart__plot" aria-hidden="true">
        <div class="chart__threshold" [style.bottom.%]="thresholdPct"></div>
        @for (bar of bars(); track $index) {
          <div class="chart__col">
            <span class="chart__value" [class.chart__value--critical]="bar.critical">{{ bar.text }}</span>
            <div class="chart__bar" [class.chart__bar--critical]="bar.critical" [style.height.%]="bar.height"></div>
          </div>
        }
      </div>
      <div class="chart__days" aria-hidden="true">
        @for (bar of bars(); track $index) {
          <span>{{ bar.label }}</span>
        }
      </div>
      <!-- Zugängliche Datentabelle für Screenreader -->
      <table class="sr-only">
        <caption>{{ title() }}, Grenzwert 38,5 Grad Celsius</caption>
        <tr><th scope="col">Tag</th><th scope="col">Höchstwert</th></tr>
        @for (bar of bars(); track $index) {
          <tr>
            <td>{{ bar.longLabel }}</td>
            <td>{{ bar.value === null ? 'keine Messung' : bar.text + ' °C' + (bar.critical ? ' (über Grenzwert)' : '') }}</td>
          </tr>
        }
      </table>
    </figure>
  `,
  styleUrl: './temperature-chart.component.css',
})
export class TemperatureChartComponent {
  readonly points = input.required<TemperaturePoint[]>();
  readonly title = input('Körpertemperatur · 7 Tage');

  protected readonly thresholdPct = ((CRITICAL_FEVER_CELSIUS - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;

  protected readonly bars = computed(() =>
    this.points().map((p) => {
      const clamped = p.value === null ? null : Math.min(SCALE_MAX, Math.max(SCALE_MIN, p.value));
      return {
        ...p,
        text: p.value === null ? '–' : formatCelsius(p.value),
        critical: p.value !== null && p.value >= CRITICAL_FEVER_CELSIUS,
        height: clamped === null ? 0 : Math.max(4, ((clamped - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100),
      };
    }),
  );
}
