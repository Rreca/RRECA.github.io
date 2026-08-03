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
import { FocusTimerModalComponent } from '../components/focus-timer-modal/focus-timer-modal.component';
import { GistSyncService } from '../services/gist-sync.service';
import TimerPlugin from '../plugins/timer-plugin';
import { Platform } from '@ionic/angular/standalone';

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
    private platform: Platform,
  ) {
    addIcons({ today, barChart, add, cloudUpload, cloudDownload });
  }

  ngOnInit(): void {
    this.subs.push(
      this.timer.state$.subscribe(s => {
        this.timerRunning = s.running;
        if (s.running) {
          this.timerLabel = `⏱ ${this.timer.formatTime(s.secondsLeft)}`;
          // Auto-open focus if timer started from outside (widget/notification)
          this.tryOpenFocusForRunningTimer(s.knotId);
        }
      }),
      this.store.knots$.subscribe(() => {
        this.canCapture = this.rules.canCaptureNewKnot().canCapture;
      }),
      this.ctx.filter$.subscribe(f => (this.activeFilter = f)),
    );

    // Listen for widget open-focus intent (when app is already running)
    if (this.platform.is('android')) {
      TimerPlugin.addListener('openFocus', (event) => {
        this.openFocusFromWidget(event.knotId);
      });
      // Cold start: if a timer is running natively, open focus modal automatically
      setTimeout(() => this.autoOpenFocusIfTimerRunning(), 2000);
      setTimeout(() => this.autoOpenFocusIfTimerRunning(), 4000);
      // And on resume (app was in background)
      this.platform.resume.subscribe(() => {
        this.focusAlreadyOpened = false; // Reset on resume to allow re-open
        setTimeout(() => this.autoOpenFocusIfTimerRunning(), 500);
      });
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.focusAlreadyOpened = false;
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

  private async openFocusFromWidget(knotId: string): Promise<void> {
    // Navigate to today tab first (in case user was on insights)
    this.router.navigateByUrl('/today');
    const m = await this.modal.create({
      component: FocusTimerModalComponent,
      componentProps: { knotId },
    });
    await m.present();
  }

  private focusAlreadyOpened = false;

  /** Called from timer state subscription when timer is running */
  private tryOpenFocusForRunningTimer(knotId: string | null): void {
    if (this.focusAlreadyOpened) return;
    if (!this.platform.is('android')) return;
    // knotId null = synced from native (widget/notification start), not from local timer.start()
    // In that case, autoOpenFocusIfTimerRunning will handle it via setTimeout
    // If knotId is set, it was started locally — the UI already handles the modal
    if (knotId) return;
    // Trigger the auto-open check
    this.autoOpenFocusIfTimerRunning();
  }

  private async autoOpenFocusIfTimerRunning(): Promise<void> {
    if (this.focusAlreadyOpened) return;
    try {
      const state = await TimerPlugin.getState();
      if (state.running) {
        // Timer is running natively — find the knot and open focus modal
        // First try pending focus intent for the knot ID
        const pending = await TimerPlugin.consumePendingFocus();
        let knotId = pending.pending ? pending.knotId : null;

        // If no pending intent, try to find the DOING knot
        if (!knotId) {
          const doingKnot = this.store.getKnots().find(k => k.status === 'DOING');
          knotId = doingKnot?.id ?? null;
        }

        if (knotId && this.store.getKnotById(knotId)) {
          this.focusAlreadyOpened = true;
          this.openFocusFromWidget(knotId);
        }
      }
    } catch (_) {
      // Plugin not available — ignore
    }
  }
}
