import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton,
  IonButtons, IonSelect, IonSelectOption, ModalController, AlertController,
} from '@ionic/angular/standalone';

import { Knot } from '../../models/knot.model';
import { StoreService } from '../../services/store.service';
import { RulesService } from '../../services/rules.service';
import { ContextService } from '../../services/context.service';
import { formatTimeAgo } from '../../utils/utils';

@Component({
  selector: 'app-knot-detail-modal',
  templateUrl: './knot-detail-modal.component.html',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
    IonSelect, IonSelectOption,
  ],
})
export class KnotDetailModalComponent implements OnInit {
  @Input() knotId!: string;

  knot!: Knot;
  contextPick = 'AUTO';

  constructor(
    private modal: ModalController,
    private alert: AlertController,
    private store: StoreService,
    private rules: RulesService,
    public ctx: ContextService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const k = this.store.getKnotById(this.knotId);
    if (!k) { this.modal.dismiss(); return; }
    this.knot = k;
    const src = this.ctx.getContextSource(k);
    this.contextPick = src === 'MANUAL' ? this.ctx.getKnotContext(k) : 'AUTO';
  }

  get statusLabel(): string {
    const map: Record<string, string> = {
      BLOCKED: 'BLOQUEADO', UNLOCKABLE: 'DESBLOQUEABLE', DOING: 'EN PROGRESO',
      DONE: 'HECHO', SOMEDAY: 'ALGÚN DÍA', ARCHIVED: 'ARCHIVADO',
    };
    return map[this.knot.status] ?? this.knot.status;
  }

  get reasonLabel(): string {
    const map: Record<string, string> = {
      NO_START: 'No sé por dónde empezar', LAZINESS: 'Pereza', FEAR: 'Miedo',
      EXTERNAL: 'Depende de un externo', NOT_TODAY: 'No hoy',
    };
    return map[this.knot.blockReason] ?? this.knot.blockReason;
  }

  get friction(): number { return this.rules.getFriction(this.knot); }
  get impact(): number   { return this.rules.getImpact(this.knot); }
  get score(): number    { return this.rules.priorityScore(this.knot); }

  timeAgo(ts: number | null | undefined): string { return formatTimeAgo(ts ?? undefined); }

  saveContext(): void {
    const pick = this.contextPick.toUpperCase();
    if (pick === 'AUTO') {
      const auto = this.ctx.suggestContext(this.knot.title, this.knot.nextStep);
      this.ctx.setKnotContextAuto(this.knot.id, auto);
    } else {
      this.ctx.setKnotContextManual(this.knot.id, pick);
    }
    this.load();
  }

  async deleteKnot(): Promise<void> {
    const a = await this.alert.create({
      header: '¿Eliminar?',
      message: 'Esta acción no se puede deshacer.',
      buttons: [
        { text: 'Eliminar', role: 'destructive', handler: () => { this.store.deleteKnot(this.knot.id); this.modal.dismiss(null, 'deleted'); } },
        { text: 'Cancelar', role: 'cancel' },
      ],
    });
    await a.present();
  }

  restoreArchived(): void {
    this.rules.restoreArchivedToSomeday(this.knot.id);
    this.load();
  }

  dismiss(): void {
    this.modal.dismiss();
  }
}
