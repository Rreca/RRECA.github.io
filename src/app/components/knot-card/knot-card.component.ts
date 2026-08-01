import { Component, Input, Output, EventEmitter, OnInit, ElementRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonCard, IonCardContent, IonButton, IonIcon,
  IonRange, IonBadge, ModalController, AlertController,
  GestureController, Gesture,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  play, pause, checkmark, pencil, trash, chevronUp, chevronDown, hammer,
} from 'ionicons/icons';

import { Knot } from '../../models/knot.model';
import { RulesService } from '../../services/rules.service';
import { StoreService } from '../../services/store.service';
import { ChainService } from '../../services/chain.service';
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
  swipeIndicator: 'done' | 'someday' | null = null;
  notesExpanded = false;
  newNote = '';

  private debounce: ReturnType<typeof setTimeout> | null = null;
  private gesture!: Gesture;

  constructor(
    private rules: RulesService,
    private store: StoreService,
    private chainService: ChainService,
    public ctx: ContextService,
    private timer: TimerService,
    private modal: ModalController,
    private alert: AlertController,
    private el: ElementRef,
    private gestureCtrl: GestureController,
    private zone: NgZone,
  ) {
    addIcons({ play, pause, checkmark, pencil, trash, chevronUp, chevronDown, hammer });
  }

  ngOnInit(): void {
    this.friction = this.rules.getFriction(this.knot);
    this.impact = this.rules.getImpact(this.knot);
    this.score = this.rules.priorityScore(this.knot);
    this.setupSwipeGesture();
  }

  private setupSwipeGesture(): void {
    // Only enable swipe for DOING and UNLOCKABLE
    if (this.knot.status !== 'DOING' && this.knot.status !== 'UNLOCKABLE') return;

    const card = this.el.nativeElement.querySelector('ion-card');
    if (!card) return;

    const THRESHOLD = 80;

    this.gesture = this.gestureCtrl.create({
      el: card,
      gestureName: 'knot-swipe',
      direction: 'x',
      threshold: 15,
      onMove: (detail) => {
        const x = detail.deltaX;
        card.style.transform = `translateX(${x}px)`;
        card.style.opacity = String(1 - Math.abs(x) / 300);

        this.zone.run(() => {
          if (x > THRESHOLD) this.swipeIndicator = 'done';
          else if (x < -THRESHOLD) this.swipeIndicator = 'someday';
          else this.swipeIndicator = null;
        });
      },
      onEnd: (detail) => {
        const x = detail.deltaX;
        card.style.transition = 'transform 0.2s, opacity 0.2s';
        card.style.transform = 'translateX(0)';
        card.style.opacity = '1';
        setTimeout(() => { card.style.transition = ''; }, 200);

        this.zone.run(() => {
          if (x > THRESHOLD) {
            // Swipe right → mark done
            this.timer.stop('SWIPE_DONE');
            this.completeDone(true);
          } else if (x < -THRESHOLD) {
            // Swipe left → move to someday
            this.rules.transitionToSomeday(this.knot.id);
            this.refresh.emit();
          }
          this.swipeIndicator = null;
        });
      },
    });
    this.gesture.enable(true);
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

  get chainIndicator(): { position: number; total: number; name: string } | null {
    if (!this.knot.chainId) return null;
    const chain = this.chainService.getChainById(this.knot.chainId);
    if (!chain) return null;
    const total = this.chainService.getChainSize(this.knot.chainId);
    const position = (this.knot.chainOrder ?? 0) + 1; // 1-based
    return { position, total, name: chain.name };
  }

  get chainNameTruncated(): string {
    const info = this.chainIndicator;
    if (!info) return '';
    return info.name.length > 20 ? info.name.substring(0, 20) + '…' : info.name;
  }

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

  // ─── Notas / mini-log ──────────────────────────────────────────────────

  toggleNotes(): void {
    this.notesExpanded = !this.notesExpanded;
  }

  addNote(): void {
    const text = this.newNote.trim();
    if (!text) return;
    const notes = [...(this.knot.notes || []), text];
    this.store.updateKnot({ id: this.knot.id, notes });
    this.knot.notes = notes;
    this.newNote = '';
  }

  deleteNote(index: number): void {
    const notes = [...(this.knot.notes || [])];
    notes.splice(index, 1);
    this.store.updateKnot({ id: this.knot.id, notes });
    this.knot.notes = notes;
  }

  private async showAlert(header: string, message: string): Promise<void> {
    const a = await this.alert.create({ header, message, buttons: ['OK'] });
    await a.present();
  }
}
