import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import {
  IonContent, IonRefresher, IonRefresherContent,
  IonButton, IonItem, IonInput, IonLabel,
  AlertController, ModalController,
} from '@ionic/angular/standalone';

import { StoreService } from '../../services/store.service';
import { GoalService } from '../../services/goal.service';
import { RulesService } from '../../services/rules.service';
import { GistSyncService } from '../../services/gist-sync.service';
import { ContextService } from '../../services/context.service';
import { NotificationService } from '../../services/notification.service';
import { KnotCardComponent } from '../../components/knot-card/knot-card.component';
import { GistConfigModalComponent } from '../../components/gist-config-modal/gist-config-modal.component';
import { NotificationsSettingsModalComponent } from '../../components/notifications-settings-modal/notifications-settings-modal.component';
import { Knot } from '../../models/knot.model';
import { dayKey, dayLabel } from '../../utils/utils';

@Component({
  selector: 'app-insights',
  templateUrl: './insights.page.html',
  styleUrls: ['./insights.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonContent, IonRefresher, IonRefresherContent,
    IonButton, IonItem, IonInput, IonLabel,
    KnotCardComponent,
    NotificationsSettingsModalComponent,
  ],
})
export class InsightsPage implements OnInit, OnDestroy {
  // Record<string, number | undefined> para que el template pueda usar ?? 0
  counts: Record<string, number | undefined> = {};
  doneToday = 0;
  dailyGoal = 1;
  goalInput = 1;
  streak = 0;
  goalMet = false;
  momentumDays: { label: string; count: number; pct: number }[] = [];
  archivedKnots: Knot[] = [];
  archivedOpen = false;
  archivedGroups: {
    day: string;
    label: string;
    reasons: {
      reason: string;
      items: { knot: Knot; children: { knot: Knot; statusLabel: string; statusClass: string }[] }[]
    }[]
  }[] = [];
  splitThisWeek = 0;

  private sub!: Subscription;
  private filterSub!: Subscription;

  constructor(
    private store: StoreService,
    private goal: GoalService,
    private rules: RulesService,
    private gist: GistSyncService,
    private ctx: ContextService,
    private notifService: NotificationService,
    private alert: AlertController,
    private modal: ModalController,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.sub = this.store.knots$.subscribe(() => this.render());
    this.filterSub = this.ctx.filter$.subscribe(() => this.render());
    this.render();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.filterSub?.unsubscribe();
  }

  render(): void {
    const allKnots = this.store.getKnots();
    const filter = this.ctx.getActiveFilter();
    const knots = allKnots.filter(k => this.ctx.isKnotVisibleInFilter(k, filter));

    this.counts = {};
    for (const s of ['BLOCKED', 'UNLOCKABLE', 'DOING', 'DONE', 'SOMEDAY', 'ARCHIVED']) {
      this.counts[s] = knots.filter(k => k.status === s).length;
    }

    this.doneToday = this.goal.countDoneToday(knots);
    this.dailyGoal = this.goal.getDailyGoal();
    this.goalInput = this.dailyGoal;
    this.goalMet = this.doneToday >= this.dailyGoal;    this.streak = this.goal.getCurrentStreak(knots);
    this.splitThisWeek = this.goal.countArchivedSplitsThisWeek(knots);

    // Momentum bars
    const days = this.goal.getDoneByDayLast7Days(knots);
    const max = Math.max(1, ...days.map(d => d.count));
    this.momentumDays = days.map(d => ({
      label: d.date.toLocaleDateString('es-AR', { weekday: 'short' }),
      count: d.count,
      pct: Math.round((d.count / max) * 100),
    }));

    // Archivados
    this.archivedKnots = knots.filter(k => k.status === 'ARCHIVED');
    this.buildArchivedGroups();
  }

