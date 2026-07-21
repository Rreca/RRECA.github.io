import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonCard, IonCardContent, IonButton, IonIcon,
  IonRange, IonBadge, ModalController, AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  play, pause, checkmark, pencil, trash, chevronUp, chevronDown, hammer,
} from 'ionicons/icons';

import { Knot } from '../../models/knot.model';
import { RulesService } from '../../services/rules.service';
import { StoreService } from '../../services/store.service';
import { ContextService } from '../../services/context.service';
import { TimerService } from '../../services/timer.service';
import { formatTimeAgo } from '../../utils/utils';
import { KnotDetailModalComponent } from '../knot-detail-modal/knot-detail-modal.component';
import { FocusTimerModalComponent } from '../focus-timer-modal/focus-timer-modal.component';
import { SplitKnotModalComponent } from '../split-knot-modal/split-knot-modal.component';
import { EditSomedayModalComponent } from '../edit-someday-modal/edit-someday-modal.component';

@Component({
  selector: 'app-knot-card',
  templateUrl: './knot-card.component.html',
  styleUrls: ['./knot-card.component.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonCard, IonCardContent, IonButton, IonIcon, IonRange, IonBadge,
  ],
})
export class KnotCardComponent implements OnInit {
  @Input() knot!: Knot;
  @Input() quickEditHidden = false;

  @Output() refresh = new EventEmitter<void>();

  friction = 3;
  impact = 3;
  score = 0;
  justDone = false; // activa animación de checkmark

