import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton,
  IonItem, IonLabel, IonInput, IonSelect, IonSelectOption,
  IonButtons, ModalController, AlertController,
} from '@ionic/angular/standalone';

import { StoreService } from '../../services/store.service';
import { RulesService } from '../../services/rules.service';
import { ContextService } from '../../services/context.service';
import { ChainService } from '../../services/chain.service';
import { Knot, KnotContext, BlockReason } from '../../models/knot.model';
import { Chain } from '../../models/chain.model';
import { generateUUID } from '../../utils/utils';

@Component({
  selector: 'app-capture-modal',
  templateUrl: './capture-modal.component.html',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButton,
    IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonButtons,
  ],
})
export class CaptureModalComponent implements OnInit {
  title = '';
  blockReason: BlockReason = 'NO_START';
  contextPick = 'AUTO';
  nextStep = '';
  estMinutes: number | null = 5;
  externalWait = '';
  friction = 3;
  impact = 3;

  showNextStep = true;
  showEstMinutes = true;
  showExternalWait = false;

  systemFullMessage = '';

  // Chain selection fields
  chainOption: 'none' | 'new' | 'existing' = 'none';
  newChainName = '';
  selectedChainId: string | null = null;
  chainNameError = '';
  chainCapacityError = '';

  constructor(
    private modal: ModalController,
    private alert: AlertController,
    private store: StoreService,
    private rules: RulesService,
    private ctx: ContextService,
    private chainService: ChainService,
  ) {}

  ngOnInit(): void {
    const result = this.rules.canCaptureNewKnot();
    if (!result.canCapture) {
      this.systemFullMessage = result.message;
    }
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

  get chains(): Chain[] {
    return this.chainService.getChains().sort((a, b) => b.createdAt - a.createdAt);
  }

  getChainKnotCount(chainId: string): number {
    return this.chainService.getChainSize(chainId);
  }

  async submit(): Promise<void> {
    if (this.systemFullMessage) return;

    // Chain validation
    this.chainNameError = '';
    this.chainCapacityError = '';

    if (this.chainOption === 'new') {
      const trimmed = this.newChainName.trim();
      if (trimmed.length === 0) {
        this.chainNameError = 'El nombre de la cadena no puede estar vacío.';
        return;
      }
      if (trimmed.length > 50) {
        this.chainNameError = 'El nombre no puede exceder 50 caracteres.';
        return;
      }
    }

    if (this.chainOption === 'existing') {
      if (!this.selectedChainId) {
        this.chainCapacityError = 'Seleccioná una cadena.';
        return;
      }
      const count = this.getChainKnotCount(this.selectedChainId);
      if (count >= 50) {
        this.chainCapacityError = 'Esta cadena alcanzó su capacidad máxima (50 nudos).';
        return;
      }
    }

    try {
      // Resolver contexto
      let context: KnotContext = 'ANY';
      let contextSource: 'AUTO' | 'MANUAL' = 'AUTO';

      const pick = this.contextPick.toUpperCase();
      if (['HOME', 'STREET', 'WORK', 'ANY'].includes(pick)) {
        context = this.ctx.normalizeContext(pick);
        contextSource = 'MANUAL';
      } else {
        // AUTO: hereda filtro activo o heurística
        const f = this.ctx.getActiveFilter();
        if (f !== 'ALL') {
          context = this.ctx.normalizeContext(f);
        } else {
          context = this.ctx.suggestContext(this.title, this.nextStep);
        }
        contextSource = 'AUTO';
      }

      const knot: Knot = {
        id: generateUUID(),
        title: this.title.trim(),
        status: '' as Knot['status'],
        blockReason: this.blockReason,
        context,
        contextSource,
        weight: this.friction,
        impact: this.impact,
        nextStep: this.nextStep.trim() || null,
        estMinutes: this.estMinutes,
        externalWait: this.externalWait.trim() || null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastTouchedAt: Date.now(),
      };

      const validated = this.rules.validateNewKnot(knot);
      this.store.createKnot(validated);

      // Wire chain association after knot creation
      if (this.chainOption === 'new') {
        const chain = this.chainService.createChain(this.newChainName);
        this.chainService.addKnotToChain(validated.id, chain.id);
      } else if (this.chainOption === 'existing' && this.selectedChainId) {
        this.chainService.addKnotToChain(validated.id, this.selectedChainId);
      }

      await this.modal.dismiss(null, 'confirm');
    } catch (err) {
      const a = await this.alert.create({
        header: 'Error',
        message: (err as Error).message,
        buttons: ['OK'],
      });
      await a.present();
    }
  }

  dismiss(): void {
    this.modal.dismiss(null, 'cancel');
  }
}