  private buildArchivedGroups(): void {
    const allKnots = this.store.getKnots();
    const byDay: Record<string, Record<string, Knot[]>> = {};

    this.archivedKnots.forEach(k => {
      const ts = k.archivedAt ?? k.updatedAt ?? Date.now();
      const key = dayKey(ts);
      const reason = k.archiveReason ?? 'OTHER';
      if (!byDay[key]) byDay[key] = {};
      if (!byDay[key][reason]) byDay[key][reason] = [];
      byDay[key][reason].push(k);
    });

    this.archivedGroups = Object.keys(byDay)
      .sort((a, b) => (a < b ? 1 : -1))
      .map(day => ({
        day,
        label: dayLabel(day),
        reasons: Object.keys(byDay[day]).sort().map(r => ({
          reason: r,
          items: byDay[day][r]
            .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0))
            .map(knot => ({
              knot,
              children: r === 'SPLIT'
                ? allKnots
                    .filter(c => c.parentId === knot.id)
                    .sort((a, b) => a.createdAt - b.createdAt)
                    .map(c => ({
                      knot: c,
                      statusLabel: this.statusToEs(c.status),
                      statusClass: c.status.toLowerCase(),
                    }))
                : [],
            })),
        })),
      }));
  }

  saveGoal(): void {
    this.goal.setDailyGoal(this.goalInput);
    this.render();
  }

  statusToEs(code: string): string {
    const map: Record<string, string> = {
      BLOCKED: 'BLOQUEADO', UNLOCKABLE: 'DESBLOQUEABLE', DOING: 'EN PROGRESO',
      DONE: 'HECHO', SOMEDAY: 'ALGÚN DÍA', ARCHIVED: 'ARCHIVADO',
    };
    return map[code] ?? code;
  }

  // ─── Export / Import ─────────────────────────────────────────────────────

  exportData(): void {
    this.store.exportData();
  }

  async importData(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        this.store.importData(text);
        const a = await this.alert.create({ header: 'Importado', message: 'Datos importados correctamente.', buttons: ['OK'] });
        await a.present();
      } catch (err) {
        const a = await this.alert.create({ header: 'Error', message: (err as Error).message, buttons: ['OK'] });
        await a.present();
      }
    };
    input.click();
  }

  // ─── Gist ────────────────────────────────────────────────────────────────

  async openGistConfig(): Promise<void> {
    const m = await this.modal.create({ component: GistConfigModalComponent });
    await m.present();
  }

  async cloudSave(): Promise<void> {
    try {
      await this.gist.saveToGist();
      await this.showToast('Guardado en Gist ✅');
    } catch (err) {
      const a = await this.alert.create({ header: 'Error', message: (err as Error).message, buttons: ['OK'] });
      await a.present();
    }
  }

  async cloudLoad(): Promise<void> {
    try {
      const payload = await this.gist.loadFromGist();
      this.gist.applyPayload(payload);
      this.render();
      await this.showToast('Cargado desde Gist ✅');
    } catch (err) {
      const a = await this.alert.create({ header: 'Error', message: (err as Error).message, buttons: ['OK'] });
      await a.present();
    }
  }

  // ─── Archivados ──────────────────────────────────────────────────────────

  async openArchivedDetail(knot: Knot): Promise<void> {
    const { KnotDetailModalComponent } = await import('../../components/knot-detail-modal/knot-detail-modal.component');
    const m = await this.modal.create({
      component: KnotDetailModalComponent,
      componentProps: { knotId: knot.id },
      breakpoints: [0, 0.9, 1],
      initialBreakpoint: 0.9,
    });
    await m.present();
    await m.onDidDismiss();
    this.render();
  }

  // ─── Reset ───────────────────────────────────────────────────────────────

  async resetAll(): Promise<void> {
    const a1 = await this.alert.create({
      header: '⚠ Reset total',
      message: 'Esto borra TODOS tus nudos y configuración local. No se puede deshacer.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Continuar', role: 'destructive', handler: () => this.confirmReset() },
      ],
    });
    await a1.present();
  }

  private async confirmReset(): Promise<void> {
    const a2 = await this.alert.create({
      header: 'Confirmación final',
      message: 'Escribí BORRAR para confirmar.',
      inputs: [{ name: 'confirm', type: 'text', placeholder: 'BORRAR' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Borrar todo',
          role: 'destructive',
          handler: (data: { confirm: string }) => {
            if ((data.confirm ?? '').trim().toUpperCase() === 'BORRAR') {
              this.store.resetAll();
              this.render();
            }
          },
        },
      ],
    });
    await a2.present();
  }

  private async showToast(msg: string): Promise<void> {
    const a = await this.alert.create({ header: msg, buttons: ['OK'] });
    await a.present();
  }

  // ─── Navegación desde conteos ────────────────────────────────────────────

  navigateToStatus(status: string): void {
    if (status === 'ARCHIVED') {
      // Abre el accordion de archivados en esta misma pantalla
      this.archivedOpen = true;
      setTimeout(() => {
        const el = document.getElementById('section-archived');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return;
    }
    // Para todos los demás va a Hoy con scroll a la sección
    this.router.navigate(['/today'], { queryParams: { scrollTo: status } });
  }

  handleRefresh(event: CustomEvent): void {
    this.render();
    (event.target as HTMLIonRefresherElement).complete();
  }

  // ─── Notificaciones ──────────────────────────────────────────────────────

  get notifEnabled(): boolean {
    return this.notifService.getSettings().enabled;
  }

  async openNotifSettings(): Promise<void> {
    const m = await this.modal.create({
      component: NotificationsSettingsModalComponent,
      breakpoints: [0, 1],
      initialBreakpoint: 1,
    });
    await m.present();
  }

  async sendTestNotification(): Promise<void> {
    await this.notifService.sendTestNotification();
    const a = await this.alert.create({
      header: '🔔 Notificación de prueba',
      message: 'Vas a recibir una notificación en 5 segundos. Cerrá la app para verla.',
      buttons: ['OK'],
    });
    await a.present();
  }
}
