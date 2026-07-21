import { Injectable } from '@angular/core';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import { StoreService } from './store.service';

export interface TimerState {
  running: boolean;
  knotId: string | null;
  endAt: number;
  secondsLeft: number;
  totalSeconds: number;  // base para calcular % de color
}

@Injectable({ providedIn: 'root' })
export class TimerService {
  private stateSubject = new BehaviorSubject<TimerState>({
    running: false,
    knotId: null,
    endAt: 0,
    secondsLeft: 300,
    totalSeconds: 300,
  });
  readonly state$ = this.stateSubject.asObservable();

  private tickSub: Subscription | null = null;

  constructor(private store: StoreService) {}

  get snapshot(): TimerState {
    return this.stateSubject.value;
  }

  /** minutes: cantidad de minutos a cronometrar (default 5) */
  start(knotId: string, minutes = 5): void {
    this.stop('NEW_START');
    const totalSeconds = minutes * 60;
    const endAt = Date.now() + totalSeconds * 1000;

    this.stateSubject.next({ running: true, knotId, endAt, secondsLeft: totalSeconds, totalSeconds });
    this.store.logEvent('TIMER_5MIN_START', { knotId, minutes });

    this.tickSub = interval(300).subscribe(() => this.tick());
  }

  stop(reason = 'STOP'): void {
    this.tickSub?.unsubscribe();
    this.tickSub = null;

    if (this.stateSubject.value.running) {
      this.store.logEvent('TIMER_5MIN_STOP', { reason });
    }

    this.stateSubject.next({
      running: false,
      knotId: null,
      endAt: 0,
      secondsLeft: 0,
      totalSeconds: this.stateSubject.value.totalSeconds,
    });
  }

  private tick(): void {
    const { running, endAt } = this.stateSubject.value;
    if (!running) return;

    const left = Math.max(0, endAt - Date.now());
    const secondsLeft = Math.ceil(left / 1000);

    this.stateSubject.next({ ...this.stateSubject.value, secondsLeft });

    if (secondsLeft <= 0) {
      this.tickSub?.unsubscribe();
      this.tickSub = null;
      this.stateSubject.next({ ...this.stateSubject.value, running: false });
    }
  }

  /** Formatea MM:SS */
  formatTime(seconds: number): string {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  /**
   * Clase CSS proporcional al total configurado:
   *   Verde:   75%–100% del tiempo restante  (primer cuarto transcurrido)
   *   Naranja: 25%–75%  del tiempo restante  (mitad del tiempo)
   *   Rojo:    0%–25%   del tiempo restante  (último cuarto)
   */
  timerClass(secondsLeft: number, totalSeconds: number): string {
    const pct = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;
    if (pct > 0.75) return 'timer-green';
    if (pct > 0.25) return 'timer-yellow';
    return 'timer-red';
  }
}
