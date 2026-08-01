import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  ModalController,
} from '@ionic/angular/standalone';

import { TimerService } from '../../services/timer.service';
import { RulesService } from '../../services/rules.service';
import { StoreService } from '../../services/store.service';
import { Knot } from '../../models/knot.model';

@Component({
  selector: 'app-focus-timer-modal',
  templateUrl: './focus-timer-modal.component.html',
  styleUrls: ['./focus-timer-modal.component.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  ],
})
export class FocusTimerModalComponent implements OnInit, OnDestroy {
  @Input() knotId!: string;

  knot!: Knot;
  timeLabel = '05:00';
  timerClass = 'timer-green';
  secondsLeft = 300;
  totalSeconds = 300;
  finished = false;
  celebrating = false;
  confettiItems: string[] = [];

  // Selector de minutos
  editingMinutes = false;
  selectedMinutes = 5;
  readonly minuteOptions = [1, 2, 3, 5, 10, 15, 20, 25, 30];

  private sub!: Subscription;

  constructor(
    public timer: TimerService,
    private rules: RulesService,
    private store: StoreService,
    private modal: ModalController,
  ) {}

  ngOnInit(): void {
    this.knot = this.store.getKnotById(this.knotId)!;
    this.selectedMinutes = Math.round(this.timer.snapshot.totalSeconds / 60) || 5;

    this.sub = this.timer.state$.subscribe(s => {
      this.secondsLeft = s.secondsLeft;
      this.totalSeconds = s.totalSeconds;
      this.timeLabel = this.timer.formatTime(s.secondsLeft);
      this.timerClass = this.timer.timerClass(s.secondsLeft, s.totalSeconds);
      if (!s.running && s.endAt > 0 && s.secondsLeft <= 0) {
        this.finished = true;
        this.onTimerFinished();
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  get step(): string {
    return this.knot?.nextStep ?? 'Hacé cualquier avance mínimo';
  }

  /** Click en el display del timer — abre/cierra selector */
  toggleEditMinutes(): void {
    if (this.finished) return;
    this.editingMinutes = !this.editingMinutes;
  }

  /** Selecciona minutos y reinicia el timer */
  selectMinutes(min: number): void {
    this.selectedMinutes = min;
    this.editingMinutes = false;
    this.finished = false;
    this.timer.stop('CHANGE_DURATION');
    this.timer.start(this.knotId, min);
  }

  repeatTimer(): void {
    this.finished = false;
    this.editingMinutes = false;
    this.timer.stop('REPEAT');
    this.timer.start(this.knotId, this.selectedMinutes);
  }

  pause(): void {
    this.timer.stop('PAUSE_FROM_FOCUS');
    try { this.rules.transitionToPauseDoing(this.knotId); } catch (_) {}
    this.modal.dismiss(null, 'paused');
  }

  async markDone(): Promise<void> {
    this.celebrating = true;
    this.confettiItems = this.generateConfetti();
    if ('vibrate' in navigator) navigator.vibrate([50, 30, 80]);
    this.playBeep();

    setTimeout(() => {
      this.timer.stop('DONE_FROM_FOCUS');
      this.rules.transitionToDone(this.knotId, true);
      this.modal.dismiss(null, 'done');
    }, 1000);
  }

  private generateConfetti(): string[] {
    const colors = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#ef4444', '#0891b2'];
    return Array.from({ length: 24 }, (_, i) => {
      const color = colors[i % colors.length];
      const left = Math.random() * 100;
      const delay = Math.random() * 0.4;
      const size = 6 + Math.random() * 8;
      const duration = 0.6 + Math.random() * 0.4;
      return `left:${left}%;animation-delay:${delay}s;background:${color};width:${size}px;height:${size}px;animation-duration:${duration}s`;
    });
  }

  dismiss(): void {
    this.modal.dismiss();
  }

  // ─── Feedback al terminar ────────────────────────────────────────────────

  private onTimerFinished(): void {
    // Vibración: patrón corto-corto-largo
    if ('vibrate' in navigator) navigator.vibrate([100, 80, 100, 80, 300]);
  }

  private playBeep(): void {
    try {
      const audio = new Audio('assets/sounds/timer_done.wav');
      audio.play();
    } catch (_) {
      // Audio no disponible — falla silenciosamente
    }
  }
}
