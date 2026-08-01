import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDropList, CdkDrag, CdkDragHandle, CdkDragDrop } from '@angular/cdk/drag-drop';
import { ModalController, AlertController, IonButton } from '@ionic/angular/standalone';

import { Chain } from '../../models/chain.model';
import { Knot } from '../../models/knot.model';
import { ChainService } from '../../services/chain.service';
import { RulesService } from '../../services/rules.service';
import { TimerService } from '../../services/timer.service';
import { FocusTimerModalComponent } from '../focus-timer-modal/focus-timer-modal.component';
import { KnotDetailModalComponent } from '../knot-detail-modal/knot-detail-modal.component';

@Component({
  selector: 'app-chain-view',
  templateUrl: './chain-view.component.html',
  styleUrls: ['./chain-view.component.scss'],
  standalone: true,
  imports: [CommonModule, IonButton, CdkDropList, CdkDrag, CdkDragHandle],
})
export class ChainViewComponent {
  @Input() chains: Chain[] = [];
  @Output() knotTapped = new EventEmitter<string>();
  @Output() refresh = new EventEmitter<void>();

  constructor(
    private chainService: ChainService,
    private rulesService: RulesService,
    private timerService: TimerService,
    private modalController: ModalController,
    private alertController: AlertController,
  ) {}

  getKnots(chainId: string): Knot[] {
    return this.chainService.getChainKnots(chainId);
  }

  async onNodeTap(knotId: string): Promise<void> {
    const modal = await this.modalController.create({
      component: KnotDetailModalComponent,
      componentProps: { knotId },
    });
    await modal.present();
    await modal.onDidDismiss();
    this.refresh.emit();
  }

  async startKnot(knotId: string, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      this.rulesService.transitionToDoing(knotId);
      this.refresh.emit();
    } catch (error: any) {
      const alert = await this.alertController.create({
        message: error.message,
        buttons: ['OK'],
      });
      await alert.present();
    }
  }

  markDone(knotId: string, event: Event): void {
    event.stopPropagation();
    this.rulesService.transitionToDone(knotId, true);
    this.refresh.emit();
  }

  async openTimer(knotId: string, event: Event): Promise<void> {
    event.stopPropagation();
    this.timerService.start(knotId);
    const modal = await this.modalController.create({
      component: FocusTimerModalComponent,
      componentProps: { knotId },
    });
    await modal.present();
  }

  getNodeState(knot: Knot, chainId: string): 'active' | 'done' | 'pending' {
    if (knot.status === 'DONE') {
      return 'done';
    }
    const knots = this.getKnots(chainId);
    const firstNonDone = knots.find(k => k.status !== 'DONE');
    if (firstNonDone && firstNonDone.id === knot.id) {
      return 'active';
    }
    return 'pending';
  }

  isAllDone(chainId: string): boolean {
    const knots = this.getKnots(chainId);
    return knots.length > 0 && knots.every(k => k.status === 'DONE');
  }

  onDrop(chainId: string, event: CdkDragDrop<Knot[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    try {
      this.chainService.reorderKnot(chainId, event.previousIndex, event.currentIndex);
      this.refresh.emit();
    } catch (err: any) {
      // Revert handled by Angular re-render from refresh
      this.refresh.emit();
    }
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      BLOCKED: 'BLOQUEADO',
      UNLOCKABLE: 'DESBLOQUEABLE',
      DOING: 'EN PROGRESO',
      DONE: 'HECHO',
      SOMEDAY: 'ALGÚN DÍA',
      ARCHIVED: 'ARCHIVADO',
    };
    return map[status] ?? status;
  }
}
