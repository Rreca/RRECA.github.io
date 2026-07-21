import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  ModalController, AlertController,
} from '@ionic/angular/standalone';

import { StoreService } from '../../services/store.service';
import { ContextService } from '../../services/context.service';
import { RulesService } from '../../services/rules.service';
import { Knot, BlockReason } from '../../models/knot.model';

@Component({
  selector: 'app-edit-someday-modal',
  templateUrl: './edit-someday-modal.component.html',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  ],
})
export class EditSomedayModalComponent implements OnInit {
  @Input() knotId!: string;

  knot!: Knot;
  title = '';
  friction = 3;
  impact = 3;
  contextPick = 'AUTO';
  blockReason: BlockReason = 'NOT_TODAY';
  nextStep = '';
  estMinutes: number | null = null;
  externalWait = '';

  showNextStep = false;
  showEstMinutes = false;
  showExternalWait = false;

  constructor(
    private modal: ModalController,
    private alert: AlertController,
    private store: StoreService,
    private ctx: ContextService,
    private rules: RulesService,
  ) {}

  ngOnInit(): void {
    this.knot = this.store.getKnotById(this.knotId)!;
    this.title = this.knot.title;
    this.friction = this.rules.getFriction(this.knot);
    this.impact = this.rules.getImpact(this.knot);
    this.blockReason = this.knot.blockReason;
    this.nextStep = this.knot.nextStep ?? '';
    this.estMinutes = this.knot.estMinutes ?? null;
    this.externalWait = this.knot.externalWait ?? '';
    const src = this.ctx.getContextSource(this.knot);
    this.contextPick = src === 'MANUAL' ? this.ctx.getKnotContext(this.knot) : 'AUTO';
    this.refreshFields();
  }

  onReasonChange(): void {
    this.refreshFields();
  }

  private refreshFields(): void {
    const needsNext = ['NO_START', 'LAZINESS', 'FEAR'].includes(this.blockReason);
    this.showNextStep = needsNext;
    this.showEstMinutes = needsNext;
    this.showExternalWait = this.blockReason === 'EXTERNAL';
  }

  async save(): Promise<void> {
    if (!this.title.trim()) {
      const a = await this.alert.create({ header: 'Error', message: 'El título es obligatorio.', buttons: ['OK'] });
      await a.present();
      return;
    }

    const pick = this.contextPick.toUpperCase();
    if (pick === 'AUTO') {
      const autoCtx = this.ctx.suggestContext(this.title, this.nextStep);
      this.ctx.setKnotContextAuto(this.knotId, autoCtx);
    } else {
      this.ctx.setKnotContextManual(this.knotId, pick);
    }

    // Recalcular status según el motivo
    let newStatus: 'UNLOCKABLE' | 'BLOCKED' | 'SOMEDAY' = 'SOMEDAY';
    if (['NO_START', 'LAZINESS', 'FEAR'].includes(this.blockReason)) {
      newStatus = 'UNLOCKABLE';
    } else if (this.blockReason === 'EXTERNAL') {
      newStatus = 'BLOCKED';
    } else if (this.blockReason === 'NOT_TODAY') {
      newStatus = 'SOMEDAY';
    }

    this.store.updateKnot({
      id: this.knotId,
      title: this.title.trim(),
      weight: this.friction,
      impact: this.impact,
      blockReason: this.blockReason,
      status: newStatus,
      nextStep: this.nextStep.trim() || null,
      estMinutes: this.estMinutes,
      externalWait: this.externalWait.trim() || null,
      updatedAt: Date.now(),
    });

    this.modal.dismiss(null, 'saved');
  }

  dismiss(): void {
    this.modal.dismiss(null, 'cancel');
  }
}
