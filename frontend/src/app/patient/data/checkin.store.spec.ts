import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CheckinStore, TEMP_MAX, TEMP_MIN } from './checkin.store';

describe('CheckinStore', () => {
  let store: CheckinStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(CheckinStore);
    store.reset();
  });

  it('erhöht/senkt die Temperatur in 0,1-Schritten ohne Rundungsfehler', () => {
    store.temp.set(38.4);
    store.stepTemp(0.1);
    expect(store.temp()).toBe(38.5);
    expect(store.triageLevel()).toBe('RED');
    store.stepTemp(-0.1);
    expect(store.temp()).toBe(38.4);
    expect(store.triageLevel()).toBe('GREEN');
  });

  it('begrenzt die Temperatur auf den gültigen Bereich', () => {
    store.temp.set(TEMP_MAX);
    store.stepTemp(0.1);
    expect(store.temp()).toBe(TEMP_MAX);
    store.temp.set(TEMP_MIN);
    store.stepTemp(-0.1);
    expect(store.temp()).toBe(TEMP_MIN);
  });

  it('berechnet die Live-Triage aus den Eingaben', () => {
    store.pain.set(8);
    store.nausea.set(2);
    expect(store.triageLevel()).toBe('YELLOW');
  });
});