  private debounce: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private rules: RulesService,
    private store: StoreService,
    public ctx: ContextService,
    private timer: TimerService,
    private modal: ModalController,
    private alert: AlertController,
  ) {
    addIcons({ play, pause, checkmark, pencil, trash, chevronUp, chevronDown, hammer });
  }

  ngOnInit(): void {
    this.friction = this.rules.getFriction(this.knot);
    this.impact = this.rules.getImpact(this.knot);
    this.score = this.rules.priorityScore(this.knot);
  }

  get statusLabel(): string {
    const map: Record<string, string> = {
      BLOCKED: 'BLOQUEADO', UNLOCKABLE: 'DESBLOQUEABLE', DOING: 'EN PROGRESO',
      DONE: 'HECHO', SOMEDAY: 'ALGÚN DÍA', ARCHIVED: 'ARCHIVADO',
    };
    return map[this.knot.status] ?? this.knot.status;
  }

  get statusClass(): string {
    const map: Record<string, string> = {
      BLOCKED: 'blocked', UNLOCKABLE: 'unlockable', DOING: 'doing',
      DONE: 'done', SOMEDAY: 'someday', ARCHIVED: 'archived',
    };
    return map[this.knot.status] ?? '';
  }

  get reasonLabel(): string {
    const map: Record<string, string> = {
      NO_START: 'No sé por dónde empezar', LAZINESS: 'Pereza', FEAR: 'Miedo',
      EXTERNAL: 'Depende de un externo', NOT_TODAY: 'No hoy',
    };
    return map[this.knot.blockReason] ?? this.knot.blockReason;
  }

  get scoreLabel(): string {
    if (this.score >= 3) return 'HACÉLO YA';
    if (this.score <= -2) return 'DIVIDIR';
    return '';
  }

  get scoreBadgeClass(): string {
    if (this.score >= 3) return 'hot';
    if (this.score <= -2) return 'split';
    return '';
  }

  get knotContext() { return this.ctx.getKnotContext(this.knot); }
  get knotContextIcon(): string { return this.ctx.contextIcon(this.knotContext); }
  get knotContextLabel(): string { return this.ctx.contextLabel(this.knotContext); }
  get knotContextClass(): string { return this.ctx.contextBadgeClass(this.knotContext); }
  get lastTouched(): string { return formatTimeAgo(this.knot.lastTouchedAt); }

  // ─── Sliders ────────────────────────────────────────────────────────────

  onSliderChange(): void {
    this.score = this.impact - this.friction;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.store.updateKnot({ id: this.knot.id, weight: this.friction, impact: this.impact });
      this.store.logEvent('QUICK_EDIT', { knotId: this.knot.id, friction: this.friction, impact: this.impact });
      this.refresh.emit();
    }, 200);
  }

  // ─── Acciones ────────────────────────────────────────────────────────────

  async openDetail(event: Event): Promise<void> {
    event.stopPropagation();
    const m = await this.modal.create({
      component: KnotDetailModalComponent,
      componentProps: { knotId: this.knot.id },
      breakpoints: [0, 0.9, 1],
      initialBreakpoint: 0.9,
    });
    await m.present();
    await m.onDidDismiss();
    this.refresh.emit();
  }

  async startDoing(event: Event): Promise<void> {
    event.stopPropagation();
    try {
      this.rules.transitionToDoing(this.knot.id);
      this.refresh.emit();
    } catch (err) {
      await this.showAlert('No se puede iniciar', (err as Error).message);
    }
  }

  async startTimer(event: Event): Promise<void> {
    event.stopPropagation();
    this.timer.start(this.knot.id);
    await this.openFocusModal();
  }

  async openFocusModal(): Promise<void> {
    const m = await this.modal.create({
      component: FocusTimerModalComponent,
      componentProps: { knotId: this.knot.id },
    });
    await m.present();
    await m.onDidDismiss();
    this.refresh.emit();
  }

  async pauseDoing(event: Event): Promise<void> {
    event.stopPropagation();
    this.timer.stop('PAUSE_FROM_CARD');
    try {
      this.rules.transitionToPauseDoing(this.knot.id);
      this.refresh.emit();
    } catch (err) {
      await this.showAlert('No se puede pausar', (err as Error).message);
    }
  }

  async markDone(event: Event): Promise<void> {
    event.stopPropagation();
    this.timer.stop('DONE_FROM_CARD');
    this.completeDone(true);
  }

  private completeDone(feltLighter: boolean): void {
    // Vibración corta de éxito
    if ('vibrate' in navigator) navigator.vibrate([50, 30, 80]);

    // Animación checkmark antes de desaparecer
    this.justDone = true;
    setTimeout(() => {
      this.rules.transitionToDone(this.knot.id, feltLighter);
      this.refresh.emit();
    }, 600);
  }

  async sendToSomeday(event: Event): Promise<void> {
    event.stopPropagation();
    this.rules.transitionToSomeday(this.knot.id);
    this.refresh.emit();
  }

  async openSplit(event: Event): Promise<void> {
    event.stopPropagation();
    const m = await this.modal.create({
      component: SplitKnotModalComponent,
      componentProps: { knotId: this.knot.id },
    });
    await m.present();
    await m.onDidDismiss();
    this.refresh.emit();
  }

  async openEditSomeday(event: Event): Promise<void> {
    event.stopPropagation();
    const m = await this.modal.create({
      component: EditSomedayModalComponent,
      componentProps: { knotId: this.knot.id },
      breakpoints: [0, 0.7],
      initialBreakpoint: 0.7,
    });
    await m.present();
    await m.onDidDismiss();
    this.refresh.emit();
  }

  async convertToUnlockable(event: Event): Promise<void> {
    event.stopPropagation();
    if (!this.rules.canMoveToUnlockable()) {
      await this.showAlert('Sin cupo', 'Ya tenés 3 DESBLOQUEABLES.');
      return;
    }
    const knot = this.store.getKnotById(this.knot.id);
    if (!knot) return;
    this.store.updateKnot({
      id: this.knot.id,
      status: 'UNLOCKABLE',
      nextStep: knot.nextStep || 'Hacer 1 paso mínimo',
      estMinutes: knot.estMinutes || 5,
      blockReason: knot.blockReason === 'NOT_TODAY' ? 'NO_START' : knot.blockReason,
    });
    this.refresh.emit();
  }

  async deleteKnot(event: Event): Promise<void> {
    event.stopPropagation();
    const a = await this.alert.create({
      header: '¿Eliminar?',
      message: 'Esta acción no se puede deshacer.',
      buttons: [
        { text: 'Eliminar', role: 'destructive', handler: () => { this.store.deleteKnot(this.knot.id); this.refresh.emit(); } },
        { text: 'Cancelar', role: 'cancel' },
      ],
    });
    await a.present();
  }

  async restoreArchived(event: Event): Promise<void> {
    event.stopPropagation();
    this.rules.restoreArchivedToSomeday(this.knot.id);
    this.refresh.emit();
  }

  private async showAlert(header: string, message: string): Promise<void> {
    const a = await this.alert.create({ header, message, buttons: ['OK'] });
    await a.present();
  }
}
