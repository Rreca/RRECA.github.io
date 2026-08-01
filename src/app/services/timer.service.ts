import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subscription, interval } from 'rxjs';
import { StoreService } from './store.service';
import { Platform } from '@ionic/angular/standalone';
import TimerPlugin from '../plugins/timer-plugin';

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

  constructor(
    private store: StoreService,
    private zone: NgZone,
    private platform: Platform,
  ) {
    TimerPlugin.addListener('timerFinished', (_event) => {
      this.zone.run(() => {
        this.stopTick();
        this.stateSubject.next({
          ...this.stateSubject.value,
          running: false,
          secondsLeft: 0,
        });
      });
    });
    TimerPlugin.addListener('timerCancelled', (event) => {
      this.zone.run(() => {
        this.stopTick();
        this.stateSubject.next({
          ...this.stateSubject.value,
          running: false,
          secondsLeft: event.remainingSeconds,
        });
      });
    });

    // Sync with native timer state when app resumes (e.g. opened from widget/notification)
    if (this.platform.is('android')) {
      this.platform.resume.subscribe(() => this.syncNativeState());
      // Also sync on first load
      this.syncNativeState();
    }
  }

  /** Sync local state with running native timer (e.g. started from widget) */
  private async syncNativeState(): Promise<void> {
    try {
      const native = await TimerPlugin.getState();
      this.zone.run(() => {
        if (native.running && !this.stateSubject.value.running) {
          const endAt = Date.now() + native.remainingSeconds * 1000;
          this.stateSubject.next({
            running: true,
            knotId: this.stateSubject.value.knotId, // preserve if known
            endAt,
            secondsLeft: native.remainingSeconds,
            totalSeconds: native.totalSeconds,
          });
          this.stopTick();
          this.tickSub = interval(500).subscribe(() => this.tick());
        } else if (!native.running && this.stateSubject.value.running) {
          // Timer finished while app was in background
          this.stopTick();
          this.stateSubject.next({
            ...this.stateSubject.value,
            running: false,
            endAt: Date.now() - 1000, // mark as finished in the past
            secondsLeft: 0,
          });
        }
      });
    } catch (_) {
      // Plugin not available (web) — ignore
    }
  }

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

    const knot = this.store.getKnotById(knotId);
    TimerPlugin.start({ seconds: minutes * 60, title: knot?.title ?? 'Timer de enfoque' });

    // Tick local para actualizar la UI (la alarma real la maneja el nativo)
    this.tickSub = interval(500).subscribe(() => this.tick());
  }

  stop(reason = 'STOP'): void {
    this.stopTick();

    if (this.stateSubject.value.running) {
      this.store.logEvent('TIMER_5MIN_STOP', { reason });
      TimerPlugin.stop();
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
  }

  private stopTick(): void {
    this.tickSub?.unsubscribe();
    this.tickSub = null;
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
