import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel,
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonBadge, ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { today, barChart, add, cloudUpload, cloudDownload } from 'ionicons/icons';

import { TimerService } from '../services/timer.service';
import { RulesService } from '../services/rules.service';
import { StoreService } from '../services/store.service';
import { ContextService } from '../services/context.service';
import { ContextFilter } from '../models/knot.model';
import { CaptureModalComponent } from '../components/capture-modal/capture-modal.component';
import { GistConfigModalComponent } from '../components/gist-config-modal/gist-config-modal.component';
import { GistSyncService } from '../services/gist-sync.service';

@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.component.html',
  styleUrls: ['./tabs.component.scss'],
  standalone: true,
  imports: [
    CommonModule, RouterLink, RouterLinkActive,
    IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonBadge,
  ],
})
export class TabsComponent implements OnInit, OnDestroy {
  timerRunning = false;
  timerLabel = '';
  canCapture = false;
  activeFilter: ContextFilter = 'ALL';

  private subs: Subscription[] = [];

  constructor(
    public timer: TimerService,
    private rules: RulesService,
    private store: StoreService,
    private ctx: ContextService,
    private modal: ModalController,
    private gist: GistSyncService,
    private router: Router,
  ) {
    addIcons({ today, barChart, add, cloudUpload, cloudDownload });
  }

  ngOnInit(): void {
    this.subs.push(
      this.timer.state$.subscribe(s => {
        this.timerRunning = s.running;
        if (s.running) {
          this.timerLabel = `⏱ ${this.timer.formatTime(s.secondsLeft)}`;
        }
      }),
      this.store.knots$.subscribe(() => {
        this.canCapture = this.rules.canCaptureNewKnot().canCapture;
      }),
      this.ctx.filter$.subscribe(f => (this.activeFilter = f)),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  setFilter(f: string): void {
    this.ctx.setActiveFilter(f);
  }

  async openCapture(): Promise<void> {
    const result = this.rules.canCaptureNewKnot();
    if (!result.canCapture) {
      // El componente de captura maneja el mensaje de sistema lleno
    }
    const m = await this.modal.create({
      component: CaptureModalComponent,
      breakpoints: [0, 1],
      initialBreakpoint: 1,
    });
    await m.present();
    const { role } = await m.onDidDismiss();
    if (role === 'confirm') {
      this.router.navigateByUrl('/today');
    }
  }

  async openGistConfig(): Promise<void> {
    const m = await this.modal.create({ component: GistConfigModalComponent });
    await m.present();
  }
}
