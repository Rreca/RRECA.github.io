import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  ModalController, AlertController,
} from '@ionic/angular/standalone';

import { StoreService } from '../../services/store.service';
import { RulesService } from '../../services/rules.service';
import { ContextService } from '../../services/context.service';
import { Knot, KnotContext } from '../../models/knot.model';
import { generateUUID } from '../../utils/utils';

@Component({
  selector: 'app-split-knot-modal',
  templateUrl: './split-knot-modal.component.html',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  ],
})
export class SplitKnotModalComponent implements OnInit {
  @Input() knotId!: string;

  knot!: Knot;
  step1 = '';
  step2 = '';
  ctx1 = 'AUTO';
  ctx2 = 'AUTO';

  constructor(
    private modal: ModalController,
    private alert: AlertController,
    private store: StoreService,
    private rules: RulesService,
    private ctx: ContextService,
  ) {}

  ngOnInit(): void {
    this.knot = this.store.getKnotById(this.knotId)!;
  }

  get parentContextLabel(): string {
    return this.ctx.contextLabel(this.ctx.getKnotContext(this.knot));
  }

  async submit(): Promise<void> {
    if (!this.step1.trim() && !this.step2.trim()) {
      const a = await this.alert.create({ header: 'Error', message: 'Escribí al menos un micro paso.', buttons: ['OK'] });
      await a.present();
      return;
    }

    const parentCtx = this.ctx.getKnotContext(this.knot);
    const steps = [
      { title: this.step1.trim(), pick: this.ctx1 },
      { title: this.step2.trim(), pick: this.ctx2 },
    ].filter(s => !!s.title);

    steps.forEach(s => {
      const pv = s.pick.toUpperCase();
      let context: KnotContext = parentCtx;
      let contextSource: 'AUTO' | 'MANUAL' = 'AUTO';

      if (['HOME', 'STREET', 'WORK', 'ANY'].includes(pv)) {
        context = this.ctx.normalizeContext(pv);
        contextSource = 'MANUAL';
      }

      const unlockableCount = this.store.getKnots().filter(k => k.status === 'UNLOCKABLE').length;
      const newKnot: Knot = {
        id: generateUUID(),
        title: s.title,
        status: unlockableCount >= 3 ? 'SOMEDAY' : 'UNLOCKABLE',
        blockReason: 'NO_START',
        context,
        contextSource,
        weight: 2,
        impact: Math.max(2, this.rules.getImpact(this.knot) - 1),
        nextStep: s.title,
        estMinutes: 5,
        externalWait: null,
        parentId: this.knotId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastTouchedAt: Date.now(),
      };

      this.store.createKnot(newKnot);
    });

    // Archivar el nudo original
    this.rules.archiveKnot(this.knotId, 'SPLIT');
    this.modal.dismiss(null, 'split');
  }

  dismiss(): void {
    this.modal.dismiss(null, 'cancel');
  }
}
